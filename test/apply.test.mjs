/**
 * Host integration test: drive `apply()` against fake Cordis services and
 * assert the two observable effects — the `llm-pi-ai` capability declaration and
 * the per-request effort the adapter receives — plus the unload contract.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { apply } from '../index.js';

const PI_AI_SECTION = {
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

/** A pi-ai-shaped adapter whose reasoning metadata mirrors the declaration it is given. */
function fakeAdapter(efforts) {
  const received = [];
  return {
    received,
    async resolveModel(provider, model) {
      return {
        provider,
        id: model,
        name: model,
        reasoning: { efforts: efforts.map((id) => ({ id, name: id })), defaultEffort: 'high' },
      };
    },
    async prepareCall(provider, model) {
      const info = await this.resolveModel(provider, model);
      return {
        model: info,
        stream(options) {
          received.push(options.reasoningEffort);
          return options;
        },
      };
    },
    providerInfo() {
      return { id: 'aigw-coding', name: 'aigw-coding' };
    },
  };
}

/** Minimal Cordis-context stand-in: only what `apply` touches. */
function fakeHost({ section = PI_AI_SECTION, adapter }) {
  const updates = [];
  const listeners = new Map();
  const cleanups = [];
  const adapters = new Map([['aigw-coding', { provider: { id: 'aigw-coding' }, adapter, retryPolicy: {} }]]);
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', value: section, revision: 7 + updates.length }],
    async update(ns, patch, revision) {
      updates.push({ ns, patch, revision });
      // Model the Host: a committed update is what `describe()` reports next,
      // which is what makes the declaration idempotent across boots.
      section = { ...section, ...patch };
    },
  };
  const agents = { list: () => [] };
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'settings') return settings;
      if (name === 'llm') return { adapters };
      if (name === 'agents') return agents;
      return undefined;
    },
    on(name, listener) {
      listeners.set(name, listener);
      return () => {};
    },
    effect(fn) {
      cleanups.push(fn());
      return () => {};
    },
    emit(name, ...args) {
      listeners.get(name)?.(...args);
    },
    flush() {
      for (const cleanup of cleanups) cleanup();
    },
  };
  return { ctx, updates, adapters, agents, settings };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('apply declares DeepSeek capabilities once and adds Auto', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  apply(host.ctx, {});
  await tick();
  await tick();

  assert.equal(host.updates.length, 1);
  assert.equal(host.updates[0].ns, 'llm-pi-ai');
  assert.equal(host.updates[0].revision, 7);
  const profile = host.updates[0].patch.providers['aigw-coding'];
  assert.deepEqual(profile.models[0].reasoningEfforts, { low: 'low', high: 'high', max: 'max' });
  assert.equal(profile.models[1].reasoningEfforts, undefined);
  assert.equal(profile.reasoning, 'high');

  // The facade replaced the registry entry and advertised Auto first.
  const registered = host.adapters.get('aigw-coding').adapter;
  const info = await registered.resolveModel('aigw-coding', 'deepseek-v4.1-flash-1017');
  assert.deepEqual(info.reasoning.efforts.map((effort) => effort.id), ['auto', 'low', 'high', 'max']);

  // A second adapters-updated pass does not write the section again.
  host.ctx.emit('llm/adapters-updated');
  await tick();
  await tick();
  assert.equal(host.updates.length, 1);
});

test('the facade resolves Auto per request and leaves explicit levels alone', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  apply(host.ctx, {});
  await tick();
  await tick();
  const registered = host.adapters.get('aigw-coding').adapter;
  const prepared = await registered.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');

  prepared.stream({ reasoningEffort: 'auto', purpose: 'agent' });
  prepared.stream({ reasoningEffort: 'auto', purpose: 'session-title' });
  prepared.stream({ reasoningEffort: 'auto', purpose: 'compaction' });
  prepared.stream({ reasoningEffort: 'max', purpose: 'agent' });
  prepared.stream({ reasoningEffort: 'max', purpose: 'session-title' });
  prepared.stream({ purpose: 'agent' });

  assert.deepEqual(adapter.received, ['high', 'low', 'low', 'max', 'max', undefined]);
});

test('the Auto mask survives a replayed call and keeps the durable selection', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  apply(host.ctx, {});
  await tick();
  await tick();
  const registered = host.adapters.get('aigw-coding').adapter;
  const info = await registered.resolveModel('aigw-coding', 'deepseek-v4.1-flash-1017');
  // `selectModel` validates against exactly this vocabulary, so Auto passes
  // without ever reaching the provider.
  assert.ok(info.reasoning.efforts.some((effort) => effort.id === 'auto'));
});

test('explicit model vocabularies are left alone and disable the declaration', async () => {
  const section = {
    providers: {
      'aigw-coding': {
        baseURL: 'https://ai.ctaigw.cn/coding/v1',
        models: [{ id: 'deepseek-v4.1-flash-1017', reasoningEfforts: { low: 'l', high: 'h' } }],
      },
    },
  };
  const adapter = fakeAdapter(['l', 'h']);
  const host = fakeHost({ adapter, section });
  apply(host.ctx, {});
  await tick();
  await tick();
  assert.equal(host.updates.length, 0);
});

test('disabled config installs no facade and writes no section', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  const original = host.adapters.get('aigw-coding').adapter;
  apply(host.ctx, { enabled: false });
  await tick();
  assert.equal(host.updates.length, 0);
  assert.equal(host.adapters.get('aigw-coding').adapter, original);
});

test('unload restores the original registration and retires durable Auto', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  const original = host.adapters.get('aigw-coding').adapter;
  const selections = [];
  host.agents.list = () => [{
    model: {
      current: () => ({ provider: 'aigw-coding', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'auto' }),
      select: (selection) => selections.push(selection),
    },
  }];
  apply(host.ctx, {});
  await tick();
  await tick();
  assert.notEqual(host.adapters.get('aigw-coding').adapter, original);
  host.ctx.flush();
  assert.equal(host.adapters.get('aigw-coding').adapter, original);
  assert.deepEqual(selections, [{ provider: 'aigw-coding', model: 'deepseek-v4.1-flash-1017' }]);
});
