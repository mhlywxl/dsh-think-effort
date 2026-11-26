/**
 * Adaptive difficulty engine: deterministic phase state folded from committed
 * Session events. The policy is opt-in, per Session, and resets every turn.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTool,
  createAdaptivePolicy,
  REASON_EXPLORATION,
  REASON_PLAN,
} from '../src/adaptive.js';
import { normalizeConfig } from '../src/policy.js';

/** A normalized config with the adaptive switch on. */
function config(overrides = {}) {
  return normalizeConfig({ adaptiveEnabled: true, ...overrides });
}

/** One assistant message with a reasoning-token spend. */
function assistant(tokens) {
  return { type: 'assistant/message', data: { usage: { reasoningTokens: tokens } } };
}

test('tool names are classified by what they do, never by difficulty', () => {
  assert.equal(classifyTool('bash'), 'exec');
  assert.equal(classifyTool('terminal_send'), 'exec');
  assert.equal(classifyTool('write'), 'mutate');
  assert.equal(classifyTool('edit'), 'mutate');
  assert.equal(classifyTool('read'), 'other');
  assert.equal(classifyTool('grep'), 'other');
  assert.equal(classifyTool(undefined), 'other');
});

test('the policy does nothing while disabled or for an explicit selection', () => {
  const policy = createAdaptivePolicy();
  policy.observe('s1', assistant(5000));
  assert.equal(policy.decide('s1', { requested: 'auto', config: normalizeConfig({}) }).level, undefined);
  assert.equal(policy.decide('s1', { requested: 'high', config: config() }).level, undefined);
  assert.equal(policy.decide('s1', { requested: undefined, config: config() }).level, undefined);
});

test('an expensive exploration round lowers the next request, a write ends the phase', () => {
  const policy = createAdaptivePolicy();
  const cfg = config();

  // First request: no previous round yet, so the default stands.
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).phase, 'exploring');
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, undefined);

  // The first assistant round thinks expensively; exploration continues.
  policy.observe('s1', assistant(1600));
  const lowered = policy.decide('s1', { requested: 'auto', config: cfg });
  assert.equal(lowered.level, 'low');
  assert.equal(lowered.reason, REASON_EXPLORATION);
  assert.equal(lowered.phase, 'exploring');

  // A read-only tool keeps the phase alive.
  policy.observe('s1', { type: 'tool/call', data: { name: 'read' } });
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, 'low');

  // A write (or local execution) ends it and restores the default.
  policy.observe('s1', { type: 'tool/call', data: { name: 'edit' } });
  const executing = policy.decide('s1', { requested: 'auto', config: cfg });
  assert.equal(executing.level, undefined);
  assert.equal(executing.phase, 'executing');

  policy.observe('s1', { type: 'tool/call', data: { name: 'bash' } });
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).phase, 'executing');
});

test('only a turn-local expensive round triggers; a new turn resets', () => {
  const policy = createAdaptivePolicy();
  const cfg = config();
  policy.observe('s1', assistant(1600));
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, 'low');

  policy.observe('s1', { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, undefined);

  policy.observe('s1', { type: 'turn/start', data: { turn: 2 } });
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, undefined);
});

test('the threshold is a floor and can be lowered for tests', () => {
  const policy = createAdaptivePolicy();
  assert.equal(policy.decide('a', { requested: 'auto', config: config({ adaptiveReasoningThreshold: 2000 }) }).level, undefined);
  policy.observe('a', assistant(1999));
  assert.equal(policy.decide('a', { requested: 'auto', config: config({ adaptiveReasoningThreshold: 2000 }) }).level, undefined);
  policy.observe('a', assistant(2000));
  assert.equal(policy.decide('a', { requested: 'auto', config: config({ adaptiveReasoningThreshold: 2000 }) }).level, 'low');

  const eager = createAdaptivePolicy();
  assert.equal(eager.decide('b', {
    requested: 'auto',
    config: config({ adaptiveReasoningThreshold: 0, adaptiveTrigger: 'reasoning' }),
  }).level, undefined, 'reasoning-only mode needs a reported token count');
  eager.observe('b', assistant(0));
  assert.equal(eager.decide('b', {
    requested: 'auto',
    config: config({ adaptiveReasoningThreshold: 0, adaptiveTrigger: 'reasoning' }),
  }).level, 'low');
});

test('plan mode maps to its own depth and wins over exploration', () => {
  const policy = createAdaptivePolicy();
  const cfg = config({ adaptivePlanLevel: 'max' });
  policy.observe('s1', assistant(5000));
  const decision = policy.decide('s1', { requested: 'auto', planActive: true, config: cfg });
  assert.equal(decision.level, 'max');
  assert.equal(decision.reason, REASON_PLAN);
  assert.equal(decision.phase, 'plan');

  // Turning the mapping off falls back to the exploration rule.
  const noPlan = policy.decide('s1', { requested: 'auto', planActive: true, config: config({ adaptivePlanMode: false }) });
  assert.equal(noPlan.level, 'low');
});

test('sessions are isolated and a malformed event is ignored', () => {
  const policy = createAdaptivePolicy();
  const cfg = config();
  policy.observe('root', assistant(1600));
  policy.observe('child', assistant(10));
  assert.equal(policy.decide('root', { requested: 'auto', config: cfg }).level, 'low');
  assert.equal(policy.decide('child', { requested: 'auto', config: cfg }).level, undefined);

  policy.observe('root', null);
  policy.observe('root', { type: 'assistant/message', data: {} });
  assert.equal(policy.decide('root', { requested: 'auto', config: cfg }).level, 'low');

  policy.reset('root');
  assert.equal(policy.decide('root', { requested: 'auto', config: cfg }).level, undefined);
});


test('without reported reasoning tokens, auto falls back to assistant rounds', () => {
  const policy = createAdaptivePolicy();
  const cfg = config(); // adaptiveTrigger: auto

  // A gateway that reports no reasoningTokens: usage exists but the field is absent.
  policy.observe('s1', { type: 'assistant/message', data: { usage: { inputTokens: 10, outputTokens: 5 } } });
  assert.equal(policy.decide('s1', { requested: 'auto', config: cfg }).level, 'low');

  // The round count is configurable.
  const twoRounds = createAdaptivePolicy();
  const strict = config({ adaptiveMinRounds: 2 });
  twoRounds.observe('a', { type: 'assistant/message', data: { usage: {} } });
  assert.equal(twoRounds.decide('a', { requested: 'auto', config: strict }).level, undefined);
  twoRounds.observe('a', { type: 'assistant/message', data: { usage: {} } });
  assert.equal(twoRounds.decide('a', { requested: 'auto', config: strict }).level, 'low');

  // `rounds` ignores reasoning tokens entirely; `reasoning` ignores rounds.
  const roundsOnly = createAdaptivePolicy();
  roundsOnly.observe('b', assistant(9999));
  assert.equal(roundsOnly.decide('b', {
    requested: 'auto',
    config: config({ adaptiveTrigger: 'rounds', adaptiveMinRounds: 2 }),
  }).level, undefined);
  assert.equal(roundsOnly.decide('b', {
    requested: 'auto',
    config: config({ adaptiveTrigger: 'reasoning', adaptiveReasoningThreshold: 9999 }),
  }).level, 'low');

  const reasoningOnly = createAdaptivePolicy();
  reasoningOnly.observe('c', { type: 'assistant/message', data: { usage: { outputTokens: 5 } } });
  assert.equal(reasoningOnly.decide('c', {
    requested: 'auto',
    config: config({ adaptiveTrigger: 'reasoning' }),
  }).level, undefined, 'no reported tokens means the reasoning rule never engages');
});
