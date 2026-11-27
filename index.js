/**
 * Host half of `dsh-think-effort` — declarative automatic thinking depth for
 * DeepSeek routes in DeepSeek Harness.
 *
 * <h2>What this half does</h2>
 *
 * 1. **Declares the DeepSeek capability** (opt-in, idempotent). A gateway model
 *    such as `deepseek-v4.1-flash-1017` reaches DSH through a hand-declared
 *    `llm-pi-ai` route, so pi-ai's installed catalog has no reasoning metadata
 *    for it: no level control appears, and any level DSH tried to send would be
 *    refused. This half therefore writes the declaration the endpoint and model
 *    imply (`low | high | max`, default `high`) into the route's own settings
 *    surface. A model that already carries `reasoningEfforts` — including an
 *    explicit `false` — is never touched.
 * 2. **Advertises `auto`** in the model selector by wrapping each registered
 *    adapter's `resolveModel`, so the switcher lists `auto` before the declared
 *    levels.
 * 3. **Resolves the request's effort** just before dispatch, inside the same
 *    adapter facade: `auto` becomes the declared default (`high` for DeepSeek),
 *    a cheap host-owned call (session title, compaction, auto-review) becomes
 *    `low` when the model declares it, and an explicit user pick is passed
 *    through untouched.
 *
 * <h2>Why the adapter facade</h2>
 *
 * DSH fixes the step's model selection before any plugin waterfall sees it, and
 * `llm/stream` listeners cannot replace `GenerateOptions` (`next()` takes no
 * arguments and the options are frozen). The adapter registry entry is the one
 * seam that sees the very options the provider will receive, so the facade is
 * where a per-request effort decision belongs. It also keeps the durable
 * selection honest: a session that selected `auto` keeps saying `auto`, and the
 * concrete depth is applied per request, which is what makes the choice survive
 * retries and compaction unchanged.
 *
 * The facade writes nothing into a third party's adapter object: it replaces
 * the registry entry and forwards every other member bound to the inner
 * adapter.
 *
 * @module dsh-think-effort
 */

import z from '@deepseek-ai/schemastery';

import {
  DEFAULT_CONFIG,
  isAuxPurpose,
  normalizeConfig,
  planCapabilitySection,
  resolveCallEffort,
  shouldDeclare,
  withAutoEffort,
} from './src/policy.js';
import { createAdaptivePolicy } from './src/adaptive.js';
import { buildParallelPolicy } from './src/parallel.js';
import { createDebugJournal, registerDebugRoutes } from './src/debug.js';

/** The llm-pi-ai settings entry id in a composed profile. */
const PI_AI_NAMESPACE = 'llm-pi-ai';

/**
 * The row's complete tuning surface, exposed to Settings as a live form.
 *
 * Every field is volatile: the plugin manager page edits one row and the
 * running policy must follow without remounting the adapter facade, so the
 * values arrive as references and are re-read on `loader/volatile-update`.
 * Defaults mirror `cordis.patch.yml` and {@link DEFAULT_CONFIG}.
 */
export const Config = z.object({
  /** Master switch for the whole policy. */
  enabled: z.boolean().default(true).volatile(),
  /** Declare `reasoningEfforts` for matched models that carry none. */
  declareCapability: z.boolean().default(true).volatile(),
  /** Endpoint suffixes treated as an official DeepSeek host. */
  deepseekHosts: z.array(z.string()).default([...DEFAULT_CONFIG.deepseekHosts]).volatile(),
  /** Model-id test for hand-declared gateways. */
  deepseekModelPattern: z.string().default(DEFAULT_CONFIG.deepseekModelPattern).volatile(),
  /** Extra `provider/model` keys or model-id tests to declare. */
  declareModels: z.array(z.string()).default([]).volatile(),
  /** Declared depth vocabulary, escalation-ordered. */
  efforts: z.array(z.string()).default([...DEFAULT_CONFIG.efforts]).volatile(),
  /** Route default depth; `auto` resolves here unless `autoLevel` pins another. */
  defaultEffort: z.string().default(DEFAULT_CONFIG.defaultEffort).volatile(),
  /** `model-default` follows the route default, or a fixed level id. */
  autoLevel: z.string().default(DEFAULT_CONFIG.autoLevel).volatile(),
  /** Which models offer Auto: `all` | `declared` | `off`. */
  autoScope: z.union([z.const('all'), z.const('declared'), z.const('off')]).default(DEFAULT_CONFIG.autoScope).volatile(),
  /** Downgrade cheap host-owned calls when the model declares the level. */
  auxDowngrade: z.boolean().default(DEFAULT_CONFIG.auxDowngrade).volatile(),
  /** LLM request purposes that are host-owned cheap calls. */
  auxPurposes: z.array(z.string()).default([...DEFAULT_CONFIG.auxPurposes]).volatile(),
  /** Level those calls request. */
  auxLevel: z.string().default(DEFAULT_CONFIG.auxLevel).volatile(),
  /** Subagent-owned calls: `inherit`, `auto`, or a fixed level. */
  subagentLevel: z.string().default(DEFAULT_CONFIG.subagentLevel).volatile(),
  /** Opt-in automatic difficulty policy; off by default. */
  adaptiveEnabled: z.boolean().default(DEFAULT_CONFIG.adaptiveEnabled).volatile(),
  /** Lower the depth while a turn is still exploring after an expensive round. */
  adaptiveExploration: z.boolean().default(DEFAULT_CONFIG.adaptiveExploration).volatile(),
  /** Depth used during the exploration phase. */
  adaptiveExplorationLevel: z.string().default(DEFAULT_CONFIG.adaptiveExplorationLevel).volatile(),
  /** Previous round's reasoning tokens that make exploration expensive. */
  adaptiveReasoningThreshold: z.number().default(DEFAULT_CONFIG.adaptiveReasoningThreshold).volatile(),
  /** Trigger rule: `auto` (reasoning when reported, else rounds), `rounds`, `reasoning`. */
  adaptiveTrigger: z.union([z.const('auto'), z.const('rounds'), z.const('reasoning')]).default(DEFAULT_CONFIG.adaptiveTrigger).volatile(),
  /** Assistant rounds in the turn before the exploration downgrade engages. */
  adaptiveMinRounds: z.number().default(DEFAULT_CONFIG.adaptiveMinRounds).volatile(),
  /** Explicit plan mode maps to a higher depth. */
  adaptivePlanMode: z.boolean().default(DEFAULT_CONFIG.adaptivePlanMode).volatile(),
  /** Depth used while plan mode is active. */
  adaptivePlanLevel: z.string().default(DEFAULT_CONFIG.adaptivePlanLevel).volatile(),
  /** Inject an optional parallel-work policy into the system prompt. */
  parallelEnabled: z.boolean().default(DEFAULT_CONFIG.parallelEnabled).volatile(),
  /** Fan-out cap for write tasks named by that policy. */
  parallelWriteFanout: z.number().default(DEFAULT_CONFIG.parallelWriteFanout).volatile(),
  /** Fan-out cap for read-only tasks named by that policy. */
  parallelReadFanout: z.number().default(DEFAULT_CONFIG.parallelReadFanout).volatile(),
  /**
   * Record every effort decision in a bounded in-memory journal and serve it to
   * the conversation's floating debug log. Off by default; when off the journal
   * stays empty and the routes answer `enabled: false`.
   */
  debugOverlay: z.boolean().default(DEFAULT_CONFIG.debugOverlay).volatile(),
  /** Diagnostic stderr trace of each decision. */
  trace: z.boolean().default(false).volatile(),
});

/** Whether one parsed config value is a volatile reference. */
function isVolatileRef(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' && !Array.isArray(value);
}

/**
 * Read the live policy config from the row's (possibly volatile) values.
 * Constants and tests pass plain values; the Loader passes references.
 * @param {object} [rawConfig] this row's config.
 * @returns {object} a normalized plain config.
 */
export function readConfig(rawConfig) {
  const source = rawConfig !== null && typeof rawConfig === 'object' ? rawConfig : {};
  const plain = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const value = source[key];
    const plainValue = isVolatileRef(value) ? value.get() : value;
    if (plainValue !== undefined) plain[key] = plainValue;
  }
  return normalizeConfig(plain);
}

/**
 * Marks one facade so a re-run can tell "this registration already carries my
 * wrapper" from "this is a third party's adapter". Not enumerable: it must not
 * leak into an `Object.keys` sweep.
 */
const FACADE = Symbol('dsh-think-effort/adapter-facade');

/** Every adapter member the facade forwards; `resolveModel`/`prepareCall` are handled here. */
const FORWARDED = [
  'providerInfo',
  'providerRetryPolicy',
  'imageRequestPricing',
  'imageRequestTarget',
  'listModels',
  'stream',
];

/** One facade per inner adapter: one identity however many routes it serves. */
const facades = new WeakMap();

/**
 * Build a forwarding facade over one adapter.
 * @param {object} inner the adapter a third party registered; never mutated.
 * @param {object} deps decoration and translation hooks.
 * @returns {object} the facade to place in the registry entry.
 */
function adapterFacade(inner, deps) {
  const facade = {
    async resolveModel(provider, model, signal) {
      const info = await inner.resolveModel.call(inner, provider, model, signal);
      return deps.decorate(info, provider, model);
    },
    async prepareCall(provider, model, signal) {
      const prepared = await inner.prepareCall.call(inner, provider, model, signal);
      const info = deps.decorate(prepared.model, provider, model);
      return {
        model: info,
        stream: (options) => prepared.stream.call(prepared, deps.translate(provider, model, options, info)),
      };
    },
  };
  // Forwarded members keep `this` bound to the inner adapter and a stable
  // function identity, so a downstream cache keyed on identity keeps working.
  for (const member of FORWARDED) {
    const value = inner[member];
    if (typeof value !== 'function') continue;
    facade[member] = value.bind(inner);
  }
  Object.defineProperty(facade, FACADE, { value: true, enumerable: false });
  return facade;
}

/** `setTimeout` in a Host keeps the process alive; this one must not. */
function unrefTimer(timer) {
  try {
    timer?.unref?.();
  } catch {
    /* a non-Node timer has nothing to unref */
  }
}

/** Read the live `llm-pi-ai` section, if the settings service is mounted. */
function readPiAiSection(ctx) {
  try {
    const settings = ctx.get('settings');
    if (settings === null || settings === undefined || typeof settings.describe !== 'function') return undefined;
    const descriptors = settings.describe();
    if (!Array.isArray(descriptors)) return undefined;
    const hit = descriptors.find((entry) => entry !== null && typeof entry === 'object' && entry.ns === PI_AI_NAMESPACE);
    if (hit === undefined) return undefined;
    return { value: hit.value, revision: hit.revision };
  } catch {
    return undefined;
  }
}

/**
 * Whether one live Agent belongs to a subagent session.
 * @param {object} [agent] a live Agent handle (`ctx.agents.get(id)`).
 * @returns {boolean} true for a delegated child session.
 */
export function isSubagentAgent(agent) {
  const header = agent?.session?.header;
  if (header === null || typeof header !== 'object') return false;
  return header.origin === 'subagent'
    || (typeof header.delegationDepth === 'number' && header.delegationDepth > 0);
}

/**
 * Plugin body.
 * @param {import('@deepseek-ai/cordis').Context} ctx the owning Host context.
 * @param {object} [rawConfig] this row's config from the profile patch.
 */
export function apply(ctx, rawConfig) {
  /** Live policy config; re-read after a volatile update so Settings edits apply at once. */
  let config = readConfig(rawConfig);
  /** Diagnostic channel: opt-in stderr trace for a profile that hides the Host log. */
  const trace = (message, ...rest) => {
    if (config.trace !== true) return;
    try {
      let index = 0;
      const text = String(message).replace(/%s/g, () => String(rest[index++]));
      process.stderr.write(`[think-effort] ${text}${index < rest.length ? ' ' + rest.slice(index).map(String).join(' ') : ''}\n`);
    } catch {
      /* a trace must never break the turn */
    }
  };
  trace('apply: enabled=%s declareCapability=%s', config.enabled, config.declareCapability);
  if (config.enabled === false) {
    ctx.logger?.info?.('[think-effort] disabled by config; no capability declaration or effort policy installed');
    return;
  }

  /** Models this plugin declared, keyed `provider/model` (used by `autoScope: declared`). */
  const declaredModels = new Set();
  /**
   * Whether one request belongs to a subagent session. DSH stamps the session
   * id on every request; the child's session header carries its durable
   * delegation origin, so no extra seam or cached classification is needed.
   * @param {string} [sessionId] stamped session identity.
   * @returns {boolean} true for a subagent-owned session.
   */
  const isSubagentSession = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId === '') return false;
    try {
      return isSubagentAgent(ctx.get('agents')?.get?.(sessionId));
    } catch {
      return false;
    }
  };
  /** Log de-duplication for per-request decisions. */
  const logged = new Set();

  // ── debug journal ────────────────────────────────────────────────────────
  // The browser half renders this as a floating log over the conversation.
  // Recording is gated by the live config reference, so the switch costs
  // nothing while it is off and applies on the next request after a save.
  const debugJournal = createDebugJournal();
  const debugOn = () => config.debugOverlay === true;
  /** Session facts for the journal, cached because headers do not change. */
  const debugSessions = new Map();
  /** Last level served per `session|purpose`, so a record can name the switch. */
  const debugLast = new Map();

  /** Read one live Session header, when the store still holds it. */
  const headerOf = (sessionId) => {
    try {
      return ctx.get('sessions')?.get?.(sessionId)?.header;
    } catch {
      return undefined;
    }
  };

  /**
   * Describe one request's session for the journal: whether it belongs to a
   * subagent, the durable parent link, and the title when one is known.
   * @param {string} [sessionId] stamped session identity.
   * @returns {object} JSON-safe identity fields.
   */
  const debugSessionFacts = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId === '') {
      return { sessionId: null, parentSession: null, rootSessionId: null, subagent: false, title: null };
    }
    const cached = debugSessions.get(sessionId);
    if (cached !== undefined) return cached;
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(sessionId);
    } catch {
      agent = undefined;
    }
    const session = agent?.session ?? (() => {
      try {
        return ctx.get('sessions')?.get?.(sessionId);
      } catch {
        return undefined;
      }
    })();
    const header = session?.header;
    const parentSession = typeof header?.parentSession === 'string' ? header.parentSession : null;
    let rootSessionId = sessionId;
    let cursor = header;
    for (let depth = 0; depth < 8 && cursor !== undefined; depth += 1) {
      if (typeof cursor.parentSession !== 'string') {
        rootSessionId = typeof cursor.id === 'string' ? cursor.id : rootSessionId;
        break;
      }
      rootSessionId = cursor.parentSession;
      cursor = headerOf(cursor.parentSession);
      if (cursor === undefined) break;
    }
    let title = null;
    try {
      const snapshot = ctx.get('sessionTitle')?.get?.(session);
      if (typeof snapshot?.title === 'string' && snapshot.title !== '') title = snapshot.title;
    } catch {
      /* a missing title service only costs the label */
    }
    const facts = {
      sessionId,
      parentSession,
      rootSessionId,
      subagent: isSubagentAgent(agent) || header?.origin === 'subagent' || (typeof header?.delegationDepth === 'number' && header.delegationDepth > 0),
      title,
    };
    if (debugSessions.size > 200) debugSessions.clear();
    debugSessions.set(sessionId, facts);
    return facts;
  };

  /**
   * Append one journal record while the debug switch is on.
   * @param {string} kind record type.
   * @param {object} [fields] JSON-safe fields.
   */
  const debugRecord = (kind, fields) => {
    if (debugOn() !== true) return;
    try {
      debugJournal.record(kind, fields);
    } catch {
      /* a debug record must never break a model request */
    }
  };

  /**
   * Record one per-request effort decision: what the selection asked for, what
   * the adapter will send, and whether that differs from the previous call of
   * the same session and purpose (the "switch" a reader is looking for).
   * @param {object} input decision facts.
   * @param {string} input.provider route key.
   * @param {string} input.model model id.
   * @param {object} input.options the request options the adapter receives.
   * @param {string} [input.level] the level the plugin applied, if any.
   * @param {object} [input.adaptive] the automatic-difficulty decision.
   */
  const debugRequest = ({ provider, model, options, level, adaptive = {} }) => {
    if (debugOn() !== true) return;
    // An ordinary agent step usually carries no purpose; name it explicitly so
    // the browser half can label it instead of showing "unknown".
    const purpose = typeof options.purpose === 'string' && options.purpose !== '' ? options.purpose : 'agent';
    const requested = typeof options.reasoningEffort === 'string' ? options.reasoningEffort : null;
    const applied = level ?? requested;
    const facts = debugSessionFacts(options.sessionId);
    const key = `${facts.sessionId ?? '-'}|${purpose ?? '-'}`;
    const previous = debugLast.get(key) ?? null;
    if (debugLast.size > 200) debugLast.clear();
    debugLast.set(key, applied);
    debugRecord('request', {
      ...facts,
      provider,
      model,
      purpose,
      requested,
      applied,
      switched: level !== undefined && level !== requested,
      from: previous,
      changed: previous !== null && previous !== applied,
      reason: adaptive.reason ?? null,
      phase: adaptive.phase ?? null,
    });
  };

  // ── adaptive difficulty ──────────────────────────────────────────────────
  // Opt-in policy: the phase state is folded from committed Session events and
  // only consulted for `auto` requests. Every state is per Session, so parallel
  // subagents never inherit each other's phase.
  const adaptive = createAdaptivePolicy();
  ctx.on('session/event', (session, event) => {
    if (config.adaptiveEnabled !== true) return;
    const sessionId = session?.id ?? session?.header?.id;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    try {
      adaptive.observe(sessionId, event);
    } catch {
      /* a malformed event must not affect a turn */
    }
  });

  /** Whether plan mode is active for one live Session. */
  const planStateOf = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId === '') return { active: false, why: 'no-session' };
    try {
      const agent = ctx.get('agents')?.get?.(sessionId);
      if (agent === undefined) return { active: false, why: 'no-agent' };
      // Plan mode is composed per agent preset, so its service may live in the
      // agent's own context rather than the profile root; ask the preset
      // registry for the agent-scoped face first and keep a root fallback for
      // compositions that mount it globally.
      const planMode = ctx.get('agentPresets')?.serviceFor?.(agent, 'planMode') ?? ctx.get('planMode');
      if (planMode === undefined) return { active: false, why: 'no-service' };
      const state = planMode.get(agent);
      return { active: state?.active === true, why: `state:${String(state?.active)}:${String(state?.pending)}` };
    } catch (error) {
      return { active: false, why: `error:${error instanceof Error ? error.message : String(error)}` };
    }
  };

  /**
   * Ask the adaptive policy for one request's suggestion.
   *
   * Cheap calls and a fixed `subagentLevel` keep their precedence: the policy
   * is not consulted for them at all, so a journal reason always describes a
   * decision that could actually apply.
   * @param {object} input request facts.
   * @param {string} [input.requested] the selection's effort.
   * @param {string} [input.purpose] LLM request purpose.
   * @param {boolean} input.isSubagent whether the call belongs to a subagent.
   * @param {string} [input.sessionId] stamped session identity.
   * @returns {object} the policy decision.
   */
  const adaptiveDecisionFor = ({ requested, purpose, isSubagent, sessionId }) => {
    const none = { level: undefined, reason: null, phase: null };
    if (config.adaptiveEnabled !== true) return none;
    if (requested !== 'auto') return none;
    if (isAuxPurpose(purpose, config)) return none;
    if (isSubagent === true && config.subagentLevel !== 'inherit' && config.subagentLevel !== 'auto') return none;
    const planState = planStateOf(sessionId);
    const decision = adaptive.decide(sessionId, { requested, planActive: planState.active, config });
    if (config.trace === true) {
      trace('adaptive: session=%s plan=%s (%s) level=%s reason=%s', String(sessionId), planState.active, planState.why, String(decision.level), String(decision.reason));
    }
    return decision;
  };

  // ── optional parallel-work policy ────────────────────────────────────────
  // A system-prompt section, not a tool: the policy changes how the model
  // plans, while the existing workflow/subagent tools stay the execution path.
  // The section text is a function over the live row config, so the switch
  // takes effect on the next assembled step without a remount.
  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt?.section !== undefined) {
    ctx.effect(() => systemPrompt.section({
      name: 'think-effort:parallel-work',
      order: 700,
      text: () => {
        const policy = readConfig(config);
        const text = buildParallelPolicy(policy);
        if (policy.trace === true) {
          trace('parallel-policy: enabled=%s chars=%d', String(policy.parallelEnabled), text.length);
        }
        return text;
      },
    }), 'think-effort: parallel work');
  }

  // ── capability declaration ───────────────────────────────────────────────
  /** Serialize settings writes; a boot burst must not stack whole-section updates. */
  let syncTail = Promise.resolve();
  let syncAgain = false;
  const syncCapabilities = () => {
    if (!config.declareCapability) return;
    if (syncAgain) return;
    syncAgain = true;
    syncTail = syncTail.then(async () => {
      syncAgain = false;
      const section = readPiAiSection(ctx);
      trace('capability sync: section=%s', section === undefined ? 'missing' : 'found');
      if (section === undefined) return;
      const plan = planCapabilitySection(section.value, config);
      trace('capability sync: changed=%s declared=%s', plan.changed, plan.declared.map((entry) => `${entry.provider}/${entry.model}`).join(','));
      for (const entry of plan.declared) declaredModels.add(`${entry.provider}/${entry.model}`);
      if (!plan.changed) return;
      const settings = ctx.get('settings');
      if (settings === null || settings === undefined || typeof settings.update !== 'function') return;
      try {
        await settings.update(PI_AI_NAMESPACE, { providers: plan.section.providers }, section.revision);
        trace('capability sync: section written');
        debugRecord('capability', {
          declared: plan.declared.map((entry) => `${entry.provider}/${entry.model}`),
          efforts: [...config.efforts],
          defaultEffort: config.defaultEffort,
        });
        void selfCheck();
        ctx.logger?.info?.(
          '[think-effort] declared DeepSeek effort capabilities in %s: %s',
          PI_AI_NAMESPACE,
          plan.declared.map((entry) => `${entry.provider}/${entry.model} (${entry.reason})`).join(', ') || 'none',
        );
      } catch (error) {
        trace('capability sync: write rejected: %s', error instanceof Error ? error.message : String(error));
        // A schema gate (older llm-pi-ai without the field) keeps the previous
        // section: report it instead of pretending the model gained levels.
        ctx.logger?.warn?.('[think-effort] capability declaration rejected by the llm-pi-ai schema; kept the previous section', error);
      }
    }).catch((error) => {
      syncAgain = false;
      ctx.logger?.warn?.('[think-effort] capability sync failed', error);
    });
  };

  const policyDeps = {
    decorate(info, provider, model) {
      if (config.enabled === false) return info;
      if (info === null || typeof info !== 'object') return info;
      const key = `${provider}/${model}`;
      const declared = declaredModels.has(key) || shouldDeclare({ provider, modelId: model }, config).declared;
      return withAutoEffort(info, config, { declared });
    },
    translate(provider, model, options, info) {
      if (config.enabled === false) return options;
      if (options === null || typeof options !== 'object') return options;
      const reasoning = info !== null && typeof info === 'object' ? info.reasoning : undefined;
      const subagent = isSubagentSession(options.sessionId);
      const adaptiveDecision = adaptiveDecisionFor({
        requested: options.reasoningEffort,
        purpose: options.purpose,
        isSubagent: subagent,
        sessionId: options.sessionId,
      });
      const level = resolveCallEffort({
        requested: options.reasoningEffort,
        purpose: options.purpose,
        isSubagent: subagent,
        efforts: reasoning !== null && typeof reasoning === 'object' ? reasoning.efforts : undefined,
        defaultEffort: reasoning !== null && typeof reasoning === 'object' ? reasoning.defaultEffort : undefined,
        adaptiveLevel: adaptiveDecision.level,
      }, config);
      debugRequest({ provider, model, options, level, adaptive: adaptiveDecision });
      if (level === undefined || level === options.reasoningEffort) return options;
      const key = `${provider}/${model}/${String(options.purpose ?? '-')}/${level}`;
      trace('translate: %s/%s purpose=%s requested=%s -> %s', provider, model, String(options.purpose ?? '-'), String(options.reasoningEffort), level);
      if (!logged.has(key)) {
        logged.add(key);
        ctx.logger?.info?.(
          '[think-effort] %s/%s purpose=%s auto -> %s',
          provider,
          model,
          String(options.purpose ?? '-'),
          level,
        );
      }
      return { ...options, reasoningEffort: level };
    },
  };

  /** Route registrations replaced by this plugin, so unload can put them back. */
  /** @type {Array<{route: string, facade: object, registration: object}>} */
  const installed = [];

  const install = () => {
    const llm = ctx.get('llm');
    const adapters = llm?.adapters;
    if (adapters === undefined || typeof adapters.get !== 'function' || typeof adapters.set !== 'function') return;
    // Snapshot first: the loop replaces entries and a live iterator would revisit them.
    for (const [route, registration] of [...adapters]) {
      const inner = registration?.adapter;
      if (inner === null || inner === undefined || inner[FACADE] === true) continue;
      let facade = facades.get(inner);
      if (facade === undefined) {
        facade = adapterFacade(inner, policyDeps);
        facades.set(inner, facade);
      }
      try {
        adapters.set(route, { ...registration, adapter: facade });
        installed.push({ route, facade, registration });
      } catch (error) {
        ctx.logger?.warn?.('[think-effort] could not wrap adapter for route %s', route, error);
      }
    }
  };

  /**
   * Boot-time self check (trace only): report what the model now advertises and
   * what the policy resolves, without sending a model request. It is the only
   * way to see the whole pipeline in a profile whose Host log is not visible.
   * @returns {Promise<void>} fulfillment after the report is traced.
   */
  const selfCheck = async () => {
    if (config.trace !== true) return;
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
      const provider = selection?.provider;
      const model = selection?.model;
      if (typeof provider !== 'string' || typeof model !== 'string') {
        trace('self check: no default selection');
        return;
      }
      const info = await ctx.get('llm')?.resolveModelInfo?.(provider, model);
      const reasoning = info?.reasoning;
      const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts.map((effort) => effort.id) : [];
      const auto = resolveCallEffort({ requested: 'auto', efforts: reasoning?.efforts, defaultEffort: reasoning?.defaultEffort, purpose: 'agent' }, config);
      const aux = resolveCallEffort({ requested: 'auto', efforts: reasoning?.efforts, defaultEffort: reasoning?.defaultEffort, purpose: config.auxPurposes[0] ?? 'session-title' }, config);
      trace('self check: %s/%s efforts=[%s] default=%s auto=%s aux=%s', provider, model, efforts.join(' '), String(reasoning?.defaultEffort), String(auto), String(aux));
    } catch (error) {
      trace('self check failed: %s', error instanceof Error ? error.message : String(error));
    }
  };

  install();
  syncCapabilities();

  ctx.on('llm/adapters-updated', () => {
    install();
    syncCapabilities();
  });
  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_AI_NAMESPACE) syncCapabilities();
  });
  ctx.on('app-boot/config-reload', () => syncCapabilities());
  // A Settings edit commits volatile fields into the running references; the
  // adapter facade reads this `config` variable per request, so only a re-read
  // and one capability reconciliation are needed here.
  ctx.on('loader/volatile-update', () => {
    config = readConfig(rawConfig);
    trace('volatile update: enabled=%s subagentLevel=%s', config.enabled, config.subagentLevel);
    debugRecord('config', {
      enabled: config.enabled,
      adaptiveEnabled: config.adaptiveEnabled,
      parallelEnabled: config.parallelEnabled,
      debugOverlay: config.debugOverlay,
      autoLevel: config.autoLevel,
      defaultEffort: config.defaultEffort,
      subagentLevel: config.subagentLevel,
      auxDowngrade: config.auxDowngrade,
      auxLevel: config.auxLevel,
    });
    if (config.enabled === false) return;
    syncCapabilities();
  });
  // Delayed retries cover the boot order where this plugin applies before the
  // settings service has described the llm-pi-ai entry, and no later commit
  // touches that namespace. The second beat also covers a bundle installed
  // into an already-running Host, where no boot-time describe chain follows.
  const retries = [2500, 10000].map((delay) => {
    const timer = setTimeout(() => syncCapabilities(), delay);
    unrefTimer(timer);
    return timer;
  });
  ctx.effect(() => () => {
    for (const timer of retries) clearTimeout(timer);
  }, 'think-effort: capability retries');

  /**
   * Wait for a queued capability declaration, so a reader that runs right after
   * boot (the status tool, the first model catalog load) sees the declaration
   * rather than the section it replaced.
   * @returns {Promise<void>} settlement of the current write chain.
   */
  const flushCapabilities = async () => {
    syncCapabilities();
    await syncTail.catch(() => undefined);
  };

  // ── status tool ──────────────────────────────────────────────────────────
  // The Host has no read-only surface for "what depth will this model take and
  // what does Auto resolve to", and the answer depends on a settings write that
  // may still be in flight. One small tool answers it for the user and for a
  // reviewer of this plugin, without sending any model request.
  const statusTool = {
    name: 'reasoning_effort_status',
    description:
      'Report the reasoning depths one provider/model declares, the route default, and what Auto resolves to for a normal step and for a cheap host-owned call. Read-only: sends no model request.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Provider route; defaults to the current default selection.' },
        model: { type: 'string', description: 'Model id; defaults to the current default selection.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{
        type: 'text',
        text: typeof value?.summary === 'string' ? value.summary : 'reasoning effort status unavailable',
      }],
    },
    async execute(args) {
      await flushCapabilities();
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
      const provider = typeof args?.provider === 'string' && args.provider !== '' ? args.provider : selection?.provider;
      const model = typeof args?.model === 'string' && args.model !== '' ? args.model : selection?.model;
      if (typeof provider !== 'string' || typeof model !== 'string') {
        return { ok: false, summary: 'No provider/model given and no default selection is recorded.' };
      }
      const llm = ctx.get('llm');
      if (llm === null || llm === undefined || typeof llm.resolveModelInfo !== 'function') {
        return { ok: false, summary: 'The llm service is not available in this profile.' };
      }
      let info;
      try {
        info = await llm.resolveModelInfo(provider, model);
      } catch (error) {
        return { ok: false, provider, model, summary: `Cannot resolve ${provider}/${model}: ${error instanceof Error ? error.message : String(error)}` };
      }
      const reasoning = info?.reasoning;
      const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts.map((effort) => effort.id) : [];
      const defaultEffort = reasoning?.defaultEffort;
      const auto = resolveCallEffort({ requested: 'auto', efforts: reasoning?.efforts, defaultEffort, purpose: 'agent' }, config);
      const auxPurpose = config.auxPurposes[0] ?? 'session-title';
      const aux = resolveCallEffort({ requested: 'auto', efforts: reasoning?.efforts, defaultEffort, purpose: auxPurpose }, config);
      const subagentLevel = config.subagentLevel ?? 'inherit';
      const subagent = subagentLevel === 'inherit'
        ? undefined
        : resolveCallEffort({ isSubagent: true, efforts: reasoning?.efforts, defaultEffort, purpose: 'agent' }, config);
      const summary = efforts.length === 0
        ? `${provider}/${model} declares no reasoning depths; the selector offers only the provider default.`
        : `${provider}/${model}: ${efforts.join(' | ')}; default=${defaultEffort ?? '(none)'}; Auto -> ${auto ?? '(adapter default)'} for a normal step -> ${aux ?? '(adapter default)'} for ${auxPurpose}`
          + (subagentLevel === 'inherit'
            ? '; subagents follow their own selection.'
            : `; subagents -> ${subagent ?? '(adapter default)'} (${subagentLevel}).`);
      return {
        ok: true, provider, model, efforts, defaultEffort: defaultEffort ?? null,
        auto: auto ?? null, aux: aux ?? null, auxPurpose,
        subagentLevel, subagent: subagent ?? null, summary,
      };
    },
  };
  ctx.inject?.(['tools'], (scope) => {
    scope.effect(() => scope.tools.register(statusTool), 'think-effort: status tool');
  });

  // ── debug routes ─────────────────────────────────────────────────────────
  // The conversation's floating debug log polls these. One effect owns both
  // route registrations, so unloading the bundle removes the endpoints.
  ctx.inject?.(['webServer'], (scope) => {
    scope.effect(() => registerDebugRoutes(scope, {
      journal: debugJournal,
      enabled: () => config.debugOverlay === true,
    }), 'think-effort: debug routes');
  });

  // Unload: put every registry entry we replaced back, then retire a durable
  // `auto` selection so a session cannot keep a mask that no longer resolves
  // (DSH validates the selection against the model's efforts on every request).
  ctx.effect(() => () => {
    const llm = ctx.get('llm');
    const adapters = llm?.adapters;
    for (const { route, facade, registration } of installed) {
      try {
        const current = adapters?.get?.(route);
        if (current?.adapter === facade) adapters.set(route, registration);
      } catch {
        /* a torn-down registry is already gone */
      }
    }
    installed.length = 0;
    try {
      const agents = ctx.get('agents');
      const live = typeof agents?.list === 'function' ? agents.list() : [];
      for (const agent of live) {
        const current = agent?.model?.current?.();
        if (current === undefined || current.reasoningEffort !== 'auto') continue;
        const { provider, model } = current;
        const { reasoningEffort: _drop, ...rest } = current;
        agent.model.select(rest);
        ctx.logger?.info?.('[think-effort] retired auto selection on %s/%s at unload', provider, model);
      }
    } catch {
      /* unload must not throw */
    }
  }, 'think-effort: adapters and auto selections');
}
