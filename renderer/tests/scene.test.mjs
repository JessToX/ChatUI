import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import Ajv from 'ajv';
import { projectScene, sceneText, validateScene } from '../lib/scene-runtime.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { RESPONSE_SCHEMA } from '../lib/response-validation.mjs';
import { RESPONSE_OUTPUT_SCHEMA } from '../lib/response-output-schema.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { handleMcp } from '../lib/mcp.mjs';

// Synthetic kernel fixture, not natural-language generation acceptance.
const ref = id => ({ ref: id });
const op = (op, ...args) => ({ op, args });
const fixture = () => ({ kind: 'scene', id: 'probe', description: '共享数据与控件的内核合成测试。',
  givens: { scale: 12 },
  state: { amount: { type: 'number', value: 2, min: 0, max: 10, step: .1 }, enabled: { type: 'boolean', value: true }, mode: { type: 'string', value: '甲', options: ['甲', '乙'] } },
  derived: { length: { type: 'number', expr: op('mul', ref('amount'), ref('scale')) }, doubled: { type: 'number', expr: op('mul', 2, ref('amount')) }, caption: { type: 'string', expr: op('if', ref('enabled'), '已开启', '已关闭') } },
  root: { kind: 'layout', id: 'layout', direction: 'grid', columns: 2, children: [
    { kind: 'text', id: 'readout', parts: ['结果 ', ref('doubled'), '；', ref('caption'), '；', ref('mode')] },
    { kind: 'formula', id: 'equation', parts: ['2 × ', ref('amount'), ' = ', ref('doubled')] },
    { kind: 'drawing', id: 'picture', description: '长度与同一变量同步。', viewBox: { width: 360, height: 180 }, marks: [
      { kind: 'rect', id: 'bar', x: 20, y: 40, width: ref('length'), height: 40, fill: 'soft', tone: 'blue' },
      { kind: 'text', id: 'label', x: 20, y: 120, parts: ['长度 ', ref('length')] },
      { kind: 'path', id: 'edge', commands: [{ op: 'M', x: 20, y: 160 }, { op: 'L', x: op('add', 20, ref('length')), y: 160 }] }
    ] },
    { kind: 'control', id: 'slider', control: 'range', state: 'amount', label: '调整参数' },
    { kind: 'control', id: 'number', control: 'number', state: 'amount', label: '精确参数' },
    { kind: 'control', id: 'toggle', control: 'toggle', state: 'enabled', label: '显示状态' },
    { kind: 'control', id: 'select', control: 'select', state: 'mode', label: '选择分支' },
    { kind: 'button', id: 'increment', label: '增加一', action: { type: 'set', state: 'amount', value: op('add', ref('amount'), 1) } },
    { kind: 'button', id: 'reset', label: '重置', action: { type: 'reset' } }
  ] }
});
const input = scene => ({ schemaVersion: 1, contentId: 'scene-kernel-fixture', facts: {}, blocks: [scene] });
const clone = v => JSON.parse(JSON.stringify(v));

test('typed DAG, forward references and displayed geometry share independently checked values', () => {
  const s = fixture(); s.derived.before = { type: 'number', expr: op('add', ref('later'), 5) }; s.derived.later = { type: 'number', expr: op('div', 21, 3) };
  const original = clone(s), p = projectScene(s, { amount: 3, enabled: false, mode: '乙' });
  assert.equal(p.values.length, 36); assert.equal(p.values.doubled, 6); assert.equal(p.values.before, 12);
  assert.equal(p.root.children[0].text, '结果 6；已关闭；乙'); assert.equal(p.root.children[1].text, '2 × 3 = 6');
  assert.equal(p.root.children[2].marks[0].width, 36); assert.deepEqual(s, original);
});
test('input/output MCP schemas accept scenes and preserve complete initial fallback', async () => {
  const c = input(fixture()), { view, text } = normalizeResponse(c);
  const ajv = new Ajv({ strict: false });
  for (const [schema, data] of [[RESPONSE_SCHEMA, c], [RESPONSE_OUTPUT_SCHEMA, view]]) { const check = ajv.compile(schema); assert.equal(check(data), true, JSON.stringify(check.errors)); }
  assert.match(text, /2 × 2 = 4/); assert.match(text, /长度 24/); assert.match(text, /重挂载恢复初始值/);
  const response = await handleMcp(new Request('https://test.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'scene-fixture', 'oai-authenticated-user-email': 'scene@example.invalid' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'render_response', arguments: c } }) }));
  const { result } = await response.json(); assert.equal(result.isError, undefined); assert.equal(result.content[0].text, text);
});
test('legacy fact placeholders do not alter scene-owned literal data', () => {
  const s = fixture(); s.root.children[0].parts = ['{{literal}} <script>alert(1)</script>'];
  assert.match(normalizeResponse(input(s)).text, /\{\{literal\}\}/);
});
const rejected = {
  'unknown field / script': s => { s.root.script = 'alert(1)'; },
  'network URL': s => { s.root.children[2].url = 'https://example.invalid'; },
  'unknown reference': s => { s.derived.length.expr = ref('missing'); },
  'property access': s => { s.derived.length.expr = ref('window.location'); },
  'arbitrary code': s => { s.derived.length.expr = { op: 'eval', args: ['1+1'] }; },
  'type mismatch': s => { s.derived.length.expr = op('add', ref('mode'), 1); },
  'boolean coercion': s => { s.root.when = ref('amount'); },
  'cycle': s => { s.derived.length.expr = ref('doubled'); s.derived.doubled.expr = ref('length'); },
  'division by zero': s => { s.derived.length.expr = op('div', 1, 0); },
  'invalid root': s => { s.derived.length.expr = op('sqrt', -1); },
  'excess exponent': s => { s.derived.length.expr = op('pow', 2, 17); },
  'nonfinite': s => { s.givens.scale = Infinity; },
  'state bounds': s => { s.state.amount.value = 12; },
  'duplicate IDs': s => { s.root.children[1].id = 'readout'; },
  'control mutates givens': s => { s.root.children[3].state = 'scale'; },
  'action mutation': s => { s.root.children[7].action.type = 'fetch'; },
  'invalid coordinate': s => { s.root.children[2].marks[0].x = 5000; },
  'negative dimension': s => { s.root.children[2].marks[0].width = -1; },
  'raw SVG': s => { s.root.children[2].marks[0].kind = 'foreignObject'; },
  'path injection': s => { s.root.children[2].marks[2].commands = 'M0 0<script>'; },
  'deep layout': s => { for (let i = 0; i < 10; i++) s.root = { kind: 'layout', id: `deep${i}`, direction: 'column', children: [s.root] }; },
  'deep expression': s => { let e = 1; for (let i = 0; i < 15; i++) e = op('add', e, 1); s.derived.length.expr = e; },
  'prototype field': s => { s.givens = JSON.parse('{"__proto__":2}'); }
};
for (const [name, mutate] of Object.entries(rejected)) test(`reject ${name}`, () => { const s = fixture(); mutate(s); assert.throws(() => validateScene(s)); });
test('conditional branches short circuit, and malformed restored snapshots fail closed', () => {
  const s = fixture(); s.derived.length.expr = op('if', op('eq', ref('amount'), 0), 0, op('div', 12, ref('amount')));
  assert.equal(projectScene(s, { amount: 0, enabled: true, mode: '甲' }).values.length, 0);
  for (const state of [{ amount: '2', enabled: true, mode: '甲' }, { amount: 2, enabled: true, mode: '丙' }, { amount: 2 }, { amount: 2, enabled: true, mode: '甲', extra: 1 }]) assert.throws(() => projectScene(s, state));
});
test('repeated large bindings reject before materializing amplified text', () => {
  const s = fixture(); s.givens.long = 'a'.repeat(4000); s.root.children[0].parts = Array.from({ length: 16 }, () => ref('long'));
  assert.throws(() => projectScene(s), /绑定文字展开超过预算/);
});
test('combined scene fallback has a whole-response budget without restricting old blocks', () => {
  const s = fixture(); s.givens.long = 'a'.repeat(4000); s.root.children[0].parts = Array.from({ length: 14 }, () => ref('long'));
  const other = clone(s); other.id = 'second'; assert.equal(validateScene(s), s);
  assert.throws(() => normalizeResponse({ ...input(s), blocks: [s, other] }), /文字快照超过预算/);
});
async function surface(t, s) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!e.message.includes('Could not parse CSS')) errors.push(e.message); });
  const dom = new JSDOM(responseHtml, { url: 'https://sandbox.invalid/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  t.after(() => dom.window.close()); const w = dom.window;
  w.eval(readFileSync(new URL('../lib/scene-runtime.mjs', import.meta.url), 'utf8').replace(/^export /gm, '') + '\n' + readFileSync(new URL('../lib/scene-surface.js', import.meta.url), 'utf8') + '\nwindow.mountSceneForTest=mountScene;');
  const root = w.document.querySelector('#chatui-component'); const instance = w.mountSceneForTest(s, root);
  const change = (id, v, event = 'input') => { const field = root.querySelector(`[data-scene-node="${id}"] input, [data-scene-node="${id}"] select`); if (typeof v === 'boolean') field.checked = v; else field.value = v; field.dispatchEvent(new w.Event(event, { bubbles: true })); return field; };
  return { w, root, instance, errors, change, text: id => root.querySelector(`[data-scene-node="${id}"]`).textContent };
}
test('real DOM updates all bindings atomically, keeps focus, rejects input, resets and remounts without persistence', async t => {
  const s = fixture(), app = await surface(t, s), { root, w } = app;
  const field = root.querySelector('[data-scene-node="number"] input'); field.focus(); app.change('number', '3');
  assert.equal(w.document.activeElement, field); assert.equal(app.text('readout'), '结果 6；已开启；甲'); assert.equal(app.text('equation'), '2 × 3 = 6');
  assert.equal(root.querySelector('[data-mark-id="bar"]').getAttribute('width'), '36'); assert.equal(root.querySelector('[data-scene-node="slider"] input').value, '3');
  app.change('number', ''); assert.equal(field.getAttribute('aria-invalid'), 'true'); assert.match(root.textContent, /输入未应用/); assert.equal(app.text('readout'), '结果 6；已开启；甲');
  app.change('number', '4'); assert.equal(field.hasAttribute('aria-invalid'), false); app.change('toggle', false, 'change'); app.change('select', '乙', 'change'); assert.equal(app.text('readout'), '结果 8；已关闭；乙');
  root.querySelector('[data-scene-node="increment"]').click(); assert.match(app.text('equation'), /2 × 5 = 10/);
  root.querySelector('[data-scene-node="reset"]').click(); assert.equal(app.text('readout'), '结果 4；已开启；甲');
  app.instance.destroy(); assert.equal(root.children.length, 0); w.mountSceneForTest(s, root); assert.equal(app.text('readout'), '结果 4；已开启；甲'); assert.deepEqual(app.errors, []);
});
test('a valid state causing a later arithmetic/geometry error cannot partially update text or drawing', async t => {
  const s = fixture(); s.derived.length.expr = op('div', 12, ref('amount')); const app = await surface(t, s);
  app.change('number', '0'); assert.match(app.root.textContent, /输入未应用/); assert.equal(app.text('equation'), '2 × 2 = 4'); assert.equal(app.root.querySelector('[data-mark-id="bar"]').getAttribute('width'), '6');
  app.change('number', '4'); assert.equal(app.text('equation'), '2 × 4 = 8'); assert.equal(app.root.querySelector('[data-mark-id="bar"]').getAttribute('width'), '3');
});
test('off-grid actions and precise input keep numeric controls and derived values exact, then restore the authored step', async t => {
  const s = fixture(), exact = Math.SQRT2;
  s.root.children[7].action.value = op('sqrt', 2);
  const app = await surface(t, s), { root, w } = app;
  const number = root.querySelector('[data-scene-node="number"] input');
  const range = root.querySelector('[data-scene-node="slider"] input');
  root.querySelector('[data-scene-node="increment"]').click();
  for (const field of [number, range]) {
    assert.equal(field.valueAsNumber, exact);
    assert.equal(field.validity.stepMismatch, false);
    assert.equal(field.step, 'any');
    assert.equal(field.min, '0'); assert.equal(field.max, '10');
  }
  assert.equal(Number(root.querySelector('[data-mark-id="bar"]').getAttribute('width')), exact * 12);
  number.focus(); app.change('number', '3.141592653589793');
  assert.equal(w.document.activeElement, number);
  assert.equal(range.valueAsNumber, Math.PI); assert.equal(number.valueAsNumber, Math.PI);
  assert.equal(Number(root.querySelector('[data-mark-id="bar"]').getAttribute('width')), Math.PI * 12);
  app.change('number', '11');
  assert.match(root.textContent, /输入未应用/); assert.equal(number.getAttribute('aria-invalid'), 'true');
  assert.equal(range.valueAsNumber, Math.PI);
  assert.equal(Number(root.querySelector('[data-mark-id="bar"]').getAttribute('width')), Math.PI * 12);
  app.change('number', '3.2');
  for (const field of [number, range]) { assert.equal(field.valueAsNumber, 3.2); assert.equal(field.step, '0.1'); assert.equal(field.validity.stepMismatch, false); }
  root.querySelector('[data-scene-node="reset"]').click();
  assert.equal(range.valueAsNumber, 2); assert.equal(number.valueAsNumber, 2); assert.equal(range.step, '0.1');
});
test('off-grid initial state and max bound preserve precise values without changing the grid base', async t => {
  const s = fixture(); s.state.amount = { type: 'number', value: Math.SQRT2, min: .2, max: 9.9, step: .3 };
  const app = await surface(t, s), range = app.root.querySelector('[data-scene-node="slider"] input');
  assert.equal(range.valueAsNumber, Math.SQRT2); assert.equal(range.step, 'any');
  app.change('number', '.8'); assert.equal(range.valueAsNumber, .8); assert.equal(range.step, '0.3');
  app.change('number', '9.9'); assert.equal(range.valueAsNumber, 9.9); assert.equal(range.step, 'any');
  assert.equal(range.min, '0.2'); assert.equal(range.max, '9.9');
});
test('generated strings stay inert and surface has no bridge/network/storage access', async t => {
  const s = fixture(); s.root.children[0].parts = ['<img src="https://example.invalid" onerror="alert(1)">']; const app = await surface(t, s);
  assert.equal(app.root.querySelector('img,script,iframe,foreignObject'), null); assert.match(app.text('readout'), /<img/);
  const code = readFileSync(new URL('../lib/scene-surface.js', import.meta.url), 'utf8'); assert.doesNotMatch(code, /innerHTML|outerHTML|fetch\(|localStorage|sessionStorage|postMessage|window\.openai|eval\(|new Function/);
  assert.match(sceneText(s), /<img/);
});
test('standalone private preview embeds the exact trusted resource without an authenticated child navigation', async t => {
  const html = readFileSync(new URL('../public/generative-view.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://private-preview.invalid/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  for (const script of dom.window.document.querySelectorAll('script')) dom.window.eval(script.textContent);
  await new Promise(resolve => setTimeout(resolve, 0));
  const frame = dom.window.document.querySelector('iframe'); assert.ok(frame);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts'); assert.equal(frame.hasAttribute('src'), false);
  assert.equal(frame.srcdoc, responseHtml); assert.equal(dom.window.document.querySelectorAll('#cases button').length, 5);
  assert.match(html, /connect-src 'none'/);
});
test('exact generated resource mounts scenes through standard MCP bridge; rejected scene retains complete safe fallback', async t => {
  const dom = new JSDOM(responseHtml, { url: 'https://sandbox.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close()); const w = dom.window; w.TextEncoder = TextEncoder; const outbound = [];
  const send = data => w.dispatchEvent(new w.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) { outbound.push(message); if (message.id) queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: message.method === 'ui/initialize' ? { protocolVersion: '2026-01-26', hostCapabilities: { updateModelContext: {} }, hostContext: { theme: 'dark' } } : {} })); } };
  Object.defineProperty(w, 'parent', { value: parent });
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent);
  await new Promise(resolve => setTimeout(resolve, 25));
  const sample = fixture(); sample.root.children[7].action.value = op('sqrt', 2);
  const normalized = normalizeResponse(input(sample));
  const deliver = (view, text) => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: view, content: [{ type: 'text', text }] } });
  deliver(normalized.view, normalized.text); await new Promise(resolve => setTimeout(resolve, 40));
  const root = w.document.querySelector('#chatui-component'); assert.equal(root.querySelectorAll('.cui-scene').length, 1); assert.equal(root.querySelector('.cui-render-fallback'), null);
  const control = root.querySelector('input[type=number]'); control.value = '7'; control.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(root.textContent, /2 × 7 = 14/); assert.equal(outbound.some(m => m.method === 'ui/update-model-context'), false);
  root.querySelector('[data-scene-node="increment"]').click();
  for (const field of root.querySelectorAll('input[type=range],input[type=number]')) {
    assert.equal(field.valueAsNumber, Math.SQRT2); assert.equal(field.validity.stepMismatch, false);
  }
  assert.equal(Number(root.querySelector('[data-mark-id="bar"]').getAttribute('width')), Math.SQRT2 * 12);
  const malicious = clone(normalized.view); malicious.contentId += '-bad'; malicious.blocks[0].root.script = 'alert(1)';
  deliver(malicious, '完整安全后备 <script>不执行</script> 末尾'); await new Promise(resolve => setTimeout(resolve, 40));
  assert.match(root.textContent, /完整安全后备 <script>不执行<\/script> 末尾/); assert.equal(root.querySelector('input,svg,script'), null);
});
