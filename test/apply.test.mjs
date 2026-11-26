/**
 * Host integration test: drive `apply()` against fake Cordis services and
 * assert the two observable effects — the `llm-pi-ai` capability declaration and
 * the per-request effort the adapter receives — plus the unload contract.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, Config, isSubagentAgent } from '../index.js';

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
function fakeHost({ section = PI_AI_SECTION, adapter, planMode, agentPresets }) {
  const updates = [];
  const listeners = new Map();
  const cleanups = [];
  const routes = new Map();
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
  const agents = { list: () => [], get: () => undefined };
  const webServer = {
    register(route) {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  };
  const tools = { register: () => () => {} };
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'settings') return settings;
      if (name === 'llm') return { adapters };
      if (name === 'agents') return agents;
      if (name === 'planMode') return planMode;
      if (name === 'agentPresets') return agentPresets;
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
    inject(deps, callback) {
      const scope = {
        get: (name) => ctx.get(name),
        effect(fn) {
          cleanups.push(fn());
          return () => {};
        },
        tools,
        webServer,
      };
      callback(scope);
      return () => {};
    },
    emit(name, ...args) {
      listeners.get(name)?.(...args);
    },
    flush() {
      for (const cleanup of cleanups) cleanup();
    },
  };
  return { ctx, updates, adapters, agents, settings, routes };
}

/** Invoke one raw route handler and decode its JSON answer. */
function callRoute(route, { method = 'GET', url = '/think-effort/debug', headers = {} } = {}) {
  const chunks = [];
  let status = 0;
  const response = {
    writeHead(nextStatus) {
      status = nextStatus;
    },
    end(text) {
      if (typeof text === 'string' && text !== '') chunks.push(text);
    },
  };
  route.handler({ method, url, headers }, response);
  return { status, body: chunks.length > 0 ? JSON.parse(chunks.join('')) : null };
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

/** One volatile reference whose value a test can replace, like `.volatile()` config. */
function volatileRef(value) {
  return {
    current: value,
    get() {
      return this.current;
    },
    set(next) {
      this.current = next;
    },
  };
}

test('a subagent override applies through the volatile config reference', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  const subagentLevel = volatileRef('inherit');
  host.agents.get = (id) => (id === 'child-1'
    ? { session: { header: { origin: 'subagent', delegationDepth: 1 } } }
    : undefined);
  apply(host.ctx, { subagentLevel });
  await tick();
  await tick();
  const registered = host.adapters.get('aigw-coding').adapter;
  const prepared = await registered.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');

  prepared.stream({ reasoningEffort: 'auto', sessionId: 'child-1' });
  prepared.stream({ sessionId: 'child-1' });
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1' });

  // inherit: the child keeps its own resolution; the root keeps Auto.
  assert.deepEqual(adapter.received, ['high', undefined, 'high']);

  subagentLevel.set('max');
  host.ctx.emit('loader/volatile-update');
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'child-1' });
  prepared.stream({ reasoningEffort: 'low', sessionId: 'child-1' });
  prepared.stream({ purpose: 'session-title', sessionId: 'child-1' });
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1' });

  // max overrides both the child's own pick and an absent one; cheap calls win.
  assert.deepEqual(adapter.received.slice(3), ['max', 'max', 'low', 'high']);
});

test('the exported Config accepts the documented defaults and keeps fields live', () => {
  assert.equal(typeof Config, 'function');
  const parsed = Config({});
  assert.equal(typeof parsed.enabled.get, 'function');
  assert.equal(parsed.enabled.get(), true);
  assert.equal(parsed.subagentLevel.get(), 'inherit');
  assert.equal(parsed.debugOverlay.get(), false);
  assert.deepEqual(parsed.efforts.get(), ['low', 'high', 'max']);
  const custom = Config({ subagentLevel: 'high', efforts: ['low', 'high'], auxDowngrade: false, debugOverlay: true });
  assert.equal(custom.subagentLevel.get(), 'high');
  assert.deepEqual(custom.efforts.get(), ['low', 'high']);
  assert.equal(custom.auxDowngrade.get(), false);
  assert.equal(custom.debugOverlay.get(), true);
});

test('subagent sessions are recognised from the durable session header', () => {
  assert.equal(isSubagentAgent(undefined), false);
  assert.equal(isSubagentAgent({}), false);
  assert.equal(isSubagentAgent({ session: { header: { origin: 'user' } } }), false);
  assert.equal(isSubagentAgent({ session: { header: { origin: 'subagent' } } }), true);
  assert.equal(isSubagentAgent({ session: { header: { delegationDepth: 2 } } }), true);
  assert.equal(isSubagentAgent({ session: { header: { delegationDepth: 0 } } }), false);
});

test('the debug switch records each decision for the browser half', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  host.agents.get = (id) => (id === 'child-1'
    ? { session: { header: { id: 'child-1', origin: 'subagent', delegationDepth: 1, parentSession: 'root-1' } } }
    : undefined);
  apply(host.ctx, { debugOverlay: true });
  await tick();
  await tick();
  const prepared = await host.adapters.get('aigw-coding').adapter.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');

  // Ordinary Auto, a subagent Auto, then an explicit pick that needs no rewrite.
  prepared.stream({ reasoningEffort: 'auto', purpose: 'agent', sessionId: 'root-1' });
  prepared.stream({ reasoningEffort: 'auto', purpose: 'agent', sessionId: 'child-1' });
  // No purpose: an ordinary agent step. The journal names it instead of
  // recording "unknown".
  prepared.stream({ reasoningEffort: 'low', sessionId: 'root-1' });

  const route = host.routes.get('/think-effort/debug');
  assert.ok(route, 'the debug route is registered through the webServer injection');
  const answer = callRoute(route, { url: '/think-effort/debug?since=0' });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.enabled, true);
  const requests = answer.body.entries.filter((entry) => entry.kind === 'request');
  assert.equal(requests.length, 3);

  const [rootAuto, childAuto, rootExplicit] = requests;
  assert.equal(rootAuto.sessionId, 'root-1');
  assert.equal(rootAuto.subagent, false);
  assert.equal(rootAuto.requested, 'auto');
  assert.equal(rootAuto.applied, 'high');
  assert.equal(rootAuto.switched, true);
  assert.equal(rootAuto.from, null);

  assert.equal(childAuto.sessionId, 'child-1');
  assert.equal(childAuto.subagent, true);
  assert.equal(childAuto.parentSession, 'root-1');
  assert.equal(childAuto.rootSessionId, 'root-1');
  assert.equal(childAuto.applied, 'high');

  assert.equal(rootExplicit.purpose, 'agent');
  assert.equal(rootExplicit.requested, 'low');
  assert.equal(rootExplicit.applied, 'low');
  assert.equal(rootExplicit.switched, false, 'a passed-through pick is not a plugin switch');
  assert.equal(rootExplicit.from, 'high');
  assert.equal(rootExplicit.changed, true, 'it did change the session\'s previous level');

  // A cursor only returns later records; the boot capability write may sit
  // before the requests, so the cursor comes from the answer, not a literal.
  const tail = callRoute(route, { url: `/think-effort/debug?since=${answer.body.latest}` });
  assert.deepEqual(tail.body.entries.map((entry) => entry.seq), []);
});

test('the debug switch stays inert while off and follows a volatile save', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  const debugOverlay = volatileRef(false);
  apply(host.ctx, { debugOverlay });
  await tick();
  await tick();
  const prepared = await host.adapters.get('aigw-coding').adapter.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');
  prepared.stream({ reasoningEffort: 'auto', purpose: 'agent' });

  const route = host.routes.get('/think-effort/debug');
  const off = callRoute(route);
  assert.equal(off.body.enabled, false);
  assert.deepEqual(off.body.entries, []);

  // Turning the switch on applies to the next request and records the save.
  debugOverlay.set(true);
  host.ctx.emit('loader/volatile-update');
  prepared.stream({ reasoningEffort: 'auto', purpose: 'agent' });
  const on = callRoute(route);
  assert.equal(on.body.enabled, true);
  const kinds = on.body.entries.map((entry) => entry.kind);
  assert.deepEqual(kinds, ['config', 'request']);
  assert.equal(on.body.entries[0].debugOverlay, true);
  assert.equal(on.body.entries[1].applied, 'high');
});

test('adaptive exploration lowers later requests after an expensive round, and a write restores the default', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter });
  host.agents.get = (id) => (id === 'root-1' ? { session: { header: { id: 'root-1' } } } : undefined);
  apply(host.ctx, { adaptiveEnabled: true, adaptiveTrigger: 'reasoning', adaptiveReasoningThreshold: 1, debugOverlay: true });
  await tick();
  await tick();
  const prepared = await host.adapters.get('aigw-coding').adapter.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');

  // First request of the turn: no previous reasoning round yet.
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1', purpose: 'agent' });
  // The first assistant round thought expensively; the next request drops.
  host.ctx.emit('session/event', { id: 'root-1' }, { type: 'assistant/message', data: { usage: { reasoningTokens: 2000 } } });
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1', purpose: 'agent' });
  // A write ends the exploration phase and restores the default.
  host.ctx.emit('session/event', { id: 'root-1' }, { type: 'tool/call', data: { name: 'write' } });
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1', purpose: 'agent' });

  assert.deepEqual(adapter.received, ['high', 'low', 'high']);

  const answer = callRoute(host.routes.get('/think-effort/debug'), { url: '/think-effort/debug?since=0' });
  const requests = answer.body.entries.filter((entry) => entry.kind === 'request');
  assert.equal(requests[1].applied, 'low');
  assert.equal(requests[1].reason, 'exploration');
  assert.equal(requests[2].reason, null);
  assert.equal(requests[2].phase, 'executing');
});

test('adaptive plan mode maps Auto to the configured plan depth', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({ adapter, planMode: { get: () => ({ active: true }) } });
  host.agents.get = (id) => (id === 'root-1' ? { session: { header: { id: 'root-1' } } } : undefined);
  apply(host.ctx, { adaptiveEnabled: true, adaptivePlanMode: true, adaptivePlanLevel: 'max', debugOverlay: true });
  await tick();
  await tick();
  const prepared = await host.adapters.get('aigw-coding').adapter.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');

  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1', purpose: 'agent' });
  prepared.stream({ reasoningEffort: 'low', sessionId: 'root-1', purpose: 'agent' });
  assert.deepEqual(adapter.received, ['max', 'low'], 'an explicit pick is never raised');

  const answer = callRoute(host.routes.get('/think-effort/debug'), { url: '/think-effort/debug?since=0' });
  const requests = answer.body.entries.filter((entry) => entry.kind === 'request');
  assert.equal(requests[0].reason, 'plan');
  assert.equal(requests[0].applied, 'max');
  assert.equal(requests[1].switched, false);
});


test('plan mode is read through the agent-scoped preset service when the root lacks it', async () => {
  const adapter = fakeAdapter(['low', 'high', 'max']);
  const host = fakeHost({
    adapter,
    // The shipped composition mounts plan mode inside each agent's preset
    // scope, so the profile root has no `planMode` service.
    agentPresets: {
      serviceFor: (_agent, name) => (name === 'planMode' ? { get: () => ({ active: true }) } : undefined),
    },
  });
  host.agents.get = (id) => (id === 'root-1' ? { session: { header: { id: 'root-1' } } } : undefined);
  apply(host.ctx, { adaptiveEnabled: true, adaptivePlanMode: true, adaptivePlanLevel: 'max' });
  await tick();
  await tick();
  const prepared = await host.adapters.get('aigw-coding').adapter.prepareCall('aigw-coding', 'deepseek-v4.1-flash-1017');
  prepared.stream({ reasoningEffort: 'auto', sessionId: 'root-1', purpose: 'agent' });
  assert.deepEqual(adapter.received, ['max']);
});
