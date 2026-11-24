/**
 * Policy regression suite. Every case names the rule it pins down;
 * the plugin has no runtime dependency, so `node --test test/` is the whole
 * build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEEPSEEK_DEFAULT_EFFORT,
  clampEffort,
  isAuxPurpose,
  isDeepSeekHost,
  isDeepSeekModel,
  normalizeConfig,
  planCapabilitySection,
  resolveCallEffort,
  shouldDeclare,
  withAutoEffort,
} from '../src/policy.js';

const CONFIG = normalizeConfig({});

const effortsOf = (...ids) => ids.map((id) => ({ id, name: id }));

test('DeepSeek host detection matches the host and its subdomains only', () => {
  assert.equal(isDeepSeekHost('https://api.deepseek.com/v1'), true);
  assert.equal(isDeepSeekHost('https://api.deepseek.com'), true);
  assert.equal(isDeepSeekHost('https://beta.api.deepseek.com:8443/v1'), true);
  // Hosts are matched exactly, not as substrings: a look-alike domain never qualifies.
  assert.equal(isDeepSeekHost('https://notdeepseek.com/v1'), false);
  assert.equal(isDeepSeekHost('https://deepseek.com.evil.test/v1'), false);
  assert.equal(isDeepSeekHost('https://ai.ctaigw.cn/coding/v1'), false);
  assert.equal(isDeepSeekHost(undefined), false);
});

test('DeepSeek model detection covers catalog ids and gateway aliases', () => {
  assert.equal(isDeepSeekModel('deepseek-v4-flash'), true);
  assert.equal(isDeepSeekModel('deepseek-v4-pro'), true);
  assert.equal(isDeepSeekModel('deepseek-v4.1-flash-1017'), true);
  assert.equal(isDeepSeekModel('DeepSeek-V4.1-Flash'), true);
  assert.equal(isDeepSeekModel('hy4-flash'), false);
  assert.equal(isDeepSeekModel('qwen3.6-plus'), false);
  assert.equal(isDeepSeekModel('deepseek-x', '('), false);
});

test('declaration decision reports why a model qualifies', () => {
  assert.deepEqual(
    shouldDeclare({ provider: 'aigw-coding', modelId: 'deepseek-v4.1-flash-1017', baseURL: 'https://ai.ctaigw.cn/coding/v1' }, CONFIG),
    { declared: true, reason: 'deepseek-model' },
  );
  assert.deepEqual(
    shouldDeclare({ provider: 'deepseek', modelId: 'some-model', baseURL: 'https://api.deepseek.com' }, CONFIG),
    { declared: true, reason: 'deepseek-host' },
  );
  assert.equal(
    shouldDeclare({ provider: 'aigw-coding', modelId: 'hy4-flash', baseURL: 'https://ai.ctaigw.cn/coding/v1' }, CONFIG).declared,
    false,
  );
  const extra = normalizeConfig({ declareModels: ['aigw-coding/hy4-flash'] });
  assert.equal(
    shouldDeclare({ provider: 'aigw-coding', modelId: 'hy4-flash', baseURL: 'https://ai.ctaigw.cn/coding/v1' }, extra).declared,
    true,
  );
});

const SECTION = {
  providers: {
    'aigw-coding': {
      api: 'openai-responses',
      baseURL: 'https://ai.ctaigw.cn/coding/v1',
      models: [
        { id: 'deepseek-v4.1-flash-1017', name: 'deepseek-v4.1-flash-1017' },
        { id: 'hy4-flash', name: 'hy4-flash' },
      ],
    },
  },
};

test('capability plan declares DeepSeek models and only those', () => {
  const plan = planCapabilitySection(SECTION, CONFIG);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.declared, [{ provider: 'aigw-coding', model: 'deepseek-v4.1-flash-1017', reason: 'deepseek-model' }]);
  const profile = plan.section.providers['aigw-coding'];
  assert.deepEqual(profile.models[0].reasoningEfforts, { low: 'low', high: 'high', max: 'max' });
  assert.equal(profile.models[1].reasoningEfforts, undefined);
  // The route keeps its declared default depth (DeepSeek: high).
  assert.equal(profile.reasoning, DEEPSEEK_DEFAULT_EFFORT);
  // The input section is never mutated in place.
  assert.equal(SECTION.providers['aigw-coding'].models[0].reasoningEfforts, undefined);
});

test('capability plan is idempotent: a declared section is returned by identity', () => {
  const once = planCapabilitySection(SECTION, CONFIG);
  const twice = planCapabilitySection(once.section, CONFIG);
  assert.equal(twice.changed, false);
  assert.equal(twice.section, once.section);
  assert.deepEqual(twice.declared, []);
});

test('an explicit vocabulary or an explicit `false` is never overwritten', () => {
  const explicit = {
    providers: {
      'aigw-coding': {
        baseURL: 'https://ai.ctaigw.cn/coding/v1',
        reasoning: 'low',
        models: [
          { id: 'deepseek-v4.1-flash-1017', reasoningEfforts: { low: 'l', high: 'h' } },
          { id: 'deepseek-v4-pro', reasoningEfforts: false },
        ],
      },
    },
  };
  const plan = planCapabilitySection(explicit, CONFIG);
  assert.equal(plan.changed, false);
  assert.equal(plan.section, explicit);
});

test('modelOverrides entries are declared too, and keep the route default', () => {
  const overrides = {
    providers: {
      deepseek: {
        baseURL: 'https://api.deepseek.com',
        models: [{ id: 'deepseek-v4-pro' }],
        modelOverrides: { 'deepseek-v4-pro': { contextWindow: 1000000 } },
      },
    },
  };
  const plan = planCapabilitySection(overrides, CONFIG);
  assert.equal(plan.changed, true);
  const profile = plan.section.providers.deepseek;
  assert.deepEqual(profile.modelOverrides['deepseek-v4-pro'].reasoningEfforts, { low: 'low', high: 'high', max: 'max' });
  assert.equal(profile.modelOverrides['deepseek-v4-pro'].contextWindow, 1000000);
});

test('Auto is added once and placed first, like the desktop switcher', () => {
  const info = { provider: 'p', id: 'm', name: 'M', reasoning: { efforts: effortsOf('low', 'high', 'max'), defaultEffort: 'high' } };
  const decorated = withAutoEffort(info, CONFIG, { declared: true });
  assert.deepEqual(decorated.reasoning.efforts.map((effort) => effort.id), ['auto', 'low', 'high', 'max']);
  assert.equal(decorated.reasoning.defaultEffort, 'high');
  const again = withAutoEffort(decorated, CONFIG, { declared: true });
  assert.equal(again, decorated);
  // A model without reasoning metadata gains nothing.
  const plain = { provider: 'p', id: 'm', name: 'M' };
  assert.equal(withAutoEffort(plain, CONFIG, { declared: true }), plain);
});

test('autoScope declared leaves non-declared models alone', () => {
  const scoped = normalizeConfig({ autoScope: 'declared' });
  const info = { provider: 'p', id: 'm', name: 'M', reasoning: { efforts: effortsOf('high') } };
  assert.equal(withAutoEffort(info, scoped, { declared: false }), info);
  assert.notEqual(withAutoEffort(info, scoped, { declared: true }), info);
  assert.equal(withAutoEffort(info, normalizeConfig({ autoScope: 'off' }), { declared: true }), info);
});

test('clamping prefers the nearest declared depth and never invents one', () => {
  const vocab = effortsOf('auto', 'low', 'high', 'max');
  assert.equal(clampEffort('low', vocab), 'low');
  assert.equal(clampEffort('medium', vocab), 'high');
  assert.equal(clampEffort('xhigh', vocab), 'max');
  assert.equal(clampEffort('off', vocab), 'low');
  assert.equal(clampEffort('minimal', vocab), 'low');
  assert.equal(clampEffort('low', effortsOf('auto')), undefined);
  assert.equal(clampEffort('low', [], 'high'), 'high');
});

test('an ordinary unset or explicit selection is never rewritten', () => {
  const vocab = effortsOf('auto', 'low', 'high', 'max');
  assert.equal(resolveCallEffort({ requested: undefined, efforts: vocab, defaultEffort: 'high', purpose: 'agent' }, CONFIG), undefined);
  assert.equal(resolveCallEffort({ requested: undefined, efforts: vocab, defaultEffort: 'high' }, CONFIG), undefined);
  assert.equal(resolveCallEffort({ requested: 'max', efforts: vocab, defaultEffort: 'high', purpose: 'session-title' }, CONFIG), undefined);
  assert.equal(resolveCallEffort({ requested: 'high', efforts: vocab, defaultEffort: 'high' }, CONFIG), undefined);
});

test('cheap calls drop to Low even with no explicit selection', () => {
  const vocab = effortsOf('auto', 'low', 'high', 'max');
  assert.equal(resolveCallEffort({ requested: undefined, efforts: vocab, defaultEffort: 'high', purpose: 'session-title' }, CONFIG), 'low');
  assert.equal(resolveCallEffort({ requested: undefined, efforts: vocab, defaultEffort: 'high', purpose: 'compaction' }, CONFIG), 'low');
  // A model that cannot go lower keeps its own default.
  assert.equal(resolveCallEffort({ requested: undefined, efforts: effortsOf('high', 'max'), defaultEffort: 'high', purpose: 'compaction' }, CONFIG), 'high');
});

test('Auto resolves to the declared default (DeepSeek: high)', () => {
  const vocab = effortsOf('auto', 'low', 'high', 'max');
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: vocab, defaultEffort: 'high', purpose: 'chat' }, CONFIG), 'high');
  // No route default: keep the official hub rather than the cheapest level.
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: vocab, purpose: 'chat' }, CONFIG), 'high');
  // A vocabulary without high clamps to the nearest depth, tie going upward.
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: effortsOf('auto', 'low', 'max'), defaultEffort: 'high' }, CONFIG), 'max');
  // No depth at all: leave the request as the adapter default.
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: effortsOf('auto') }, CONFIG), undefined);
});

test('cheap host-owned calls drop to Low when the model declares it', () => {
  const vocab = effortsOf('auto', 'low', 'high', 'max');
  for (const purpose of ['session-title', 'compaction', 'auto-review']) {
    assert.equal(resolveCallEffort({ requested: 'auto', efforts: vocab, defaultEffort: 'high', purpose }, CONFIG), 'low');
  }
  // A normal step keeps the default.
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: vocab, defaultEffort: 'high', purpose: 'agent' }, CONFIG), 'high');
  // A model with no Low keeps the default instead of inventing a cheaper one.
  const noLow = effortsOf('auto', 'high', 'max');
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: noLow, defaultEffort: 'high', purpose: 'session-title' }, CONFIG), 'high');
  // The toggle turns the downgrade off.
  const off = normalizeConfig({ auxDowngrade: false });
  assert.equal(isAuxPurpose('session-title', off), false);
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: vocab, defaultEffort: 'high', purpose: 'session-title' }, off), 'high');
});

test('autoLevel may pin a fixed depth, still clamped to the vocabulary', () => {
  const pinned = normalizeConfig({ autoLevel: 'max' });
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: effortsOf('auto', 'low', 'high'), defaultEffort: 'high' }, pinned), 'high');
  assert.equal(resolveCallEffort({ requested: 'auto', efforts: effortsOf('auto', 'low', 'high', 'max'), defaultEffort: 'high' }, pinned), 'max');
});

test('config normalization keeps arrays usable', () => {
  const cfg = normalizeConfig({ efforts: [], auxPurposes: 'nope', deepseekHosts: null });
  assert.deepEqual(cfg.efforts, ['low', 'high', 'max']);
  assert.deepEqual(cfg.auxPurposes, ['session-title', 'compaction', 'auto-review']);
  assert.deepEqual(cfg.deepseekHosts, ['deepseek.com']);
});
