/**
 * Debug journal and route contract: the browser half's floating log depends on
 * these two answers being stable — the delta a client can append, and the
 * `enabled` flag that makes the switch authoritative on the Host side.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEBUG_CLEAR_HEADER,
  DEBUG_CLEAR_PATH,
  DEBUG_PATH,
  createDebugJournal,
  registerDebugRoutes,
} from '../src/debug.js';

/** A web server stand-in that records exact routes. */
function fakeWeb() {
  const routes = new Map();
  return {
    routes,
    webServer: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`);
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  };
}

/** Invoke one raw Node route handler and decode its JSON answer. */
function call(route, { method = 'GET', url = DEBUG_PATH, headers = {} } = {}) {
  const chunks = [];
  let status = 0;
  let responseHeaders = {};
  const response = {
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus;
      responseHeaders = nextHeaders ?? {};
    },
    end(text) {
      if (typeof text === 'string' && text !== '') chunks.push(text);
    },
  };
  route.handler({ method, url, headers }, response);
  return { status, headers: responseHeaders, body: chunks.length > 0 ? JSON.parse(chunks.join('')) : null };
}

test('the journal appends, pages by cursor, and keeps its sequence across a clear', () => {
  let clock = 1000;
  const journal = createDebugJournal({ limit: 3, now: () => (clock += 1) });
  assert.deepEqual(journal.snapshot(0), { latest: 0, oldest: null, reset: false, entries: [] });

  journal.record('request', { applied: 'high' });
  journal.record('config', { enabled: true });
  const delta = journal.snapshot(0);
  assert.equal(delta.latest, 2);
  assert.equal(delta.oldest, 1);
  assert.equal(delta.reset, false);
  assert.deepEqual(delta.entries.map((entry) => entry.kind), ['request', 'config']);
  assert.equal(delta.entries[0].at, 1001);

  // The cursor pages: only records after it.
  assert.deepEqual(journal.snapshot(1).entries.map((entry) => entry.seq), [2]);

  // A bounded ring drops the oldest record; a cursor that still names a
  // buffered record keeps appending, and one below the buffer is told to reset.
  journal.record('request', { applied: 'low' });
  journal.record('request', { applied: 'max' });
  assert.equal(journal.size, 3);
  const reachable = journal.snapshot(1);
  assert.equal(reachable.reset, false, 'record 2 is still buffered, so there is no gap');
  assert.deepEqual(reachable.entries.map((entry) => entry.seq), [2, 3, 4]);
  journal.record('request', { applied: 'high' });
  const stale = journal.snapshot(1);
  assert.equal(stale.reset, true);
  assert.equal(stale.oldest, 3);

  const cleared = journal.clear();
  assert.equal(cleared, 5);
  assert.equal(journal.snapshot(0).latest, 5, 'the sequence never rewinds, so a client cursor stays meaningful');
  assert.deepEqual(journal.snapshot(0).entries, []);
});

test('the read route answers enabled:false while the switch is off', () => {
  const web = fakeWeb();
  const journal = createDebugJournal();
  journal.record('request', { applied: 'high' });
  const dispose = registerDebugRoutes(web, { journal, enabled: () => false });
  const answer = call(web.routes.get(DEBUG_PATH));
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  assert.equal(answer.body.enabled, false);
  assert.deepEqual(answer.body.entries, [], 'an off switch exposes no history');
  assert.equal(answer.body.latest, 1);
  dispose();
  assert.equal(web.routes.size, 0, 'one disposer removes both routes');
});

test('the read route serves the journal delta while the switch is on', () => {
  const web = fakeWeb();
  const journal = createDebugJournal();
  journal.record('request', { applied: 'high', sessionId: 'root-1' });
  journal.record('request', { applied: 'low', subagent: true, parentSession: 'root-1' });
  registerDebugRoutes(web, { journal, enabled: () => true });
  const route = web.routes.get(DEBUG_PATH);

  const first = call(route, { url: `${DEBUG_PATH}?since=0` });
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.body.enabled, true);
  assert.equal(first.body.entries.length, 2);
  assert.equal(first.body.entries[1].subagent, true);

  const second = call(route, { url: `${DEBUG_PATH}?since=2` });
  assert.deepEqual(second.body.entries, []);
  assert.equal(second.body.latest, 2);

  const wrongMethod = call(route, { method: 'POST' });
  assert.equal(wrongMethod.status, 405);

  const crossSite = call(route, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);

  const sameSite = call(route, { headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(sameSite.status, 200);
});

test('the clear route needs the header and keeps the sequence monotone', () => {
  const web = fakeWeb();
  const journal = createDebugJournal();
  journal.record('request', { applied: 'high' });
  registerDebugRoutes(web, { journal, enabled: () => true });
  const clearRoute = web.routes.get(DEBUG_CLEAR_PATH);

  assert.equal(call(clearRoute, { method: 'GET' }).status, 405);
  assert.equal(call(clearRoute, { method: 'POST' }).status, 403, 'a cross-site form post cannot clear the journal');
  const cleared = call(clearRoute, { method: 'POST', headers: { [DEBUG_CLEAR_HEADER]: '1' } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.latest, 1);
  assert.equal(journal.size, 0);
});

test('a duplicate route registration is reported, not half-installed', () => {
  const web = fakeWeb();
  registerDebugRoutes(web, { journal: createDebugJournal(), enabled: () => true });
  assert.throws(() => registerDebugRoutes(web, { journal: createDebugJournal(), enabled: () => true }));
  // The first registration still owns the path.
  assert.equal(call(web.routes.get(DEBUG_PATH)).status, 200);
});
