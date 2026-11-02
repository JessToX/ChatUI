import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { g10 } from '../examples/iteration-one.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
async function mount(t, { saved, input = g10(), echo = true, saveSink, html = documentHtml } = {}) {
  const normalized = normalizeDocument(input), saves = [], transitions = [], errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const root = window.document.getElementById('chatui-component');
  const state = () => ({
    fields: [...root.querySelectorAll('[data-form-field]')].map(node => ({ id: node.dataset.formField, invalid: node.getAttribute('aria-invalid'), error: window.document.getElementById(node.getAttribute('aria-describedby').split(' ').at(-1)).textContent })),
    status: root.querySelector('.cui-input-form [role="status"]')?.textContent,
    snapshot: root.querySelector('[data-form-result]')?.hidden === false
  });
  const globals = value => { Object.assign(window.openai, value); window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: value } })); };
  window.openai = { toolOutput: normalized.view, widgetState: saved, setWidgetState(payload) {
    saves.push(copy(payload)); saveSink?.(copy(payload)); transitions.push({ phase: 'before-host-echo', ...state() });
    if (echo) queueMicrotask(() => { globals({ widgetState: copy(payload) }); transitions.push({ phase: 'after-host-echo', ...state() }); });
  } };
  for (const script of window.document.scripts) window.eval(script.textContent);
  for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await new Promise(resolve => setTimeout(resolve, 10));
  t.after(() => { window.dispatchEvent(new window.Event('pagehide')); window.close(); });
  const field = id => root.querySelector(`[data-form-field="${id}"]`);
  const change = async (id, value) => { const node = field(id); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new window.Event('input', { bubbles: true })); await Promise.resolve(); };
  const click = async action => { root.querySelector(`[data-form-action="${action}"]`).click(); await Promise.resolve(); };
  return { window, root, saves, transitions, errors, state, globals, field, change, click };
}
function invalid(app, ids) {
  for (const entry of app.state().fields) {
    assert.equal(entry.invalid, String(ids.includes(entry.id)), entry.id + ': aria-invalid');
    assert.equal(!!entry.error, ids.includes(entry.id), entry.id + ': visible error');
  }
  assert.equal(app.state().snapshot, false);
  assert.ok(app.saves.every(save => save.modelContent.blocks.every(block => !Object.hasOwn(block, 'values'))));
}

test('G10 empty, whitespace and range failures survive the actual bridge host-state echo', async t => {
  const app = await mount(t);
  await app.click('submit');
  t.diagnostic(JSON.stringify(app.transitions));
  invalid(app, ['title', 'method', 'checked']);
  assert.equal(app.window.document.activeElement, app.field('title'));
  for (const samples of ['0', '101', '']) {
    await app.change('title', '   '); await app.change('samples', samples);
    await app.click('submit'); await app.click('submit');
    invalid(app, ['title', 'samples', 'method', 'checked']);
  }
  assert.deepEqual(app.errors, []);
});

test('partial correction, legacy echo, theme and remount preserve validation until explicit reset', async t => {
  const app = await mount(t); await app.click('submit');
  await app.change('title', '合成实验'); invalid(app, ['method', 'checked']);
  const legacy = copy(app.saves.at(-1));
  for (const block of Object.values(legacy.privateContent.chatuiResponse.blocks)) if (block.privateContent.chatui) delete block.privateContent.chatui.value.attempted;
  app.globals({ widgetState: legacy }); invalid(app, ['method', 'checked']);
  const missing = copy(app.saves.at(-1)); missing.privateContent.chatuiResponse.blocks = {};
  app.globals({ widgetState: missing }); invalid(app, ['method', 'checked']);
  assert.equal(app.field('title').value, '合成实验', 'Missing form restoration must not reset the current draft');
  const malformed = copy(app.saves.at(-1));
  for (const block of Object.values(malformed.privateContent.chatuiResponse.blocks)) if (block.privateContent.chatui) block.privateContent.chatui.value.values.title = null;
  app.globals({ widgetState: malformed }); invalid(app, ['method', 'checked']);
  assert.equal(app.field('title').value, '合成实验', 'Malformed field restoration must not reset that field');
  app.globals({ theme: 'dark', widgetState: copy(app.saves.at(-1)) }); invalid(app, ['method', 'checked']);
  const restored = await mount(t, { saved: app.saves.at(-1) }); invalid(restored, ['method', 'checked']);
  assert.equal(restored.field('title').value, '合成实验'); assert.equal(restored.saves.length, 0);
  await app.click('reset'); invalid(app, []); assert.equal(app.field('title').value, ''); assert.equal(app.field('samples').value, '4');
  const reset = await mount(t, { saved: app.saves.at(-1) }); invalid(reset, []);
});

test('valid typed snapshots, edits, resubmission and new-content lifecycle retain their contracts', async t => {
  const app = await mount(t); await app.click('submit');
  await app.change('title', '合成实验'); await app.change('method', 'compare'); await app.change('checked', true);
  await app.change('samples', '100'); await app.change('notes', '一行\n二行'); await app.click('submit');
  const values = app.saves.at(-1).modelContent.blocks.find(block => block.component === 'input-form').values;
  assert.equal(values.samples, 100); assert.equal(values.checked, true); assert.equal(values.method, 'compare');
  assert.equal(values.notes, '一行\n二行'); assert.equal(app.state().snapshot, true);
  const restored = await mount(t, { saved: app.saves.at(-1) }); assert.equal(restored.state().snapshot, true); assert.equal(restored.saves.length, 0);
  await app.change('samples', '101'); assert.equal(app.state().snapshot, false); assert.equal(app.field('samples').getAttribute('aria-invalid'), 'true');
  assert.ok(!Object.hasOwn(app.saves.at(-1).modelContent.blocks[0], 'values'));
  await app.change('samples', '1'); await app.click('submit'); assert.equal(app.saves.at(-1).modelContent.blocks[0].values.samples, 1);
  const changed = g10(); changed.contentId += '-new';
  const fresh = await mount(t, { saved: app.saves.at(-1), input: changed }); invalid(fresh, []); assert.equal(fresh.field('title').value, '');
});

test('restored validation is recomputed; untrusted flags cannot manufacture an invalid success snapshot', async t => {
  const app = await mount(t); await app.click('submit'); const saved = copy(app.saves.at(-1));
  for (const block of Object.values(saved.privateContent.chatuiResponse.blocks)) if (block.privateContent.chatui) { block.privateContent.chatui.value.submitted = true; block.privateContent.chatui.value.attempted = true; }
  const restored = await mount(t, { saved }); invalid(restored, ['title', 'method', 'checked']);
  for (const node of restored.root.querySelectorAll('[aria-invalid="true"]')) {
    const error = restored.window.document.getElementById(node.getAttribute('aria-errormessage'));
    assert.ok(error?.textContent); assert.equal(error.getAttribute('aria-live'), 'polite');
  }
  assert.match(restored.state().status, /尚未提交/); assert.equal(restored.saves.length, 0);
});

// Controlled public bridge lifecycle: no network, host internals or real clocks.
async function lifecycle(t, initialOutput, { diagnostics = false, consoleFailure = false } = {}) {
  const startupLog = [], vc = new VirtualConsole(); vc.on('info', (...args) => startupLog.push(args));
  const dom = new JSDOM(documentHtml, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  // Keep legacy bridge trace controls independent of the optional entry probe.
  delete window.document.documentElement.dataset.chatuiEntryProbe;
  if (diagnostics) window.document.documentElement.dataset.chatuiStartup = 'v1'; else delete window.document.documentElement.dataset.chatuiStartup;
  if (consoleFailure) window.console.info = () => { throw new Error('synthetic console failure'); };
  const outbound = [], deadlines = new Map(); let timerId = 1000000;
  const realSet = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => { if (delay !== 15000) return realSet(fn, delay, ...args); const id = timerId++; deadlines.set(id, fn); return id; };
  window.clearTimeout = id => { deadlines.delete(id); realClear(id); };
  const parent = { postMessage: message => outbound.push(copy(message)) };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { toolOutput: initialOutput, setWidgetState() {} };
  const send = (data, source = parent) => window.dispatchEvent(new window.MessageEvent('message', { source, data: { jsonrpc: '2.0', ...data } }));
  const settle = async () => { for (let i = 0; i < 20; i++) { await new Promise(resolve => setTimeout(resolve, 5)); if (window.document.querySelector('[data-form-field="title"]')) break; } };
  const globals = async output => { window.openai.toolOutput = output; window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { toolOutput: output } } })); await settle(); };
  for (const script of window.document.scripts) window.eval(script.textContent);
  const initialize = () => outbound.find(message => message.method === 'ui/initialize');
  const ack = async (source = parent) => { send({ id: initialize()?.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'synthetic-host', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'dark' } } }, source); await Promise.resolve(); };
  const expire = async () => { for (const [id, fn] of [...deadlines]) { deadlines.delete(id); fn(); } await Promise.resolve(); await Promise.resolve(); };
  const hide = persisted => window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted }));
  t.after(() => { hide(false); window.close(); });
  return { window, outbound, startupLog, send, globals, initialize, ack, expire, hide, settle, trace: () => JSON.parse(window.document.getElementById('chatui-component').getAttribute('data-chatui-startup') || '[]'), field: () => window.document.querySelector('[data-form-field="title"]'), status: () => window.document.getElementById('chatui-status').textContent };
}

test('lifecycle: null preloaded output still starts the public initialize handshake', async t => {
  const app = await lifecycle(t, null);
  assert.ok(app.initialize(), 'null is not a usable native result');
  await app.ack(); app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } }); await app.settle();
  assert.ok(app.field()); assert.equal(app.status(), '');
});

test('lifecycle: delayed initialize acknowledgement recovers after the soft deadline', async t => {
  const app = await lifecycle(t);
  await app.expire(); assert.match(app.status(), /尚未连接/);
  await app.ack({}); assert.equal(app.outbound.filter(m => m.method === 'ui/notifications/initialized').length, 0, 'foreign source cannot acknowledge');
  await app.ack();
  assert.equal(app.outbound.filter(m => m.method === 'ui/notifications/initialized').length, 1);
  assert.equal(app.status(), '', 'successful initialization clears its own timeout status');
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } }); await app.settle(); assert.ok(app.field());
});

test('lifecycle: native output and later standard acknowledgement do not remount a draft', async t => {
  const app = await lifecycle(t); await app.globals(normalizeDocument(g10()).view);
  const field = app.field(); field.value = 'kept draft'; field.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  await app.expire(); assert.equal(app.status(), ''); await app.ack(); await app.globals(normalizeDocument(g10()).view);
  assert.equal(app.field(), field); assert.equal(app.field().value, 'kept draft');
  assert.equal(app.window.document.documentElement.style.colorScheme, 'dark');
  assert.equal(app.outbound.filter(m => m.method === 'ui/initialize').length, 1);
});

test('lifecycle: persisted pagehide preserves the bridge; actual teardown stops it', async t => {
  const app = await lifecycle(t, normalizeDocument(g10()).view); await app.settle();
  const field = app.field(); field.value = 'history draft'; field.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  app.hide(true); app.window.dispatchEvent(new app.window.PageTransitionEvent('pageshow', { persisted: true }));
  await app.globals(normalizeDocument(g10()).view); assert.equal(app.field(), field); assert.equal(app.field().value, 'history draft');
  app.send({ id: 'alive', method: 'ping' }); assert.ok(app.outbound.some(m => m.id === 'alive'));
  app.hide(false); app.send({ id: 'closed', method: 'ping' }); assert.ok(!app.outbound.some(m => m.id === 'closed'));
});

test('lifecycle: early tool result is not replaced by a connection timeout banner', async t => {
  const app = await lifecycle(t);
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } }); await app.settle();
  const field = app.field(); await app.expire(); assert.equal(app.status(), '');
  await app.ack(); await app.ack(); assert.equal(app.field(), field);
  assert.equal(app.outbound.filter(m => m.method === 'ui/notifications/initialized').length, 1);
});

test('lifecycle: teardown wins over a queued initialize continuation', async t => {
  const app = await lifecycle(t);
  app.ack(); app.hide(false); await Promise.resolve();
  assert.equal(app.window.__chatuiMetrics.initializedAt, null);
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } });
  assert.equal(app.field(), null);
  assert.equal(app.outbound.filter(m => m.method === 'ui/notifications/initialized').length, 0);
});


test('reload timing: synchronous host snapshot survives immediate pagehide and new mount', async t => {
  let committed;
  const app = await mount(t, { echo: false, saveSink: payload => { committed = payload; } });
  await app.click('submit');
  // Deliberately no await or timer between input, native save and unload.
  const field = app.field('title'); field.value = 'synchronous reload draft';
  field.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  const savedAtUnload = copy(committed);
  app.window.dispatchEvent(new app.window.Event('pagehide'));
  const restored = await mount(t, { saved: savedAtUnload });
  assert.equal(restored.field('title').value, 'synchronous reload draft'); invalid(restored, ['method', 'checked']);
  assert.equal(restored.saves.length, 0);
});

test('reload timing: omitted host snapshot produces defaults; a late matching snapshot restores errors', async t => {
  const app = await mount(t, { echo: false }); await app.click('submit'); await app.change('title', 'late restore draft');
  const saved = copy(app.saves.at(-1)), fresh = await mount(t);
  assert.equal(fresh.field('title').value, ''); invalid(fresh, []);
  fresh.globals({ widgetState: saved });
  assert.equal(fresh.field('title').value, 'late restore draft'); invalid(fresh, ['method', 'checked']);
  assert.equal(fresh.saves.length, 0, 'Restoration is not a user edit');
});

test('reload timing: rejected optional native persistence preserves current draft but cannot create a saved history', async t => {
  const app = await mount(t, { echo: false, saveSink() { throw new Error('synthetic host save rejection'); } });
  await app.click('submit'); await app.change('title', 'ephemeral draft');
  assert.equal(app.field('title').value, 'ephemeral draft'); invalid(app, ['method', 'checked']);
  const fresh = await mount(t); assert.equal(fresh.field('title').value, ''); invalid(fresh, []);
  assert.deepEqual(app.errors, []);
});

// Falsifiable cold/warm ordering controls; not a trace of ChatGPT internals.
test('startup recovery: cold invalid result followed by valid native output must recover before handshake reply', async t => {
  const app = await lifecycle(t);
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: { invalid: true } } });
  assert.ok(app.status()); assert.equal(app.field(), null);
  await app.globals(normalizeDocument(g10()).view);
  assert.ok(app.field(), 'A failed early result must not suppress the next valid native output');
  assert.equal(app.status(), ''); assert.equal(app.outbound.filter(m => m.method === 'ui/initialize').length, 1);
});

test('startup recovery: warm initialized path recovers from the same invalid result', async t => {
  const app = await lifecycle(t, normalizeDocument(g10()).view); await app.settle();
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: { invalid: true } } });
  assert.ok(app.status()); assert.equal(app.field(), null);
  await app.globals(normalizeDocument(g10()).view);
  assert.ok(app.field()); assert.equal(app.status(), '');
});

test('startup recovery: cold mount exception stays visible, then valid native output recovers', async t => {
  const app = await lifecycle(t), mountOriginal = app.window.mountExplanation;
  assert.equal(typeof mountOriginal, 'function');
  app.window.mountExplanation = () => { throw new Error('synthetic trusted mount failure'); };
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } });
  assert.ok(app.status(), 'A render exception must leave readable error feedback'); assert.equal(app.field(), null);
  app.window.mountExplanation = mountOriginal;
  await app.globals(normalizeDocument(g10()).view);
  assert.ok(app.field(), 'A failed first mount must not block a later valid output'); assert.equal(app.status(), '');
});

test('startup recovery: waiting view exists before script, before data and after initialization', async t => {
  const raw = new JSDOM(documentHtml); t.after(() => raw.window.close());
  const status = raw.window.document.getElementById('chatui-status');
  assert.equal(status.getAttribute('role'), 'status'); assert.ok(status.textContent.trim()); assert.equal(status.hidden, false);
  const app = await lifecycle(t); assert.ok(app.status()); assert.equal(app.field(), null);
  await app.ack(); assert.ok(app.status()); assert.equal(app.field(), null);
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: normalizeDocument(g10()).view } }); await app.settle();
  assert.ok(app.field()); assert.equal(app.status(), '');
});


test('startup recovery: explicit initialize rejection remains bounded and native recovery stays available', async t => {
  const app = await lifecycle(t);
  app.send({ id: app.initialize().id, error: { code: -1, message: 'synthetic initialization rejection' } });
  await Promise.resolve(); await Promise.resolve(); assert.match(app.status(), /尚未连接/);
  await app.globals(normalizeDocument(g10()).view); assert.ok(app.field()); assert.equal(app.status(), '');
  assert.equal(app.outbound.filter(m => m.method === 'ui/initialize').length, 1, 'No automatic retry loop');
});


test('startup trace: opt-in stages reveal only enum, times and booleans; cold recovery remains functional', async t => {
  const input = g10(); input.title = 'BODY_PRIVATE_SENTINEL';
  const app = await lifecycle(t, undefined, { diagnostics: true });
  assert.deepEqual(app.trace().map(e => e.stage), ['boot', 'initialize_request']);
  app.send({ method: 'ui/notifications/tool-result', params: { structuredContent: { bad: 'PAYLOAD_PRIVATE_SENTINEL' } } });
  const original = app.window.mountExplanation;
  app.window.mountExplanation = () => { throw new app.window.Error('ERROR_PRIVATE_SENTINEL'); };
  await app.globals(normalizeDocument(input).view);
  app.window.mountExplanation = original;
  await app.globals(normalizeDocument(input).view); await app.ack();
  assert.match(app.window.document.getElementById('chatui-component').textContent, /BODY_PRIVATE_SENTINEL/);
  assert.ok(app.field()); app.field().value = 'INPUT_PRIVATE_SENTINEL'; app.field().dispatchEvent(new app.window.Event('input', { bubbles: true }));
  const trace = app.trace();
  for (const stage of ['mcp_result', 'validation_error', 'fallback', 'native_result', 'native_ready', 'validation_ok', 'mount_start', 'mount_error', 'mount_returned', 'mount_complete', 'initialize_success']) assert.ok(trace.some(e => e.stage === stage), stage);
  for (const entry of trace) {
    assert.deepEqual(Object.keys(entry).sort(), ['seq', 'stage', 'ms', 'ready', 'hasResult', 'hasContent'].sort());
    assert.equal(typeof entry.stage, 'string'); assert.equal(typeof entry.ready, 'boolean'); assert.equal(typeof entry.hasResult, 'boolean'); assert.equal(typeof entry.hasContent, 'boolean');
    assert.ok(Number.isInteger(entry.seq) && entry.seq >= 0); assert.ok(Number.isFinite(entry.ms) && entry.ms >= 0);
  }
  assert.doesNotMatch(JSON.stringify([trace, app.startupLog]), /PRIVATE_SENTINEL/);
  assert.equal(app.startupLog.length, trace.length);
});

test('startup trace: disabled logging is silent and enabled logging is capped at32', async t => {
  const view = normalizeDocument(g10()).view, off = await lifecycle(t, view); await off.settle();
  assert.deepEqual(off.trace(), []); assert.equal(off.startupLog.length, 0);
  const on = await lifecycle(t, view, { diagnostics: true }); await on.settle();
  for (let i = 0; i < 100; i++) on.send({ method: 'ui/notifications/tool-result', params: { structuredContent: view } });
  assert.equal(on.trace().length, 32); assert.equal(on.startupLog.length, 32); assert.ok(on.field());
});

test('startup trace: console failure cannot break rendering or late initialization recovery', async t => {
  const app = await lifecycle(t, undefined, { diagnostics: true, consoleFailure: true });
  await app.expire(); await app.ack(); await app.globals(normalizeDocument(g10()).view);
  assert.ok(app.field()); assert.equal(app.status(), ''); assert.ok(app.trace().some(e => e.stage === 'initialize_soft_deadline'));
});
