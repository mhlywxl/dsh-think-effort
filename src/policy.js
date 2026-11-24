/**
 * Declarative thinking-depth policy (pure functions, no Host access).
 *
 * <h2>The four rules</h2>
 *
 * 1. **Capability is declared, never guessed.** A model declares its depth
 *    vocabulary and its default depth (DeepSeek V4: `low | high | max`, default
 *    `high`). A model with no declaration has no levels at all, and the selector
 *    then offers only the provider default.
 * 2. **`auto` means "use the declared default", not "schedule something".** It
 *    is resolved to a concrete depth before the adapter builds the request.
 * 3. **Cheap host-owned calls drop to `low` only when the model declares it.**
 *    Session titles, compaction and auto-review are bounded auxiliary requests
 *    that never inherit the session's own depth; a model without `low` keeps its
 *    own default instead.
 * 4. **Never send a depth the endpoint does not declare.** An unsupported
 *    explicit choice is refused upstream by DSH instead of being silently
 *    adjusted, so this module only ever computes depths the vocabulary contains.
 *
 * <h2>What this module deliberately does NOT do</h2>
 *
 * It never derives a depth from tool names, argument sizes or conversation
 * text. Those signals carry no difficulty information, a wrong low guess is
 * inherited by every later step, and a guessed level may not even exist on the
 * target model — the failure mode this policy is meant to remove.
 *
 * `<h2>Where the rules come from</h2>`
 *
 * The reference behaviour was established by reading an external desktop
 * agent's source; the findings, with citations, live outside this package (see
 * the workspace research note). This package states only the resulting rules so
 * its code and commits stay self-contained.
 */

/** Escalation-ordered effort levels every adapter vocabulary is drawn from. */
export const EFFORT_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Scheduler sentinel: never sent to a provider, always resolved first. */
export const AUTO_EFFORT = 'auto';

/** Display metadata for the levels this plugin can introduce. */
export const EFFORT_NAMES = {
  auto: 'Auto',
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

/**
 * DeepSeek V4 declaration used when a model carries none: the depth levels
 * `low | high | max` with a default of `high`. Turning thinking off entirely is
 * expressed through the provider's thinking knob rather than a depth, and the
 * pi-ai thinking map has no portable spelling for it, so the plugin declares
 * only the three depths it can serialize.
 */
export const DEEPSEEK_DEFAULT_EFFORTS = ['low', 'high', 'max'];
/** The official DeepSeek default depth. */
export const DEEPSEEK_DEFAULT_EFFORT = 'high';

/** Config defaults, mirrored by the bundle patch row. */
export const DEFAULT_CONFIG = {
  enabled: true,
  /** Declare DeepSeek V4 capabilities into `llm-pi-ai` when a model carries none. */
  declareCapability: true,
  /** Host suffixes that identify an official DeepSeek endpoint. */
  deepseekHosts: ['deepseek.com'],
  /** Model-id test for hand-declared gateways (`deepseek-v4.1-flash-1017`, ...). */
  deepseekModelPattern: '^deepseek',
  /** Extra `provider/model` keys or model-id tests to declare. */
  declareModels: [],
  /** Levels declared for a matched model, in escalation order. */
  efforts: DEEPSEEK_DEFAULT_EFFORTS,
  /** Route-level default depth (`auto` resolves here). */
  defaultEffort: DEEPSEEK_DEFAULT_EFFORT,
  /** What `auto` resolves to: `model-default` keeps the declared default. */
  autoLevel: 'model-default',
  /** Downgrade cheap host-owned calls to `auxLevel` when the model declares it. */
  auxDowngrade: true,
  /** LLM request purposes that are host-owned cheap calls. */
  auxPurposes: ['session-title', 'compaction', 'auto-review'],
  /** Level those calls request. */
  auxLevel: 'low',
  /** Which models get the `auto` mask in the model selector: `all` | `declared` | `off`. */
  autoScope: 'all',
  /**
   * Effort for subagent-owned calls: `inherit` leaves the child agent's own
   * selection alone; `auto` follows this plugin's default resolution; a level
   * id forces that depth (clamped to the model's declared vocabulary).
   */
  subagentLevel: 'inherit',
  /** Diagnostic stderr trace of each decision. */
  trace: false,
};

/** Merge a patch row over the defaults without validating types yet. */
export function normalizeConfig(raw) {
  const config = { ...DEFAULT_CONFIG, ...(raw !== null && typeof raw === 'object' ? raw : {}) };
  if (!Array.isArray(config.efforts) || config.efforts.length === 0) config.efforts = [...DEEPSEEK_DEFAULT_EFFORTS];
  if (!Array.isArray(config.auxPurposes)) config.auxPurposes = [...DEFAULT_CONFIG.auxPurposes];
  if (!Array.isArray(config.deepseekHosts)) config.deepseekHosts = [...DEFAULT_CONFIG.deepseekHosts];
  if (!Array.isArray(config.declareModels)) config.declareModels = [];
  return config;
}

/**
 * Whether one level id belongs to the standard vocabulary.
 * @param {unknown} value level id.
 * @returns {boolean} true for a known level or `auto`.
 */
export function isEffortId(value) {
  return value === AUTO_EFFORT || EFFORT_ORDER.includes(value);
}

/** Escalation index of a level, or `-1` when it is not a depth level. */
function rankOf(level) {
  return EFFORT_ORDER.indexOf(level);
}

/**
 * Whether a route's base URL points at an official DeepSeek endpoint.
 * Matching is host-exact (plus subdomains), never a substring test
 * (`internal/provider/openai/host.go`); a substring test would accept
 * `notdeepseek.com`, so this compares host suffixes.
 * @param {string} baseURL route endpoint.
 * @param {readonly string[]} [hosts] accepted host suffixes.
 * @returns {boolean} true when the host belongs to one of the suffixes.
 */
export function isDeepSeekHost(baseURL, hosts = DEFAULT_CONFIG.deepseekHosts) {
  if (typeof baseURL !== 'string' || baseURL.length === 0) return false;
  let host;
  try {
    host = new URL(baseURL).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((suffix) => {
    const clean = String(suffix ?? '').trim().toLowerCase().replace(/^\./, '');
    if (clean === '') return false;
    return host === clean || host.endsWith(`.${clean}`);
  });
}

/**
 * Whether a model id names the DeepSeek family.
 * Catalog ids are exact (`deepseek-v4-flash`, `deepseek-v4-pro`); a gateway
 * alias such as `deepseek-v4.1-flash-1017` is matched by the configured prefix
 * test, which the profile author owns.
 * @param {string} modelId provider-owned model id.
 * @param {string} [pattern] JavaScript source for the id test.
 * @returns {boolean} true when the id matches.
 */
export function isDeepSeekModel(modelId, pattern = DEFAULT_CONFIG.deepseekModelPattern) {
  if (typeof modelId !== 'string' || modelId.length === 0) return false;
  if (typeof pattern !== 'string' || pattern.trim() === '') return false;
  try {
    return new RegExp(pattern, 'i').test(modelId);
  } catch {
    return false;
  }
}

/**
 * Whether one model needs a DeepSeek capability declaration, and why.
 * @param {object} input route facts.
 * @param {string} input.provider route key.
 * @param {string} input.modelId model id.
 * @param {string} [input.baseURL] route endpoint.
 * @param {object} cfg normalized plugin config.
 * @returns {{declared: boolean, reason: string}} the decision.
 */
export function shouldDeclare({ provider, modelId, baseURL }, cfg) {
  const key = `${provider}/${modelId}`;
  const extras = cfg.declareModels.filter((entry) => typeof entry === 'string' && entry.trim() !== '');
  for (const extra of extras) {
    if (extra.includes('/')) {
      if (extra === key) return { declared: true, reason: 'declaredModels' };
      continue;
    }
    try {
      if (new RegExp(extra, 'i').test(modelId)) return { declared: true, reason: 'declaredModels' };
    } catch {
      /* an unusable user pattern must not match anything */
    }
  }
  if (isDeepSeekHost(baseURL, cfg.deepseekHosts)) return { declared: true, reason: 'deepseek-host' };
  if (isDeepSeekModel(modelId, cfg.deepseekModelPattern)) return { declared: true, reason: 'deepseek-model' };
  return { declared: false, reason: '' };
}

/** Build the `reasoningEfforts` map a declared model carries, or `undefined`. */
export function effortsMap(cfg) {
  const levels = cfg.efforts.filter((level) => typeof level === 'string' && level !== AUTO_EFFORT && level !== 'off');
  if (levels.length === 0) return undefined;
  /** @type {Record<string, string>} */
  const map = {};
  for (const level of levels) map[level] = level;
  return map;
}

/**
 * Whether a model entry already answers the capability question.
 * `reasoningEfforts: false` is an explicit "this endpoint has no levels"; a
 * non-empty dict is an explicit vocabulary. Neither may be overwritten.
 */
function hasExplicitReasoning(row) {
  if (row === null || typeof row !== 'object') return false;
  return row.reasoningEfforts !== undefined;
}

/** Assign a declared model's effort fields, returning the same object when it already answers. */
function declareRow(row, cfg) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  if (hasExplicitReasoning(row)) return row;
  const efforts = effortsMap(cfg);
  if (efforts === undefined) return row;
  return { ...row, reasoningEfforts: efforts };
}

/**
 * Plan the `llm-pi-ai` providers patch that declares DeepSeek capabilities.
 *
 * Pure: returns the *same* section reference when nothing needs to change, so a
 * caller can skip the settings write by identity (which is what keeps this
 * idempotent across boots and `settings/document-updated` events).
 *
 * Only models that carry no `reasoningEfforts` are touched. A user who declared
 * their own vocabulary keeps it; a user who set `reasoningEfforts: false` keeps
 * that too.
 *
 * @param {unknown} section the live `llm-pi-ai` section value.
 * @param {object} rawCfg plugin config.
 * @returns {{section: unknown, changed: boolean, declared: Array<{provider: string, model: string, reason: string}>}} the plan.
 */
export function planCapabilitySection(section, rawCfg) {
  const cfg = normalizeConfig(rawCfg);
  const declared = [];
  if (section === null || typeof section !== 'object') return { section, changed: false, declared };
  const providers = section.providers;
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) {
    return { section, changed: false, declared };
  }
  /** @type {Record<string, unknown>} */
  let nextProviders;
  for (const [provider, profile] of Object.entries(providers)) {
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) continue;
    const baseURL = typeof profile.baseURL === 'string' ? profile.baseURL : '';
    let nextProfile = profile;
    let routeDeclared = false;

    if (Array.isArray(profile.models)) {
      let nextModels;
      profile.models.forEach((row, index) => {
        const modelId = row !== null && typeof row === 'object' ? row.id : undefined;
        if (typeof modelId !== 'string' || modelId.length === 0) return;
        const decision = shouldDeclare({ provider, modelId, baseURL }, cfg);
        if (!decision.declared) return;
        const fixed = declareRow(row, cfg);
        if (fixed === row) return;
        routeDeclared = true;
        declared.push({ provider, model: modelId, reason: decision.reason });
        nextModels ??= [...profile.models];
        nextModels[index] = fixed;
      });
      if (nextModels !== undefined) nextProfile = { ...nextProfile, models: nextModels };
    }

    if (profile.modelOverrides !== null && typeof profile.modelOverrides === 'object' && !Array.isArray(profile.modelOverrides)) {
      let nextOverrides;
      for (const [modelId, row] of Object.entries(profile.modelOverrides)) {
        const decision = shouldDeclare({ provider, modelId, baseURL }, cfg);
        if (!decision.declared) continue;
        const fixed = declareRow(row, cfg);
        if (fixed === row) continue;
        routeDeclared = true;
        declared.push({ provider, model: modelId, reason: decision.reason });
        nextOverrides ??= { ...profile.modelOverrides };
        nextOverrides[modelId] = fixed;
      }
      if (nextOverrides !== undefined) nextProfile = { ...nextProfile, modelOverrides: nextOverrides };
    }

    // Route-level default depth: the depth `auto` resolves to.
    // pi-ai carries it per route, and an undeclared route keeps its own value.
    if (routeDeclared && nextProfile.reasoning === undefined && cfg.defaultEffort !== undefined) {
      nextProfile = { ...nextProfile, reasoning: cfg.defaultEffort };
    }

    if (nextProfile !== profile) {
      nextProviders ??= { ...providers };
      nextProviders[provider] = nextProfile;
    }
  }
  if (nextProviders === undefined) return { section, changed: false, declared };
  return { section: { ...section, providers: nextProviders }, changed: true, declared };
}

/**
 * Add the `auto` mask to one resolved model's reasoning metadata.
 *
 * A switcher lists `auto` first and the declared levels after it. The mask is a
 * UI value only: this plugin resolves it before the adapter sees it.
 *
 * @param {unknown} info `LlmResolvedModelInfo`-shaped metadata.
 * @param {object} rawCfg plugin config.
 * @param {{declared?: boolean}} [scope] whether this model was declared by us.
 * @returns {unknown} the same reference when no mask is needed.
 */
export function withAutoEffort(info, rawCfg, scope = {}) {
  const cfg = normalizeConfig(rawCfg);
  if (cfg.autoScope === 'off') return info;
  if (cfg.autoScope === 'declared' && scope.declared !== true) return info;
  if (info === null || typeof info !== 'object') return info;
  const reasoning = info.reasoning;
  if (reasoning === null || typeof reasoning !== 'object') return info;
  const efforts = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
  if (efforts.some((effort) => effort !== null && typeof effort === 'object' && effort.id === AUTO_EFFORT)) return info;
  return {
    ...info,
    reasoning: {
      ...reasoning,
      efforts: [{ id: AUTO_EFFORT, name: EFFORT_NAMES[AUTO_EFFORT] }, ...efforts],
    },
  };
}

/** The depth levels of one vocabulary, `auto`/`off` excluded, in escalation order. */
export function depthLevels(efforts) {
  if (!Array.isArray(efforts)) return [];
  return efforts
    .map((effort) => (effort !== null && typeof effort === 'object' ? effort.id : effort))
    .filter((id) => typeof id === 'string' && id !== AUTO_EFFORT && id !== 'off')
    .sort((left, right) => {
      const a = rankOf(left);
      const b = rankOf(right);
      return (a < 0 ? Number.MAX_SAFE_INTEGER : a) - (b < 0 ? Number.MAX_SAFE_INTEGER : b);
    });
}

/**
 * Clamp one level onto a declared vocabulary.
 *
 * An undeclared level is never sent: DSH rejects an explicit user choice that
 * the model does not advertise. A policy-computed level (rather than a user
 * pick) therefore clamps to the nearest declared depth, preferring the stronger
 * level on a tie: under-thinking a task is the failure this plugin exists to
 * remove, so an unrepresentable `medium` becomes `high`, not `low`.
 *
 * @param {string | undefined} level wanted level.
 * @param {readonly object[]} efforts declared vocabulary.
 * @param {string} [whenEmpty] level to use when the vocabulary is empty.
 * @returns {string | undefined} a declared level, or undefined.
 */
export function clampEffort(level, efforts, whenEmpty) {
  const depths = depthLevels(efforts);
  if (depths.length === 0) return whenEmpty;
  if (typeof level === 'string' && depths.includes(level)) return level;
  const wanted = rankOf(level);
  if (wanted < 0) return depths[0];
  let best = depths[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of depths) {
    const distance = Math.abs(rankOf(candidate) - wanted);
    // `<=` resolves a tie upward: `depths` is escalation-ordered, so the later
    // candidate at the same distance is the stronger level.
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Whether a request purpose is a host-owned cheap call. */
export function isAuxPurpose(purpose, rawCfg) {
  const cfg = normalizeConfig(rawCfg);
  if (!cfg.auxDowngrade) return false;
  return typeof purpose === 'string' && cfg.auxPurposes.includes(purpose);
}

/**
 * Depth `auto` resolves to for ordinary steps.
 * @param {object} cfg normalized plugin config.
 * @param {readonly object[]} efforts declared vocabulary.
 * @param {string} [defaultEffort] model/route default depth.
 * @returns {string | undefined} a declared depth, or undefined without one.
 */
function autoTarget(cfg, efforts, defaultEffort) {
  const depths = depthLevels(efforts);
  if (depths.length === 0) return undefined;
  const target = cfg.autoLevel === 'model-default' || cfg.autoLevel === undefined
    ? defaultEffort
    : cfg.autoLevel;
  if (typeof target === 'string' && depths.includes(target)) return target;
  if (typeof target === 'string') return clampEffort(target, efforts);
  return clampEffort('high', efforts, depths[depths.length - 1]);
}

/**
 * Decide the effort one model request should carry.
 *
 * The rules, in order:
 * 1. A cheap host-owned call (session title, compaction, auto-review) →
 *    `auxLevel` when the model declares a level at or near it. This holds even
 *    with no explicit selection either: those calls are applied
 *    unconditionally, because a session's own depth never applies to a bounded
 *    summary request.
 * 2. A subagent-owned call with `subagentLevel` set → that level, or the
 *    plugin's `auto` resolution for `auto`. The child's own selection and
 *    inherited parent selection are overridden only when the user opted in.
 * 3. An explicit level → `undefined`: a user pick is passed through untouched
 *    (DSH validates it against the same vocabulary, so an undeclared pick never
 *    reaches the wire).
 * 4. No explicit selection on an ordinary call → `undefined`: the adapter's own
 *    default stands (with the declaration above, that is `high`).
 * 5. `auto` → the declared route default (DeepSeek: `high`), or the
 *    highest declared depth when the route names none.
 *
 * @param {object} input decision inputs.
 * @param {string} [input.requested] the selection's effort.
 * @param {string} [input.purpose] LLM request purpose.
 * @param {boolean} [input.isSubagent] whether the call belongs to a subagent session.
 * @param {readonly object[]} [input.efforts] declared vocabulary.
 * @param {string} [input.defaultEffort] route/model default depth.
 * @param {object} rawCfg plugin config.
 * @returns {string | undefined} the level to send, or undefined to leave the request alone.
 */
export function resolveCallEffort({ requested, purpose, isSubagent, efforts, defaultEffort }, rawCfg) {
  const cfg = normalizeConfig(rawCfg);
  const depths = depthLevels(efforts);
  if (depths.length === 0) return undefined;
  const aux = isAuxPurpose(purpose, cfg) ? clampEffort(cfg.auxLevel, efforts) : undefined;
  // A pinned subagent depth outranks the child's own or inherited selection:
  // without that, a child inheriting the parent's fixed depth could never be
  // lowered and the setting would be inert for the common case. Cheap calls
  // still win, because a summary request has no task difficulty to describe.
  if (isSubagent === true && cfg.subagentLevel !== undefined && cfg.subagentLevel !== 'inherit') {
    if (aux !== undefined) return aux;
    return cfg.subagentLevel === AUTO_EFFORT
      ? autoTarget(cfg, efforts, defaultEffort)
      : clampEffort(cfg.subagentLevel, efforts);
  }
  if (requested !== undefined && requested !== AUTO_EFFORT) return undefined;
  if (aux !== undefined) return aux;
  if (requested === undefined) return undefined;
  return autoTarget(cfg, efforts, defaultEffort);
}
