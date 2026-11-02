import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { responseHtml } from '../lib/response.generated.mjs';
import { normalizeResponse, compileTex, responseText } from '../lib/response-normalization.mjs';
import { validateResponseInput, validateResponseView, safeResponseUrl, RESPONSE_SCHEMA } from '../lib/response-validation.mjs';
import { validateMath } from '../lib/component-validation.mjs';
import { handleMcp, RESPONSE_RESOURCE_URI } from '../lib/mcp.mjs';
import { responseFactories, referenceIndex } from '../examples/responses.mjs';
import { projectQuizResult, hydrateQuizView } from '../lib/quiz-boundary.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const prose = (id, text) => ({ id, kind: 'prose', text });
const config = blocks => ({ schemaVersion: 1, contentId: 'response-regression-v1', facts: {}, blocks });
const resultFor = input => { const { view, text } = normalizeResponse(input); return projectQuizResult({ structuredContent: view, content: [{ type: 'text', text }] }); };
async function rpc(method, params = {}, signed = true) {
  const headers = { 'content-type': 'application/json', ...(signed ? { 'oai-authenticated-user-id': 'unit-fixture', 'oai-authenticated-user-email': 'unit@example.invalid' } : {}) };
  const response = await handleMcp(new Request('https://renderer.test/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  return { status: response.status, ...(await response.json()) };
}
async function host(t, { widgetState, followup = true, rejectMessage = false } = {}) {
  const errors = [], outbound = [], saved = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(responseHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid/', virtualConsole });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const send = message => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: message }));
  const parent = { postMessage(message) {
    outbound.push(copy(message));
    if (message.id === undefined) return;
    queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, ...(rejectMessage && message.method === 'ui/message' ? { error: { code: -1, message: 'rejected' } } : { result: message.method === 'ui/initialize' ? { protocolVersion: '2026-01-26', hostCapabilities: { updateModelContext: {}, ...(followup ? { message: {} } : {}) }, hostContext: { theme: 'dark' } } : {} }) }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { widgetState, setWidgetState: payload => saved.push(copy(payload)) };
  for (const script of window.document.querySelectorAll('script')) window.eval(script.textContent);
  await tick();
  const root = window.document.querySelector('#chatui-component');
  const deliver = result => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: copy(result) });
  const complete = async () => { for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await tick(10); assert.notEqual(root.getAttribute('aria-busy'), 'true'); };
  const button = label => [...root.querySelectorAll('button')].find(node => node.textContent === label);
  t.after(() => { send({ jsonrpc: '2.0', id: 'teardown', method: 'ui/resource-teardown' }); dom.window.close(); });
  return { window, root, errors, outbound, saved, send, deliver, complete, button, block: id => root.querySelector(`[data-block-id="${id}"]`), status: () => window.document.querySelector('#chatui-status').textContent };
}

test('render_response retains its typed read-only contract in the unified transparent resource', async () => {
  const tool = (await rpc('tools/list')).result.tools.find(item => item.name === 'render_response');
  assert.equal(tool.name, 'render_response'); assert.deepEqual(tool.inputSchema, RESPONSE_SCHEMA);
  assert.equal(tool._meta.ui.resourceUri, RESPONSE_RESOURCE_URI); assert.equal(tool.annotations.readOnlyHint, true);
  const resource = (await rpc('resources/read', { uri: RESPONSE_RESOURCE_URI })).result.contents[0];
  assert.equal(resource.text, responseHtml); assert.equal(resource._meta.ui.prefersBorder, false);
  assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
  // DOMPurify parses in an inert document; application mounts never use raw innerHTML.
  for (const path of ['widget-bridge.js', 'html-surface.js', 'explanation-renderer.js']) assert.doesNotMatch(readFileSync(new URL(`../lib/${path}`, import.meta.url), 'utf8'), /innerHTML\s*=/);
  assert.doesNotMatch(responseHtml, /<script[^>]+src=|@import\s+['"]|fonts\.google|katex\.render|Marked\(|SaxesParser|eval\(|new Function/);
});
for (const item of referenceIndex) test(`reference ${item.id}: real tool normalization, readable fallback and actual bridge mount`, async t => {
  const input = responseFactories[item.id](); const original = copy(input);
  const { result } = await rpc('tools/call', { name: 'render_response', arguments: input });
  assert.equal(result.isError, undefined, JSON.stringify(result)); assert.equal(result.structuredContent.viewVersion, 1);
  assert.equal(result.content[0].text, responseText(result.structuredContent)); assert.ok(result.content[0].text.length > 30);
  const publicSnapshot = copy(result.structuredContent), hydrated = hydrateQuizView(result.structuredContent, result._meta);
  assert.equal(validateResponseView(hydrated), hydrated); assert.deepEqual(result.structuredContent, publicSnapshot); assert.deepEqual(input, original);
  const app = await host(t); app.deliver(result); await app.complete();
  assert.equal(app.status(), ''); if (input.title) assert.ok(app.root.textContent.includes(input.title)); assert.deepEqual(app.errors, []);
  assert.equal(app.saved.length, 0, 'Mounting is not evidence of a genuine interaction');
  if (['comparison', 'derivation', 'answer'].includes(item.id)) assert.ok(app.root.querySelector('math'));
  if (['chart', 'geometry'].includes(item.id)) assert.ok(app.root.querySelector('svg'));
});

test('all document blocks and necessary Markdown become inert DOM and same-source readable fallback', async t => {
  const input = config([
    { id: 'title', kind: 'heading', text: '文档标题', level: 2 },
    prose('body', '**重点**与*说明*、~~删除~~、`code`。\n\n- 一项\n  - 嵌套项\n\n> 引文\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[安全链接](https://example.com/a) [危险](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n![不自动加载](https://example.com/image.png)'),
    { id: 'list', kind: 'list', ordered: true, items: ['**第一项**', '第二项'] },
    { id: 'quote', kind: 'quote', text: '引文正文', citation: '已知来源' },
    { id: 'code', kind: 'code', language: 'html', code: '<script>throw new Error("not executed")</script>' },
    { id: 'math', kind: 'math', tex: String.raw`\frac{1}{2}mv^2` }
  ]);
  const app = await host(t); const result = resultFor(input); app.deliver(result); await app.complete();
  for (const selector of ['h2', 'strong', 'em', 'del', 'ol', 'ul ul', 'blockquote', 'table', 'pre code', 'math']) assert.ok(app.root.querySelector(selector), selector);
  assert.equal(app.root.querySelector('script,img,style,iframe'), null); assert.match(app.root.textContent, /onerror=alert/);
  assert.equal(app.root.querySelectorAll('a').length, 2); assert.match(result.content[0].text, /引文正文[\s\S]*已知来源/);
  assert.match(result.content[0].text, /```html/); assert.doesNotMatch(result.content[0].text, /undefined|\[object Object\]/); assert.equal(app.status(), '');
});

test('one facts dictionary resolves exactly once across prose, compact TeX, data and labels', () => {
  const input = config([prose('intro', '半径 {{r}}；{{literal}}'), { id: 'math', kind: 'math', tex: String.raw`A=\pi\cdot {{r|value}}^2` }, { id: 'geometry', kind: 'component', type: 'geometry', data: { radius: { fact: 'r' }, unit: 'mm' } }]);
  input.facts = { r: { value: 7, unit: 'mm' }, literal: { value: '{{r}}' } };
  const { view, text } = normalizeResponse(input);
  assert.match(text, /半径 7 mm；\{\{r\}\}/); assert.match(text, /pi\\cdot 7\^2/); assert.equal(view.blocks[2].data.radius, 7);
  assert.equal(input.blocks[2].data.radius.fact, 'r');
});

test('KaTeX supports fractions, roots, sums, aligned equations and matrices without HTML', () => {
  for (const tex of [String.raw`\frac{1}{2}mv^2`, String.raw`\sqrt{x^2+y^2}`, String.raw`\sum_{i=1}^{n}i`, String.raw`\begin{aligned}x&=1\\y&=2\end{aligned}`, String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`]) {
    const math = compileTex(tex); assert.doesNotThrow(() => validateMath(math)); assert.doesNotMatch(JSON.stringify(math), /"style"|"href"|"annotation"|"span"/);
  }
});
test('TeX rejects commands for scripts, styles, links, macros, expansion attacks and illegal attributes', () => {
  for (const tex of [String.raw`\href{javascript:alert(1)}{x}`, String.raw`\htmlClass{bad}{x}`, String.raw`\includegraphics{https://evil.invalid/x}`, String.raw`\def\x{\x}\x`, String.raw`\textcolor{red}{x}`, String.raw`\unknowncommand`, String.raw`\frac{1}{`, 'x'.repeat(2401)]) assert.throws(() => compileTex(tex), undefined, tex.slice(0, 50));
  for (const attrs of [{ href: 'https://evil.invalid' }, { style: 'display:none' }, { width: '99999px' }, { mathvariant: 'url(x)' }, { onload: 'alert(1)' }]) assert.throws(() => validateMath({ tag: 'mi', text: 'x', attrs }));
  assert.throws(() => normalizeResponse(config([prose('many', Array.from({ length: 65 }, () => '$x$').join(' '))])), /64/);
});
test('TeX only compiles known formula fields and cannot be smuggled into another component field', () => {
  assert.throws(() => normalizeResponse(config([{ id: 'p', kind: 'component', type: 'progress', data: { total: 10, value: 6, tex: 'x' } }])), /tex 仅/);
  assert.throws(() => normalizeResponse(config([{ id: 'a', kind: 'component', type: 'answer', data: { title: '答案', tex: 'x', math: { tag: 'mi', text: 'x' } } }])), /同时/);
});
test('plain formula and $ / bracket inline formulas normalize without duplicating the whole answer', () => {
  const { view, text } = normalizeResponse(config([prose('p', String.raw`速度 $v_0$ 和 \(a\)，代码 \`x\`。`)]));
  assert.equal(view.blocks[0].nodes[0].children.filter(node => node.type === 'math').length, 2);
  assert.match(text, /v_0/);
});
test('strict budgets reject oversized content, duplicate IDs, arbitrary script/style/SVG and deep groups', async () => {
  const invalid = [config([prose('p', 'x'.repeat(12001))]), config([prose('same', 'a'), prose('same', 'b')]), { ...config([prose('p', 'a')]), script: 'alert(1)' }];
  let nested = prose('inside', 'a'); for (let i = 0; i < 6; i++) nested = { id: `g${i}`, kind: 'group', layout: 'stack', blocks: [nested] }; invalid.push(config([nested]));
  const diagram = copy(responseFactories.geometry()); diagram.blocks.find(block => block.kind === 'diagram').elements[0].style = 'color:red'; invalid.push(diagram);
  for (const input of invalid) { assert.throws(() => validateResponseInput(input)); assert.equal((await rpc('tools/call', { name: 'render_response', arguments: input })).result.isError, true); }
  assert.equal((await rpc('tools/call', { name: 'render_response', arguments: config([prose('p', 'a')]) }, false)).status, 401);
});
test('HTTPS source policy rejects unsafe and credential-bearing URLs', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.com', 'https://example.com/\nfoo', 'file:///tmp/a']) assert.equal(safeResponseUrl(url), false);
  assert.equal(safeResponseUrl('https://example.com/path?q=value#section'), true);
});

test('keyed updates retain the actual focused quiz controls, selected answers, state and completion metrics', async t => {
  const input = responseFactories.quiz(), app = await host(t); app.deliver(resultFor(input)); await app.complete();
  const quiz = app.block('quiz'), radio = quiz.querySelector('input'); radio.click(); radio.focus(); assert.equal(app.saved.length, 1); const savedCount = app.saved.length;
  const next = copy(input); next.blocks[0].text += '\n\n只补充一句说明。'; app.deliver(resultFor(next)); await app.complete(); await tick(50);
  assert.equal(app.block('quiz'), quiz); assert.equal(app.window.document.activeElement, radio); assert.equal(radio.checked, true); assert.equal(app.saved.length, savedCount);
  const timings = app.window.__chatuiMetrics.renders; assert.equal(timings.length, 2); assert.equal(timings[1].keyedUpdate, true); assert.ok(timings[1].completeAt); assert.ok(timings[1].firstPaintMs >= 0);
  const again = copy(next); again.blocks.reverse(); app.deliver(resultFor(again)); await app.complete(); assert.equal(app.block('quiz'), quiz); assert.equal(radio.checked, true);
});
test('changed snapshot ID or facts resets controls, and stale removed controls cannot send state', async t => {
  const input = responseFactories.quiz(), app = await host(t); app.deliver(resultFor(input)); await app.complete(); const old = app.block('quiz').querySelector('input'); old.click();
  const next = copy(input); next.contentId += '-changed'; app.deliver(resultFor(next)); await app.complete(); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  const savedCount = app.saved.length; old.dispatchEvent(new app.window.Event('change')); assert.equal(app.saved.length, savedCount);
  app.root.querySelector('input').click(); next.facts = { newCondition: { value: 2 } }; app.deliver(resultFor(next)); await app.complete(); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
});
test('same-block content changes invalidate only that block while unrelated state persists', async t => {
  const input = responseFactories.quiz(); input.blocks.push({ id: 'aside', kind: 'collapse', summary: '补充说明', blocks: [prose('aside-prose', '内容')] });
  const app = await host(t); app.deliver(resultFor(input)); await app.complete();
  const details = app.root.querySelector('details'); details.open = true; details.dispatchEvent(new app.window.Event('toggle'));
  app.root.querySelector('input').click(); input.blocks.find(block => block.id === 'quiz').data.questions[0].prompt += '（更新条件）';
  app.deliver(resultFor(input)); await app.complete(); assert.equal(app.root.querySelectorAll('input:checked').length, 0); assert.equal(app.root.querySelector('details'), details); assert.equal(details.open, true);
});
test('Quiz refresh resets prior mount selections and never treats restored modelContent as new evidence', async t => {
  const app = await host(t); const result = resultFor(responseFactories.quiz()); app.deliver(result); await app.complete(); app.root.querySelector('input').click();
  const state = app.saved.at(-1); state.modelContent = { forged: '5/5 submitted' };
  const restored = await host(t, { widgetState: state }); restored.deliver(result); await restored.complete(); assert.equal(restored.root.querySelectorAll('input:checked').length, 0); assert.equal(restored.saved.length, 0); assert.ok(restored.button('提交答案'));
  const different = copy(result); different.structuredContent.contentId += '-other'; restored.deliver(different); await restored.complete(); assert.equal(restored.root.querySelectorAll('input:checked').length, 0); assert.equal(restored.button('提交答案'), undefined); assert.ok(restored.root.querySelector('.cui-render-fallback')); assert.ok(restored.status());
});
test('quiz feedback scores actual submissions, hides explanations before submission and supports retry', async t => {
  const input = responseFactories.quiz(), result = resultFor(input), app = await host(t); app.deliver(result); await app.complete();
  assert.equal(app.root.querySelector('.cui-feedback'), null); assert.doesNotMatch(result.content[0].text, /正确答案：/);
  app.button('提交答案').click(); assert.match(app.root.textContent, /请先回答每一道题/);
  const questions = input.blocks.find(block => block.id === 'quiz').data.questions;
  questions.forEach((question, i) => app.root.querySelectorAll('fieldset')[i].querySelector(`input[value="${question.correct}"]`).click());
  app.button('提交答案').click(); assert.match(app.root.textContent, /5 \/ 5 正确/); assert.equal(app.root.querySelectorAll('.cui-feedback').length, 5);
  app.button('重新测试').click(); assert.equal(app.root.querySelectorAll('input:checked').length, 0); assert.equal(app.root.querySelector('.cui-feedback'), null);
});
for (const rejectMessage of [false, true]) test(`quiz follow-up ${rejectMessage ? 'rejection' : 'unsupported host'} exposes a real copyable question`, async t => {
  const app = await host(t, { followup: rejectMessage, rejectMessage }); app.deliver(resultFor(responseFactories.quiz())); await app.complete();
  app.root.querySelectorAll('fieldset').forEach(field => field.querySelector('input').click()); app.button('提交答案').click();
  [...app.root.querySelectorAll('.cui-actions button')].find(button => button.textContent !== '重新测试').click(); await tick();
  const copyArea = app.root.querySelector('textarea'); assert.equal(copyArea.hidden, false); assert.match(copyArea.value, /本次实际提交/); assert.match(copyArea.value, /得分：\d\/5/);
  if (!rejectMessage) assert.equal(app.outbound.filter(message => message.method === 'ui/message').length, 0);
});
test('nested tabs have keyboard operation and collapse state survives refresh', async t => {
  const input = responseFactories.profile(), app = await host(t); app.deliver(resultFor(input)); await app.complete();
  const tabs = app.root.querySelectorAll('[role=tab]'); tabs[0].dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(app.window.document.activeElement, tabs[1]); assert.equal(app.root.querySelectorAll('[role=tabpanel]:not([hidden])').length, 1);
  const restored = await host(t, { widgetState: app.saved.at(-1) }); restored.deliver(resultFor(input)); await restored.complete(); assert.equal(restored.root.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected'), 'true');
  const derivation = resultFor(responseFactories.derivation()); app.deliver(derivation); await app.complete(); const details = app.root.querySelector('details'); details.open = true; details.dispatchEvent(new app.window.Event('toggle'));
  const reopened = await host(t, { widgetState: app.saved.at(-1) }); reopened.deliver(derivation); await reopened.complete(); assert.equal(reopened.root.querySelector('details').open, true);
});
test('long responses batch mounts, interrupted updates finish and removed pending blocks never return', async t => {
  const input = config(Array.from({ length: 32 }, (_, i) => prose(`p${i}`, `第 ${i + 1} 段正文。`))), app = await host(t);
  app.deliver(resultFor(input)); assert.ok(app.root.querySelector('.cui-pending-block'));
  input.blocks.pop(); input.blocks[0].text = '修改后的第一段'; app.deliver(resultFor(input)); await app.complete();
  assert.equal(app.root.querySelector('.cui-pending-block'), null); assert.equal(app.block('p31'), null); assert.match(app.root.textContent, /修改后的第一段/);
  assert.equal(app.root.querySelectorAll('[data-block-id]').length, 31); assert.equal(app.status(), '');
});
test('invalid UI results keep complete readable fallback as text, with no stale controls or HTML execution', async t => {
  const app = await host(t); app.deliver(resultFor(responseFactories.quiz())); await app.complete();
  const text = '完整可读答案\n<script>unsafe()</script>\n最后的结论'; app.deliver({ structuredContent: { viewVersion: 9 }, content: [{ type: 'text', text }] });
  assert.equal(app.root.querySelector('.cui-render-fallback').textContent, text); assert.equal(app.root.querySelector('input,script'), null); assert.match(app.status(), /同源可读文本/);
  const view = normalizeResponse(config([prose('p', '恢复正常。')])).view; view.blocks[0].nodes[0].style = 'display:none'; assert.throws(() => validateResponseView(view));
});
test('partial tool arguments are timing-only and foreign messages cannot render a view', async t => {
  const app = await host(t); const result = resultFor(responseFactories.progress());
  app.send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input-partial', params: result.structuredContent }); assert.equal(app.root.children.length, 0);
  app.window.dispatchEvent(new app.window.MessageEvent('message', { source: {}, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result } })); assert.equal(app.root.children.length, 0);
  app.deliver(result); await app.complete(); assert.equal(app.window.__chatuiMetrics.inputs[0].kind, 'partial');
  app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'light' } }); assert.equal(app.window.document.documentElement.style.colorScheme, 'light');
});
test('standalone kit and MCP MathML attribute policies remain identical', () => {
  const monorepo = existsSync(new URL('../../plugins', import.meta.url));
  const vendored = readFileSync(new URL('../lib/vendor/component-kit.html', import.meta.url), 'utf8');
  const source = monorepo
    ? readFileSync(new URL('../../plugins/chatui/skills/chatui/assets/component-kit.html', import.meta.url), 'utf8')
    : vendored;
  if (monorepo) assert.equal(vendored, source, 'Standalone vendor must equal the canonical kit');
  const server = readFileSync(new URL('../lib/component-validation.mjs', import.meta.url), 'utf8');
  const canonical = source.slice(source.indexOf('const MATH_ATTRIBUTES'), source.indexOf('const safeMath'));
  const policy = server.slice(server.indexOf('export const MATH_ATTRIBUTES'), server.indexOf('export function inspect')).replaceAll('export ', '').replaceAll('check(', 'require(').replace('object(attrs)', "(attrs && typeof attrs === 'object' && !Array.isArray(attrs))");
  assert.equal(canonical.replace(/\s/g, ''), policy.replace(/\s/g, ''));
});
