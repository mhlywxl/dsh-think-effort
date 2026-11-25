/**
 * Opt-in debug journal and the Host routes that serve it to the browser half.
 *
 * <h2>Why a journal instead of a log line</h2>
 *
 * The plugin already writes each decision to the Host log (`trace`). A person
 * watching the conversation cannot see that log, and the interesting event —
 * "this request asked for `auto` and went out as `max`" — is produced per model
 * request inside the adapter facade. So the Host half appends every decision to
 * a small in-memory ring buffer while the debug switch is on, and the browser
 * half polls these routes and renders the buffer as a floating log over the
 * conversation (including subagent sessions, which share the one Host process).
 *
 * <h2>Contract</h2>
 *
 * - The journal is a bounded ring buffer of JSON-safe records; it lives only in
 *   Host memory and never touches the session log, so turning the switch off
 *   leaves no trace and no migration behind.
 * - Every route answers `enabled: false` while the switch is off. The switch is
 *   the live config reference, so the browser half notices a save immediately.
 * - Reads are `GET …?since=<seq>`; the answer is a delta plus the buffer's
 *   current bounds, so a client that fell behind can discard its view instead of
 *   showing a gap. `POST …/clear` empties the buffer (guarded by a header, so a
 *   cross-site form post cannot reach it).
 *
 * @module dsh-think-effort/debug
 */

/** Exact route the browser half polls. */
export const DEBUG_PATH = '/think-effort/debug';
/** Exact route that empties the journal. */
export const DEBUG_CLEAR_PATH = '/think-effort/debug/clear';
/** Header a clear request must carry, so a cross-site form post cannot reach it. */
export const DEBUG_CLEAR_HEADER = 'x-think-effort-debug';
/** Records kept before the oldest ones are dropped. */
export const DEBUG_LIMIT = 300;

/** JSON response helper for a raw Node route handler. */
function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text)),
  };
  if (typeof response.writeHead === 'function') response.writeHead(status, headers);
  response.end(text);
}

/**
 * Whether a request comes from this application's own page.
 *
 * The custom route sits outside the `/api` bridge, so it has no cookie
 * authentication of its own. Browsers send `Sec-Fetch-Site` on every request
 * they make; a cross-site request is refused, while a missing header (an older
 * engine, or the desktop page's own transport) is admitted — the Host binds to
 * loopback in every shipped composition.
 * @param {object} request Node request.
 * @returns {boolean} true when the request may read the journal.
 */
function sameOrigin(request) {
  const site = request?.headers?.['sec-fetch-site'];
  return typeof site !== 'string' || site === 'same-origin' || site === 'none';
}

/**
 * Create the bounded in-memory journal.
 * @param {object} [options] overrides for tests.
 * @param {number} [options.limit] records to keep.
 * @param {() => number} [options.now] clock, so records are deterministic in tests.
 * @returns {object} the journal.
 */
export function createDebugJournal({ limit = DEBUG_LIMIT, now = () => Date.now() } = {}) {
  /** @type {Array<object>} */
  const records = [];
  /** Monotone sequence; survives `clear()` so a client's cursor never replays. */
  let seq = 0;

  return {
    /** Highest sequence ever appended. */
    get latest() {
      return seq;
    },
    /** Records currently buffered. */
    get size() {
      return records.length;
    },
    /**
     * Append one record.
     * @param {string} kind record type: `request`, `config` or `capability`.
     * @param {object} [fields] JSON-safe fields of the record.
     * @returns {number} the record's sequence number.
     */
    record(kind, fields = {}) {
      seq += 1;
      records.push({ seq, at: now(), kind, ...fields });
      if (records.length > limit) records.splice(0, records.length - limit);
      return seq;
    },
    /**
     * Read the records after a cursor.
     * @param {number} [since] last sequence the caller already has.
     * @returns {{latest: number, oldest: number|null, reset: boolean, entries: object[]}} the delta.
     */
    snapshot(since = 0) {
      const cursor = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
      const oldest = records.length > 0 ? records[0].seq : null;
      // The cursor names a record the buffer no longer holds: the caller must
      // replace its view instead of appending a delta with a hole in it.
      const reset = cursor > 0 && oldest !== null && cursor + 1 < oldest;
      return {
        latest: seq,
        oldest,
        reset,
        entries: records.filter((entry) => entry.seq > cursor),
      };
    },
    /** Empty the buffer; the sequence keeps counting so clients stay consistent. */
    clear() {
      records.length = 0;
      return seq;
    },
  };
}

/**
 * Register the debug routes on the Host web server.
 *
 * The plugin owns both routes through one Cordis effect, so disabling the bundle
 * removes the endpoints instead of leaving live handlers behind.
 *
 * @param {object} webCtx context providing `webServer`.
 * @param {object} options wiring.
 * @param {object} options.journal the journal to serve.
 * @param {() => boolean} options.enabled live debug switch.
 * @returns {() => void} disposer removing both routes.
 */
export function registerDebugRoutes(webCtx, { journal, enabled }) {
  const disposers = [];
  try {
    disposers.push(webCtx.webServer.register({
      kind: 'exact',
      path: DEBUG_PATH,
      handler(request, response) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          sendJson(response, 405, { ok: false, error: 'method' });
          return;
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'origin' });
          return;
        }
        if (enabled() !== true) {
          sendJson(response, 200, { ok: true, enabled: false, latest: journal.latest, oldest: null, reset: false, entries: [] });
          return;
        }
        let since = 0;
        try {
          const url = new URL(String(request.url ?? '/'), 'http://dsh.invalid');
          since = Number(url.searchParams.get('since') ?? '0');
        } catch {
          /* an unparseable URL reads from the beginning */
        }
        sendJson(response, 200, { ok: true, enabled: true, ...journal.snapshot(since) });
      },
    }));
    disposers.push(webCtx.webServer.register({
      kind: 'exact',
      path: DEBUG_CLEAR_PATH,
      handler(request, response) {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'method' });
          return;
        }
        if (!sameOrigin(request) || request.headers?.[DEBUG_CLEAR_HEADER] !== '1') {
          sendJson(response, 403, { ok: false, error: 'origin' });
          return;
        }
        sendJson(response, 200, { ok: true, latest: journal.clear() });
      },
    }));
  } catch (error) {
    for (const dispose of disposers) dispose?.();
    throw error;
  }
  return () => {
    for (const dispose of disposers) dispose?.();
  };
}
