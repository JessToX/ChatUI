import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { validateInputForm } from '../lib/input-form-policy.mjs';
import { validateComponent, TYPES } from '../lib/component-validation.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { handleMcp } from '../lib/mcp.mjs';
import { g09, g10 } from '../examples/iteration-one.mjs';

const data = () => ({ fields: [{ id: 'count', type: 'number', label: '数量', min: 0, max: 10, value: 4 }, { id: 'note', type: 'textarea', label: '记录', maxLength: 500 }] });
const component = form => ({ schemaVersion: 1, contentId: 'iteration1-synthetic', type: 'input-form', data: form });
const rpc = async (method, params = {}) => (await (await handleMcp(new Request('https://synthetic.invalid/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic', 'oai-authenticated-user-email': 'synthetic@example.invalid' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
}))).json()).result;
async function mount(t, input) {
  const normalized = normalizeDocument(input), saves = [], errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(documentHtml, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const bridge = readFileSync(new URL('../lib/widget-bridge.js', import.meta.url), 'utf8');
  for (const script of window.document.scripts) window.eval(script.textContent.replace(bridge, ''));
  const root = window.document.getElementById('chatui-component');
  const instance = window.eval('mountExplanation')(normalized.view, { setWidgetState: value => saves.push(JSON.parse(JSON.stringify(value))), scheduleBatch: callback => setTimeout(callback, 0) }, root);
  for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await new Promise(resolve => setTimeout(resolve, 10));
  t.after(() => { instance.destroy(); window.close(); });
  return { window, root, instance, saves, errors, normalized };
}

test('form standalone helper and server policy are identical, closed and bounded', () => {
  const source = readFileSync(new URL('../../plugins/chatui/skills/chatui/assets/component-kit.html', import.meta.url), 'utf8');
  const helper = source.match(/  \/\/ chatui:helper form begin\n([\s\S]*?)  \/\/ chatui:helper form end/)[1].replace(/^  /gm, '');
  const policy = readFileSync(new URL('../lib/input-form-policy.mjs', import.meta.url), 'utf8').slice(readFileSync(new URL('../lib/input-form-policy.mjs', import.meta.url), 'utf8').indexOf('export function')).replace(/^export /gm, '');
  assert.equal(helper, policy);
  const valid = data(); assert.doesNotThrow(() => validateComponent(component(valid)));
  for (const invalid of [
    { fields: [] }, { fields: Array(9).fill(valid.fields[0]) }, { ...valid, action: 'https://example.invalid' },
    { fields: [valid.fields[0], valid.fields[0]] },
    ...[{ type: 'password' }, { type: 'file' }, { min: -1e13 }, { min: 11 }, { value: '4' }, { value: 11 }, { required: 'yes' }, { onInput: 'alert(1)' }, { id: 'constructor' }].map(change => ({ fields: [{ ...valid.fields[0], ...change }] })),
    { fields: [{ ...valid.fields[1], maxLength: 501 }] },
    { fields: [{ id: 'choice', type: 'select', label: '选择', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] }] }
  ]) assert.throws(() => validateInputForm(invalid), JSON.stringify(invalid));
  assert.throws(() => normalizeDocument({ contentId: 'invalid', source: ':::input-form {"fields":[],"__proto__":{}}\n:::' }));
  assert.throws(() => validateInputForm({ fields: Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, type: 'textarea', label: '容量', maxLength: 500 })) }), /1000/);
});

test('all four component entry points accept forms and return complete form fallback; six tools remain and twenty current/legacy URIs are readable', async () => {
  const tools = (await rpc('tools/list')).tools;
  assert.deepEqual(tools.map(tool => tool.name), ['render_html', 'render_response', 'render_component', 'render_incline_forces', 'render_explanation', 'render_document']);
  assert.equal(TYPES.length, 17);
  const source = readFileSync(new URL('../lib/mcp.mjs', import.meta.url), 'utf8');
  const uris = [...new Set(source.match(/ui:\/\/chatui\/[a-z0-9-]+\.html/g))]; assert.equal(uris.length, 20);
  for (const uri of uris) assert.ok((await rpc('resources/read', { uri })).contents[0].text.includes('inputForm'));
  const config = component(data()), composition = { schemaVersion: 1, contentId: config.contentId, facts: {}, blocks: [{ id: 'form', kind: 'component', type: config.type, data: config.data }] };
  for (const [name, args] of [['render_component', config], ['render_explanation', composition], ['render_response', composition], ['render_document', { contentId: config.contentId, source: `:::input-form ${JSON.stringify(config.data)}\n:::` }]]) {
    const result = await rpc('tools/call', { name, arguments: args }); assert.equal(result.isError, undefined, name);
    for (const literal of ['数量', '初始值 4', '记录', '最多 500', '提交', '重置']) assert.ok(result.content[0].text.includes(literal), `${name}: ${literal}`);
    const invalid = structuredClone(args);
    if (name === 'render_document') invalid.source = ':::input-form {"fields":[]}\n:::';
    else if (name === 'render_component') invalid.data.fields = [];
    else invalid.blocks[0].data.fields = [];
    assert.equal((await rpc('tools/call', { name, arguments: invalid })).isError, true);
  }
});

test('G09 combines prose/math/parameter/graph/live table/collapse with a fixed independent mathematical oracle', async t => {
  const app = await mount(t, g09()), { root, window } = app;
  const fixed = root.querySelector('.cui-document').textContent;
  const input = root.querySelector('[data-geometry-input]'); assert.ok(input);
  for (const q of [1, 1.5, 1.2345, .05, 1.95]) {
    input.value = String(q); input.dispatchEvent(new window.Event('input')); input.dispatchEvent(new window.Event('change'));
    const h = Number(root.querySelector('[data-geometry-result="height"]').dataset.value), b = Number(root.querySelector('[data-geometry-result="base"]').dataset.value), a = Number(root.querySelector('[data-geometry-result="area"]').dataset.value);
    assert.equal(h, 2 * q); assert.ok(Math.abs(a - b * h / 2) < 1e-12);
    // Pythagoras gives a second, independent calculation from chord offset.
    assert.ok(Math.abs(b - 2 * Math.sqrt(4 - (2 - h) ** 2)) < 1e-12);
    assert.ok(a <= 3 * Math.sqrt(3) + 1e-12);
  }
  assert.equal(root.querySelector('.cui-document').textContent, fixed);
  assert.ok(root.querySelector('math')); assert.ok(root.querySelector('svg[role="img"]')); assert.ok(root.querySelector('details'));
  for (const literal of ['固定题设', '当前实验', '推导与限制', '完整文档到此结束', '初始实验结果', '0.05≤q≤1.95']) assert.ok(app.normalized.text.includes(literal), literal);
  assert.deepEqual(app.errors, []);
});

test('generated compositor isolates drafts, sends values only on submit and rejects stale state writes after disposal', async t => {
  const app = await mount(t, g10()), { root, window } = app;
  const input = root.querySelector('[data-form-field="title"]'); input.value = 'DRAFT_SENTINEL'; input.dispatchEvent(new window.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.ok(app.saves.length); assert.equal(JSON.stringify(app.saves.at(-1).modelContent).includes('DRAFT_SENTINEL'), false);
  assert.ok(JSON.stringify(app.saves.at(-1).privateContent).includes('DRAFT_SENTINEL'));
  const method = root.querySelector('select'); method.value = 'direct'; method.dispatchEvent(new window.Event('input'));
  const check = root.querySelector('[type="checkbox"]'); check.checked = true; check.dispatchEvent(new window.Event('input'));
  const submit = root.querySelector('[data-form-action="submit"]'); submit.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.ok(JSON.stringify(app.saves.at(-1).modelContent).includes('DRAFT_SENTINEL'));
  assert.ok(app.saves.every(value => JSON.stringify(value).length <= 65536));
  const count = app.saves.length; app.instance.destroy(); submit.click(); input.dispatchEvent(new window.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 180)); assert.equal(app.saves.length, count);
  assert.equal(app.normalized.text.includes('DRAFT_SENTINEL'), false); assert.deepEqual(app.errors, []);
});
