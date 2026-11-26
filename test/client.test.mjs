/**
 * Browser-half integration test: load `client.js` through a fake module loader,
 * then drive `apply()` against fake Cordis services and assert what the page
 * registers — the Plugins row configuration, the Settings section that exposes
 * the same form, and the icon that must share the section's id.
 *
 * Rendering is out of scope (the component tree is plain hyperscript and its
 * behaviour is verified in a real Host); what matters here is the registration
 * contract, because a drifted key or id silently hides the page.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const ROW_ID = 'think-effort';

/** A minimal React stand-in: apply() never runs hooks, only the components do. */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useMemo: (factory) => factory(),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
};

/** Load the browser half once and return its plugin definition. */
let cachedDefinition;
async function loadClient() {
  if (cachedDefinition !== undefined) return cachedDefinition;
  let registration;
  globalThis.window = { __ModuleLoader__: { load: (module) => { registration = module; } } };
  // A query keeps the URL distinct from any other import of this file; the
  // module body runs once, so the definition is cached across tests.
  await import(`${new URL('../client.js', import.meta.url).href}?client-test`);
  assert.ok(registration, 'client.js must register itself with window.__ModuleLoader__');
  assert.equal(registration.id, 'dsh-think-effort');
  // The loader hands the factory a `require` for the module table; React is the
  // only entry this page asks for.
  cachedDefinition = registration.factory((name) => {
    assert.equal(name, 'react');
    return React;
  });
  return cachedDefinition;
}

/** Fake services that record every registration and its disposal. */
function fakeCordis() {
  const calls = { inject: [], register: [], whileServed: [], get: [], effect: 0, locale: [] };
  const disposers = [];
  const registrations = [];
  const form = {
    getSnapshot: () => ({ status: 'ready', value: { enabled: true }, revision: 1, user: {}, base: undefined, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
  };
  const slots = {
    inject(name, callback) {
      calls.inject.push(name);
      const disposer = callback();
      return () => { if (typeof disposer === 'function') disposer(); };
    },
    register(options, component) {
      calls.register.push({ options, component });
      let disposed = false;
      const disposer = () => { disposed = true; };
      registrations.push({ options, get disposed() { return disposed; } });
      return disposer;
    },
  };
  const configForms = {
    whileServed(namespaces, register) {
      calls.whileServed.push(namespaces);
      const disposer = register(new Set(namespaces));
      return () => { if (typeof disposer === 'function') disposer(); };
    },
    get(id) {
      calls.get.push(id);
      return form;
    },
  };
  const locale = {
    register(namespace, language, dictionary) {
      calls.locale.push({ namespace, language, dictionary });
      return () => {};
    },
    bind: () => (key) => key,
  };
  const ctx = {
    // Cordis exposes injected services both as context properties and through
    // `ctx.get`; the page uses the property for configForms and `get` for the
    // optional locale/slots lookups.
    configForms,
    get(name) {
      calls.get.push(name);
      if (name === 'locale') return locale;
      if (name === 'slots') return slots;
      if (name === 'configForms') return configForms;
      return undefined;
    },
    effect(callback) {
      calls.effect += 1;
      const disposer = callback();
      disposers.push(disposer);
      return () => { if (typeof disposer === 'function') disposer(); };
    },
  };
  return { ctx, calls, registrations, form, disposeAll: () => { for (const dispose of disposers) dispose?.(); } };
}

test('the module declares the browser half and injects the services it uses', async () => {
  const definition = await loadClient();
  assert.deepEqual(definition.inject, ['slots', 'locale', 'configForms']);
  assert.equal(typeof definition.apply, 'function');
});

test('the Plugins row configuration keeps its package#row key', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  const row = fake.registrations.find((entry) => entry.options.name === 'plugins.row.config');
  assert.ok(row, 'plugins.row.config must be registered');
  assert.equal(row.options.key, `dsh-think-effort#${ROW_ID}`);
});

test('the Settings section exposes the same form under the row namespace', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  assert.deepEqual(fake.calls.whileServed, [[ROW_ID]], 'the section follows the row settings namespace');
  assert.ok(fake.calls.get.includes(ROW_ID), 'the section reads the row form from configForms');
  const section = fake.registrations.find((entry) => entry.options.name === 'settings.section');
  assert.ok(section, 'settings.section must be registered');
  assert.equal(section.options.id, ROW_ID);
  assert.equal(section.options.order, 16);
  assert.equal(section.options.locale, 'think-effort');
  assert.equal(section.options.label(), 'nav');
});

test('the Settings icon is paired with the section id', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  const section = fake.registrations.find((entry) => entry.options.name === 'settings.section');
  const icon = fake.registrations.find((entry) => entry.options.name === 'settings.section.icon');
  assert.ok(icon, 'settings.section.icon must be registered');
  assert.equal(icon.options.id, section.options.id, 'an unmatched icon id never renders');
});

test('the floating debug log registers into the frame-wide overlay', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  assert.ok(fake.calls.inject.includes('shell.overlay'), 'the overlay seat must be declared as injected');
  const overlay = fake.calls.register.find((entry) => entry.options.name === 'shell.overlay');
  assert.ok(overlay, 'shell.overlay must be registered');
  assert.equal(overlay.options.id, 'think-effort-debug');
  assert.equal(typeof overlay.component, 'function');
});

test('both surfaces unregister when the Host stops serving the namespace', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  fake.disposeAll();
  const owned = fake.registrations.filter((entry) => entry.options.name.startsWith('settings.') || entry.options.name === 'shell.overlay');
  assert.equal(owned.length, 3);
  for (const entry of owned) assert.equal(entry.disposed, true, `${entry.options.name} must unregister`);
});

test('both locales carry the navigation and debug labels', async () => {
  const definition = await loadClient();
  const fake = fakeCordis();
  definition.apply(fake.ctx);
  const zh = fake.calls.locale.find((entry) => entry.language === 'zh');
  const en = fake.calls.locale.find((entry) => entry.language === 'en');
  assert.ok(zh?.dictionary.nav, 'zh dictionary needs the nav label');
  assert.ok(en?.dictionary.nav, 'en dictionary needs the nav label');
  for (const key of [
    'debugSection', 'debugOverlayRow', 'debugTitle', 'debugEmpty', 'debugFilterCurrent',
    'sectionAdaptive', 'adaptiveEnabledRow', 'adaptiveExplorationRow', 'adaptiveThresholdRow',
    'debugReasonExploration', 'debugReasonPlan',
  ]) {
    assert.ok(zh?.dictionary[key], `zh dictionary needs ${key}`);
    assert.ok(en?.dictionary[key], `en dictionary needs ${key}`);
  }
});
