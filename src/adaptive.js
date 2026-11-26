/**
 * Opt-in automatic difficulty policy: the exploration-phase downgrade ported
 * from Reasonix's retired reasoning governor, adapted to DSH's session events.
 *
 * <h2>What it does</h2>
 *
 * With `adaptiveEnabled` on and the selector on `Auto`, a turn starts at the
 * normal default depth. Once the turn is still exploring — no mutating or local
 * execution tool has run — and the trigger condition holds, later requests in
 * that turn drop to `adaptiveExplorationLevel`. The first write or local
 * execution ends the exploration phase and the default depth returns. Plan mode
 * is an explicit user signal and maps to `adaptivePlanLevel` instead.
 *
 * The trigger is deliberately configurable because not every gateway reports
 * reasoning tokens. `adaptiveTrigger: 'auto'` uses the reasoning-token threshold
 * when the provider reports `usage.reasoningTokens`, and otherwise falls back to
 * the number of assistant rounds (`adaptiveMinRounds`, default 1). `'rounds'`
 * and `'reasoning'` force one rule.
 *
 * <h2>What it deliberately does NOT do</h2>
 *
 * It never inspects prompt text, tool names for difficulty, or argument sizes.
 * It never overrides an explicit selector choice, a fixed `subagentLevel`, or a
 * cheap-call downgrade; those decisions happen in `src/policy.js` before this
 * policy is consulted. It is off by default and resets every turn.
 *
 * The reference implementation is Reasonix v1.38.1 `internal/agent/governor.go`
 * (`govReasoningThreshold = 1500`, exploration cell, env-gated enforcement);
 * that experiment was retired in Reasonix v1.39.11, which is why this is an
 * opt-in experiment rather than default behavior.
 *
 * @module dsh-think-effort/adaptive
 */

/** Journal reason for an exploration-phase downgrade. */
export const REASON_EXPLORATION = 'exploration';
/** Journal reason for a plan-mode elevation. */
export const REASON_PLAN = 'plan';

/** Tool names whose call means local execution has started. */
export const LOCAL_EXEC_TOOLS = new Set([
  'bash',
  'pwsh',
  'run_code',
  'cordis_run',
  'terminal_send',
  'terminal_signal',
]);

/** Tool names whose call mutates the workspace. */
export const MUTATING_TOOLS = new Set([
  'write',
  'edit',
  'apply_patch',
  'multi_edit',
  'str_replace_editor',
  'notebook_edit',
]);

/**
 * Classify one tool name for the exploration phase.
 * @param {unknown} name tool name.
 * @returns {'exec'|'mutate'|'other'} the classification.
 */
export function classifyTool(name) {
  if (typeof name !== 'string' || name === '') return 'other';
  if (LOCAL_EXEC_TOOLS.has(name)) return 'exec';
  if (MUTATING_TOOLS.has(name)) return 'mutate';
  return 'other';
}

/**
 * Create the per-session adaptive policy.
 *
 * One instance is owned by `apply()`; states are keyed by Session id, so
 * parallel main sessions and subagents never share a phase. Nothing is
 * persisted: a Host restart simply starts every session in exploration again.
 *
 * @returns {object} the policy.
 */
export function createAdaptivePolicy() {
  /** @type {Map<string, {exploring: boolean, lastReasoning: number, rounds: number, reasoningReported: boolean}>} */
  const states = new Map();

  const fresh = () => ({ exploring: true, lastReasoning: 0, rounds: 0, reasoningReported: false });
  const stateOf = (sessionId) => {
    const existing = states.get(sessionId);
    if (existing !== undefined) return existing;
    const state = fresh();
    states.set(sessionId, state);
    return state;
  };

  return {
    /** Number of tracked sessions (tests and diagnostics). */
    get size() {
      return states.size;
    },

    /**
     * Fold one committed Session event into the phase state.
     * @param {string} sessionId Session identity.
     * @param {object} event committed `SessionEvent`.
     */
    observe(sessionId, event) {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      if (event === null || typeof event !== 'object') return;
      switch (event.type) {
        case 'turn/start':
          states.set(sessionId, fresh());
          return;
        case 'turn/end':
          states.delete(sessionId);
          return;
        case 'assistant/message': {
          const state = stateOf(sessionId);
          state.rounds += 1;
          const tokens = event.data?.usage?.reasoningTokens;
          if (typeof tokens === 'number' && Number.isFinite(tokens)) {
            state.lastReasoning = tokens;
            state.reasoningReported = true;
          }
          return;
        }
        case 'tool/call':
          if (classifyTool(event.data?.name) !== 'other') {
            stateOf(sessionId).exploring = false;
          }
          return;
        default:
          return;
      }
    },

    /**
     * Decide the adaptive depth for one request.
     *
     * Only an `auto` request is considered; explicit selections belong to the
     * caller. The returned level is a *suggestion*: the policy resolver clamps
     * it to the model's declared vocabulary and applies the precedence rules.
     *
     * @param {string} sessionId Session identity.
     * @param {object} input decision inputs.
     * @param {string} [input.requested] the selection's effort.
     * @param {boolean} [input.planActive] whether plan mode is active.
     * @param {object} input.config normalized plugin config.
     * @returns {{level: string|undefined, reason: string|null, phase: string|null, lastReasoning: number}} the decision.
     */
    decide(sessionId, { requested, planActive, config }) {
      const none = { level: undefined, reason: null, phase: null, lastReasoning: 0, rounds: 0 };
      if (config?.adaptiveEnabled !== true) return none;
      if (requested !== 'auto') return none;
      if (planActive === true && config.adaptivePlanMode !== false) {
        const planState = stateOf(sessionId);
        return {
          level: config.adaptivePlanLevel,
          reason: REASON_PLAN,
          phase: 'plan',
          lastReasoning: planState.lastReasoning,
          rounds: planState.rounds,
        };
      }
      if (config.adaptiveExploration === false) return none;
      const state = stateOf(sessionId);
      if (state.exploring !== true) {
        return { level: undefined, reason: null, phase: 'executing', lastReasoning: state.lastReasoning, rounds: state.rounds };
      }
      const threshold = Number.isFinite(config.adaptiveReasoningThreshold)
        ? Number(config.adaptiveReasoningThreshold)
        : 1500;
      const minRounds = Number.isFinite(config.adaptiveMinRounds) ? Number(config.adaptiveMinRounds) : 1;
      const trigger = config.adaptiveTrigger;
      const reasoningRule = trigger === 'reasoning' || (trigger !== 'rounds' && state.reasoningReported);
      const engaged = reasoningRule
        ? state.reasoningReported && state.lastReasoning >= threshold
        : state.rounds >= minRounds;
      if (engaged) {
        return {
          level: config.adaptiveExplorationLevel,
          reason: REASON_EXPLORATION,
          phase: 'exploring',
          lastReasoning: state.lastReasoning,
          rounds: state.rounds,
        };
      }
      return {
        level: undefined,
        reason: null,
        phase: 'exploring',
        lastReasoning: state.lastReasoning,
        rounds: state.rounds,
      };
    },

    /** Forget one session (tests and disposal). */
    reset(sessionId) {
      states.delete(sessionId);
    },

    /** Forget every session; a Host teardown needs no replay. */
    clear() {
      states.clear();
    },
  };
}
