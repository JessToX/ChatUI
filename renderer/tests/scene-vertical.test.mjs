import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import Ajv from 'ajv';
import { createModelContextRelay } from '../lib/model-context-relay.mjs';
import { sceneExploration, validateScene } from '../lib/scene-runtime.mjs';
import { RESPONSE_SCHEMA } from '../lib/response-validation.mjs';
import { RESPONSE_OUTPUT_SCHEMA } from '../lib/response-output-schema.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { verticalExperience } from '../examples/vertical-experience.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));
async function host(t, { capability = { structuredContent: {}, text: {} }, replyContext = true, timeout = false, native = false } = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(responseHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://synthetic.invalid', virtualConsole });
  const w = dom.window; w.TextEncoder = TextEncoder; const outbound = [], saved = [];
  const actualTimer = w.setTimeout.bind(w); if (timeout) w.setTimeout = (callback, ms) => actualTimer(callback, ms === 15000 ? 15 : ms);
  const normalized = normalizeResponse(verticalExperience()), original = clone(normalized.view);
  const deliver = result => w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result } }));
  const respond = (message, result = {}, error) => w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { jsonrpc: '2.0', id: message.id, ...(error ? { error } : { result }) } }));
  const respondRaw = (message, payload) => w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { jsonrpc: '2.0', id: message.id, ...payload } }));
  const parent = { postMessage(message) {
    outbound.push(clone(message)); if (!message.id) return;
    if (message.method === 'ui/initialize') queueMicrotask(() => respond(message, { protocolVersion: '2026-01-26', hostCapabilities: capability === null ? {} : { updateModelContext: capability }, hostContext: { theme: 'light' } }));
    else if (message.method === 'ui/update-model-context' && replyContext) queueMicrotask(() => respond(message));
  } };
  Object.defineProperty(w, 'parent', { value: parent });
  w.openai = { ...(native ? { toolOutput: normalized.view } : {}), setWidgetState: value => saved.push(clone(value)) };
  for (const script of w.document.scripts) w.eval(script.textContent);
  await pause(20); if (!native) deliver({ structuredContent: normalized.view, content: [{ type: 'text', text: normalized.text }] });
  await pause(30);
  const root = w.document.getElementById('chatui-component');
  const block = id => root.querySelector(`[data-block-id="${id}"]`);
  for (const svg of root.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 300 });
  const change = (id, value) => { const input = block(id).querySelector('[data-scene-node="height-number"] input'); input.value = String(value); input.dispatchEvent(new w.Event('input', { bubbles: true })); return input; };
  const pointer = (target, type, x, y, id = 7) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
  };
  const updates = () => outbound.filter(message => message.method === 'ui/update-model-context');
  const teardown = () => w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { jsonrpc: '2.0', id: 'close', method: 'ui/resource-teardown', params: {} } }));
  t.after(() => { teardown(); w.close(); });
  return { w, root, block, change, pointer, outbound, saved, original, normalized, deliver, respond, respondRaw, updates, teardown, errors };
}

test('generic drag contract accepts real bindings and rejects invalid inverse mappings, hidden code and non-state targets', () => {
  const input = verticalExperience(), normalized = normalizeResponse(input), ajv = new Ajv({ strict: false });
  for (const [schema, data] of [[RESPONSE_SCHEMA, input], [RESPONSE_OUTPUT_SCHEMA, normalized.view]]) { const check = ajv.compile(schema); assert.equal(check(data), true, JSON.stringify(check.errors)); }
  const scene = input.blocks[0], mark = s => s.root.children[0].marks[2];
  for (const mutate of [s => { mark(s).drag.scale = 0; }, s => { mark(s).drag.state = 'base'; }, s => { mark(s).drag.axis = 'both'; },
    s => { mark(s).drag.script = 'alert(1)'; }, s => { mark(s).drag.origin = 500; }, s => { mark(s).cy = 100; }]) {
    const bad = clone(scene); mutate(bad); assert.throws(() => validateScene(bad));
  }
  const publicState = sceneExploration(scene, { height: 4, showGuide: false }, 1);
  assert.deepEqual(Object.keys(publicState.parameters), ['height']); assert.equal(publicState.parameters.height.unit, 'cm');
  assert.throws(() => sceneExploration(scene, { height: 0, showGuide: false }, 2));
});

test('drag previews locally, commits once on release, shares exact numeric/geometry values and keeps the other graph unchanged', async t => {
  const app = await host(t), handle = app.block('first').querySelector('[role=slider]'), first = app.block('first');
  const untouched = app.block('second').textContent;
  app.pointer(handle, 'pointerdown', 160, 170); app.pointer(app.w, 'pointermove', 160, 125);
  assert.equal(handle.getAttribute('aria-valuenow'), '4.5'); assert.match(first.textContent, /18 cm²/); assert.equal(app.updates().length, 0);
  app.pointer(app.w, 'pointerup', 160, 125); await pause(240);
  assert.equal(app.updates().length, 1);
  const context = app.updates()[0].params.structuredContent;
  assert.equal(context.contentId, 'vertical-original'); assert.ok(context.snapshotId.startsWith('vertical-original:'));
  assert.equal(context.blocks[0].blockId, 'first'); assert.equal(context.blocks[0].interactionRevision, 1);
  assert.equal(context.blocks[0].parameters.height.value, 4.5); assert.ok(context.blocks[0].sceneIdentity);
  assert.equal(Object.hasOwn(context.blocks[0].parameters, 'showGuide'), false);
  assert.equal(app.block('second').textContent, untouched); assert.deepEqual(app.normalized.view, app.original);
  assert.match(first.querySelector('.cui-scene-sync-status').textContent, /宿主已接收/);
  assert.equal(app.outbound.some(message => ['ui/message', 'tools/call', 'sampling/createMessage'].includes(message.method)), false);
  assert.equal(app.saved.length, 0, 'Scene must not silently publish through widgetState');
  assert.deepEqual(app.errors, []);
});

test('pointer cancellation, Escape and destruction do not publish preview state; keyboard, tap buttons and number remain alternatives', async t => {
  const app = await host(t), handle = app.block('first').querySelector('[role=slider]');
  for (const cancel of ['pointercancel', 'Escape']) {
    app.pointer(handle, 'pointerdown', 160, 170); app.pointer(app.w, 'pointermove', 160, 110);
    if (cancel === 'Escape') app.w.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else app.pointer(app.w, 'pointercancel', 160, 110);
    assert.equal(handle.getAttribute('aria-valuenow'), '3');
  }
  await pause(220); assert.equal(app.updates().length, 0);
  handle.focus(); handle.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(handle.getAttribute('aria-valuenow'), '3.1'); assert.equal(app.w.document.activeElement, handle);
  const plus = app.block('first').querySelector('[aria-label="调整顶点高度：增大"]'); plus.click();
  assert.equal(handle.getAttribute('aria-valuenow'), '3.2');
  app.change('first', 3.75); assert.equal(handle.getAttribute('aria-valuenow'), '3.75');
  await pause(240); assert.equal(app.updates().length, 1);
  app.pointer(handle, 'pointerdown', 160, 147.5); app.pointer(app.w, 'pointermove', 160, 80); app.teardown();
  app.pointer(app.w, 'pointerup', 160, 80); await pause(220); assert.equal(app.updates().length, 1);
});

test('invalid input does not commit; presentation toggles do not publish; original and replacement snapshots stay isolated', async t => {
  const app = await host(t);
  app.block('first').querySelector('input[type=checkbox]').click(); await pause(220); assert.equal(app.updates().length, 0);
  const invalid = app.change('first', 0); await pause(220);
  assert.equal(invalid.getAttribute('aria-invalid'), 'true'); assert.equal(app.updates().length, 0);
  assert.equal(app.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '3');
  app.change('first', 4); await pause(240);
  const firstContext = clone(app.updates()[0].params.structuredContent);
  const replacement = normalizeResponse(verticalExperience(4, 'vertical-followup'));
  app.deliver({ structuredContent: replacement.view, content: [{ type: 'text', text: replacement.text }] }); await pause(40);
  assert.equal(app.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '4');
  assert.deepEqual(app.normalized.view, app.original); assert.equal(firstContext.blocks[0].parameters.height.value, 4);
  await pause(220); assert.equal(app.updates().length, 1, 'New tool data is not a user exploration');
});

test('multiple edited graphs survive full replacement context and an old ACK cannot confirm a newer scene revision', async t => {
  const app = await host(t, { replyContext: false });
  app.change('first', 4); await pause(220); app.change('first', 4.5); app.change('second', 6); await pause(220);
  assert.equal(app.updates().length, 1); app.respond(app.updates()[0]); await pause(10);
  assert.equal(app.updates().length, 2); const blocks = app.updates()[1].params.structuredContent.blocks;
  assert.deepEqual(blocks.map(block => [block.blockId, block.parameters.height.value]), [['first', 4.5], ['second', 6]]);
  assert.doesNotMatch(app.block('first').querySelector('.cui-scene-sync-status').textContent, /宿主已接收/);
  app.respond(app.updates()[1]); await pause(10); assert.match(app.block('first').querySelector('.cui-scene-sync-status').textContent, /宿主已接收/);
});

for (const mode of ['missing', 'denied', 'timeout', 'text']) test(`context ${mode} preserves local state and offers a truthful boundary`, async t => {
  const app = await host(t, { capability: mode === 'missing' ? null : mode === 'text' ? { text: {} } : { structuredContent: {} }, replyContext: mode === 'text', timeout: mode === 'timeout' });
  app.change('first', 4); await pause(240);
  if (mode === 'denied') { app.respond(app.updates()[0], null, { code: -32000, message: 'Synthetic denial' }); await pause(10); }
  if (mode === 'missing') assert.equal(app.updates().length, 0);
  else assert.equal(app.updates().length, 1);
  if (mode === 'text') assert.equal(JSON.parse(app.updates()[0].params.content[0].text).blocks[0].parameters.height.value, 4);
  else {
    assert.match(app.block('first').querySelector('.cui-scene-sync-status').textContent, /未同步/);
    [...app.block('first').querySelectorAll('button')].find(button => button.textContent === '复制当前条件').click(); await pause(5);
    assert.match(app.block('first').querySelector('textarea').value, /"value": 4|"height": 4/);
  }
  assert.equal(app.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '4');
});

test('native compatibility delivery still negotiates public capabilities and never routes Scene through legacy persistence', async t => {
  const app = await host(t, { native: true }); app.change('first', 4); await pause(240);
  assert.equal(app.outbound.filter(message => message.method === 'ui/initialize').length, 1);
  assert.equal(app.updates().length, 1); assert.equal(app.saved.length, 0);
});

test('relay coalesces, serializes, freezes payload bytes and rejects missing modalities, over-budget and stale acknowledgements', async () => {
  let fire, active, resolve, calls = [], events = [];
  const relay = createModelContextRelay({ request: (method, params) => { calls.push({ method, params }); return new Promise(r => { resolve = r; }); },
    isReady: () => true, capabilities: () => ({ updateModelContext: { structuredContent: {} } }),
    schedule: callback => { fire = callback; return 1; }, cancel() {} });
  const payload = { value: 1 }; relay.enqueue(payload, state => events.push(state.status)); payload.value = 99;
  relay.enqueue({ value: 2 }, state => events.push(state.status)); fire(); await pause(0);
  assert.equal(calls.length, 1); assert.equal(calls[0].params.structuredContent.value, 2);
  relay.enqueue({ value: 3 }, state => events.push(state.status)); fire(); assert.equal(calls.length, 1);
  resolve(); await pause(0); assert.equal(calls.length, 2); assert.equal(calls[1].params.structuredContent.value, 3);
  const previous = events.length; relay.reset(); active = events.length; resolve(); await pause(0); assert.equal(events.length, active);
  assert.ok(active >= previous); relay.enqueue({ text: 'x'.repeat(17000) }, state => events.push(state.status)); assert.equal(events.at(-1), 'invalid');
  relay.destroy();
  let unsupported;
  const missing = createModelContextRelay({ request() { throw new Error('Must not call'); }, isReady: () => true,
    capabilities: () => ({ updateModelContext: {} }), schedule: callback => { fire = callback; }, cancel() {} });
  missing.enqueue({ value: 1 }, state => { unsupported = state.status; }); fire(); assert.equal(unsupported, 'unsupported'); missing.destroy();
});

for (const [name, payload] of [
  ['null', { result: null }], ['missing result', {}], ['array', { result: [] }],
  ['string', { result: 'accepted' }], ['number', { result: 0 }], ['boolean', { result: false }],
  ['tool error', { result: { isError: true } }], ['RPC error', { error: { code: -32000, message: 'Synthetic denial' } }]
]) test(`context ACK ${name} cannot report receipt or lose the local value`, async t => {
  const app = await host(t, { replyContext: false });
  app.change('first', 4); await pause(240); assert.equal(app.updates().length, 1);
  const request = app.updates()[0]; app.respondRaw(request, payload); await pause(10);
  const status = () => app.block('first').querySelector('.cui-scene-sync-status').textContent;
  assert.match(status(), /未同步/); assert.doesNotMatch(status(), /宿主已接收/);
  assert.equal(app.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '4');
  app.respond(request); await pause(10); assert.doesNotMatch(status(), /宿主已接收/, 'A late duplicate cannot promote the rejected ACK');
  assert.deepEqual(app.errors, []);
});

for (const [name, result] of [['empty object', {}], ['metadata object', { _meta: { receipt: 'synthetic' } }]])
test(`context ACK ${name} keeps the valid receipt behavior`, async t => {
  const app = await host(t, { replyContext: false }); app.change('first', 4); await pause(240);
  app.respondRaw(app.updates()[0], { result }); await pause(10);
  assert.match(app.block('first').querySelector('.cui-scene-sync-status').textContent, /宿主已接收/);
  assert.deepEqual(app.errors, []);
});

test('context ACK invalid reply blocks the queued replacement without publishing or confirming a newer revision', async t => {
  const app = await host(t, { replyContext: false });
  app.change('first', 4); await pause(240);
  app.change('first', 4.5); app.change('second', 6); await pause(220);
  assert.equal(app.updates().length, 1, 'Only one wire request may be in flight');
  app.respondRaw(app.updates()[0], { result: null }); await pause(10);
  for (const id of ['first', 'second']) assert.match(app.block(id).querySelector('.cui-scene-sync-status').textContent, /未同步/);
  app.respond(app.updates()[0]); app.change('first', 5); await pause(240);
  assert.equal(app.updates().length, 1, 'Rejected ACK retains the existing blocked-generation policy');
  for (const id of ['first', 'second']) assert.doesNotMatch(app.block(id).querySelector('.cui-scene-sync-status').textContent, /宿主已接收/);
  assert.equal(app.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '5');
  assert.equal(app.outbound.some(message => ['ui/message', 'tools/call', 'sampling/createMessage'].includes(message.method)), false);
  assert.equal(app.saved.length, 0); assert.deepEqual(app.errors, []);
});

test('context ACK invalid old-snapshot reply cannot block or confirm a replacement snapshot', async t => {
  const app = await host(t, { replyContext: false }); app.change('first', 4); await pause(240);
  const old = app.updates()[0], replacement = normalizeResponse(verticalExperience(4, 'ack-replacement'));
  app.deliver({ structuredContent: replacement.view, content: [{ type: 'text', text: replacement.text }] }); await pause(40);
  app.change('first', 5); await pause(220); assert.equal(app.updates().length, 1);
  app.respondRaw(old, { result: null }); await pause(10);
  assert.equal(app.updates().length, 2);
  const current = app.updates()[1]; assert.equal(current.params.structuredContent.contentId, 'ack-replacement');
  assert.equal(current.params.structuredContent.blocks[0].parameters.height.value, 5);
  const status = () => app.block('first').querySelector('.cui-scene-sync-status').textContent;
  assert.doesNotMatch(status(), /宿主已接收/);
  app.respond(old); await pause(10); assert.doesNotMatch(status(), /宿主已接收/);
  app.respond(current); await pause(10); assert.match(status(), /宿主已接收/);
  assert.deepEqual(app.errors, []);
});

test('late copy failure after conditions change does not expose stale text or steal focus', async t => {
  const app = await host(t), first = app.block('first');
  let rejectCopy;
  Object.defineProperty(app.w.navigator, 'clipboard', { value: { writeText: () => new Promise((_, reject) => { rejectCopy = reject; }) } });
  [...first.querySelectorAll('button')].find(b => b.textContent === '复制当前条件').click();
  const input = app.change('first', 6); input.focus();
  rejectCopy(new Error('fixture denied')); await pause(0);
  assert.equal(first.querySelector('.cui-scene-copy').hidden, true);
  assert.equal(app.w.document.activeElement, input);
});


test('copy success followed by pending/rejected retry cannot retain stale success', async t => {
  const app = await host(t);
  let rejectRetry;
  let calls = 0;
  Object.defineProperty(app.w.navigator, 'clipboard', { configurable: true, value: { writeText: () => ++calls === 1 ? Promise.resolve() : new Promise((_, reject) => { rejectRetry = reject; }) } });
  const section = app.w.document.querySelector('.cui-scene');
  const button = [...section.querySelectorAll('button')].find(e => e.textContent === '复制当前条件');
  const status = section.querySelector('.cui-scene-sync-status');
  button.click(); await pause(0);
  assert.equal(status.textContent, '已复制当前探索条件。');
  button.click(); await pause(0);
  assert.notEqual(status.textContent, '已复制当前探索条件。');
  rejectRetry(new Error('synthetic clipboard rejection')); await pause(0);
  assert.notEqual(status.textContent, '已复制当前探索条件。');
  const fallback = section.querySelector('textarea');
  assert.equal(fallback.hidden, false); assert.equal(fallback.readOnly, true);
  assert.equal(app.w.document.activeElement, fallback);
  assert.ok(JSON.parse(fallback.value).parameters);
  assert.equal(calls, 2);
  Object.defineProperty(app.w.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
  button.click();
  assert.equal(status.textContent, '正在复制当前探索条件…');
  await pause(0);
  assert.equal(status.textContent, '已复制当前探索条件。');
  assert.equal(fallback.hidden, true);
});

for (const oldOutcome of ['resolve', 'reject']) for (const latestOutcome of ['resolve', 'reject']) {
  test(`copy reentry: stale ${oldOutcome} cannot override latest ${latestOutcome}`, async t => {
    const app = await host(t), pending = [];
    Object.defineProperty(app.w.navigator, 'clipboard', { value: { writeText: text => new Promise((resolve, reject) => pending.push({ text, resolve, reject })) } });
    const section = app.block('first');
    const button = [...section.querySelectorAll('button')].find(e => e.textContent === '复制当前条件');
    const status = section.querySelector('.cui-scene-sync-status'), fallback = section.querySelector('textarea');
    button.click(); button.click();
    assert.equal(pending.length, 2);
    pending[1][latestOutcome](latestOutcome === 'reject' ? new Error('synthetic denial') : undefined);
    await pause(0);
    const latestStatus = status.textContent, focused = app.w.document.activeElement;
    assert.equal(fallback.hidden, latestOutcome === 'resolve');
    if (latestOutcome === 'reject') {
      assert.equal(fallback.value, pending[1].text);
      assert.equal(fallback.readOnly, true);
      assert.equal(focused, fallback);
    }
    pending[0][oldOutcome](oldOutcome === 'reject' ? new Error('synthetic stale denial') : undefined);
    await pause(0);
    assert.equal(status.textContent, latestStatus);
    assert.equal(fallback.hidden, latestOutcome === 'resolve');
    assert.equal(app.w.document.activeElement, focused);
    if (latestOutcome === 'reject') {
      fallback.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(fallback.hidden, true);
      assert.equal(app.w.document.activeElement, button);
    }
  });
}

test('Scene exploration remains ephemeral across a fresh mount without a host snapshot', async t => {
  const first = await host(t, { capability: null });
  first.change('first', 4); await pause(220);
  assert.equal(first.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '4');
  assert.equal(first.saved.length, 0, 'Scene exploration must not masquerade as persisted widgetState');
  first.teardown();
  const fresh = await host(t, { capability: null });
  assert.equal(fresh.block('first').querySelector('[role=slider]').getAttribute('aria-valuenow'), '3');
  assert.equal(fresh.block('second').querySelector('[role=slider]').getAttribute('aria-valuenow'), '5');
  assert.equal(fresh.saved.length, 0);
});
