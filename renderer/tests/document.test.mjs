import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { JSDOM, VirtualConsole } from 'jsdom';
import { normalizeDocument, lexDocument } from '../lib/document-normalization.mjs';
import { validateDocumentView } from '../lib/document-validation.mjs';
import { documentFactories, quizData } from '../examples/documents.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { DOCUMENT_TOOL, DOCUMENT_RESOURCE_URI, handleMcp } from '../lib/mcp.mjs';
import { validateResponseView } from '../lib/response-validation.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { compileDocumentInput } from '../lib/document-normalization.mjs';
import { projectQuizResult, projectQuizView } from '../lib/quiz-boundary.mjs';
const input = source => ({ contentId: 'doc-test', source });
const directive = (type, data, body = '') => `:::${type} ${JSON.stringify(data)}\n${body}\n:::`;
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const validOutput = new Ajv({ strict: false }).compile(DOCUMENT_TOOL.outputSchema);

test('document separators preserve indented Markdown code and its literal directive text', () => {
  const source = '\n    :::progress {"value":1,"total":2}\n    :::\n';
  const { view, text } = normalizeDocument(input(source));
  assert.equal(view.blocks[0].nodes[0].type, 'codeblock');
  assert.match(text, /:::progress/);
  const callout = normalizeDocument(input(':::callout {}\n    literal code\n:::')).view;
  assert.equal(callout.blocks[0].blocks[0].nodes[0].type, 'codeblock');
});

async function host(t, savedState) {
  const errors = [], saved = [], outbound = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!e.message.includes('Could not parse CSS')) errors.push(e.message); });
  const dom = new JSDOM(documentHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid', virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) {
    outbound.push(message);
    if (message.id) queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: message.method === 'ui/initialize' ? { protocolVersion: '2026-01-26', hostCapabilities: {}, hostContext: { theme: 'light' } } : {} }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { widgetState: savedState, setWidgetState: payload => saved.push(JSON.parse(JSON.stringify(payload))) };
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick(); const root = window.document.querySelector('#chatui-component');
  t.after(() => { send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); window.close(); });
  return { root, window, saved, errors, outbound, async deliver(normalized) {
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: projectQuizResult({ structuredContent: normalized.view, content: [{ type: 'text', text: normalized.text }] }) });
    for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await tick();
    assert.equal(window.document.querySelector('#chatui-status').textContent, '');
  } };
}

test('checkpoint 1: normal Markdown/math/callouts compile and mount in one document', async t => {
  const normalized = normalizeDocument(documentFactories.teaching());
  assert.equal(validOutput(normalized.view), true, JSON.stringify(validOutput.errors));
  const app = await host(t); await app.deliver(normalized);
  for (const selector of ['h2', 'p', 'ul', 'blockquote', 'pre code', 'math[display=block]', 'math[display=inline]']) assert.ok(app.root.querySelector(selector), selector);
  assert.equal(app.root.querySelectorAll('[role=note]').length, 2);
  assert.ok(app.root.classList.contains('cui-rich-document'));
  for (const phrase of ['为什么要先分离变量', '积分常数不能丢', '确认模型条件', '每一次变形', '最后，回到原始方程']) assert.ok(normalized.text.includes(phrase), phrase);
  assert.deepEqual(app.errors, []); assert.equal(app.saved.length, 0);
});

test('lexer supports multiline JSON, CRLF, and shields backtick/tilde fenced examples', () => {
  const source = '~~~md\n:::not-a-tool {}\n::: \n~~~\n\n:::callout {\n"tone":"key",\n"title":"brace } and escaped \\\""\n}\nbody\n:::';
  const segments = lexDocument(source.replaceAll('\n', '\r\n'));
  assert.equal(segments.length, 2); assert.equal(segments[0].type, 'markdown'); assert.equal(segments[1].options.tone, 'key');
  assert.equal(lexDocument('```\n:::quiz {}\n::: \n```')[0].type, 'markdown');
});

test('document Markdown and component labels preserve literal braces instead of interpreting legacy fact placeholders', () => {
  const normalized = normalizeDocument(input('Literal {{user}}.\n\n```template\n{{name}}\n```\n\n' + directive('profile', { name: '{{title}}' })));
  for (const value of ['{{user}}', '{{name}}', '{{title}}']) assert.ok(normalized.text.includes(value));
});

test('malformed, unknown, nested, and oversized directives fail without truncation', () => {
  for (const source of [':::', ':::callout nope', ':::callout {bad}\nbody\n:::', ':::callout {\n:::', ':::callout {}\nbody', ':::unknown {}\n:::', ':::callout {}\n:::callout {}\nx\n:::\n:::', ':::callout {"css":"x"}\nx\n:::', ':::progress {"value":1,"total":2}\nunexpected\n:::']) assert.throws(() => normalizeDocument(input(source)), Error, source);
  assert.throws(() => normalizeDocument(input('中'.repeat(22000))), /65536/);
  assert.throws(() => normalizeDocument(input('a'.repeat(32769))), /32768/);
  assert.throws(() => normalizeDocument(input(Array(33).fill(directive('callout', {}, 'x')).join('\n'))), /32/);
  assert.throws(() => normalizeDocument(input(Array(25).fill(directive('progress', { value: 1, total: 2 })).join('\n'))), /24/);
  assert.throws(() => normalizeDocument({ ...input('body'), unexpected: 1 }), /字段/);
  assert.throws(() => normalizeDocument({ ...input('body'), theme: 'dark' }), /native/);
});

test('unsafe HTML is literal; links obey existing HTTPS rules; math keeps server safety budgets', async t => {
  const normalized = normalizeDocument(input('<script>alert(1)</script>\n\n[x](javascript:alert%281%29) [safe](https://example.com)\n\n| A | B |\n|---|---|\n| 1 | 2 |'));
  const app = await host(t); await app.deliver(normalized);
  assert.equal(app.root.querySelector('script'), null); assert.ok(app.root.textContent.includes('<script>'));
  assert.equal(app.root.querySelectorAll('a').length, 1); assert.equal(app.root.querySelector('a').href, 'https://example.com/');
  assert.ok(app.root.querySelector('table th'));
  for (const formula of [String.raw`\href{https://evil.com}{x}`, String.raw`\htmlClass{a}{x}`, String.raw`\newcommand{\x}{a}`, 'x'.repeat(2401)]) assert.throws(() => normalizeDocument(input(`\\[${formula}\\]\n`)));
  assert.throws(() => normalizeDocument(input(Array(65).fill(String.raw`\(x\)`).join(' '))), /64/);
});

test('strict visual validation and complete fallback; quiz fallback never exposes grading/explanations', () => {
  for (const factory of Object.values(documentFactories)) {
    const { view, text } = normalizeDocument(factory()); validateDocumentView(view);
    assert.equal(validOutput(projectQuizView(view).view), true, JSON.stringify(validOutput.errors)); assert.ok(text.length > 30);
    assert.throws(() => validateResponseView(view), /属性/);
  }
  for (const [type, data] of [['progress', { value: 3, total: 2 }], ['profile', { name: 'a', css: 'evil' }], ['comparison', { items: [{ label: 'a', event: 'onclick' }] }], ['quiz', { questions: [{ ...quizData.questions[0], options: [{ id: 'a', label: 'x', handler: 'x' }, { id: 'b', label: 'y' }] }] }]]) assert.throws(() => normalizeDocument(input(directive(type, data))));
  const fallback = normalizeDocument(documentFactories.quiz()).text;
  for (const q of quizData.questions) { assert.ok(fallback.includes(q.prompt)); assert.ok(!fallback.includes(q.explanation)); }
});

test('identity is stable across preceding prose; changed component data and duplicate occurrences isolate state', () => {
  const source = directive('quiz', quizData);
  const first = normalizeDocument(input(source)).view;
  const second = normalizeDocument(input('new prose\n\n' + source)).view;
  assert.equal(first.blocks[0].id, second.blocks[1].id); assert.notEqual(first.sourceHash, second.sourceHash);
  const changed = structuredClone(quizData); changed.questions[0].prompt += ' changed';
  assert.notEqual(first.blocks[0].id, normalizeDocument(input(directive('quiz', changed))).view.blocks[0].id);
  const doubled = normalizeDocument(input(source + '\n' + source)).view;
  assert.notEqual(doubled.blocks[0].id, doubled.blocks[1].id);
  assert.throws(() => normalizeDocument(input(directive('profile', { name: 'a', key: 'same' }) + '\n' + directive('profile', { name: 'b', key: 'same' }))), /key/);
});

test('new MCP tool has its own versioned resource, authentication, full fallback and clear errors', async () => {
  const call = async (method, params, signed = false) => {
    const response = await handleMcp(new Request('https://test.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(signed ? { 'oai-authenticated-user-id': 'fixture', 'oai-authenticated-user-email': 'fixture@example.invalid' } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
    return { status: response.status, ...await response.json() };
  };
  assert.equal(DOCUMENT_TOOL._meta.ui.resourceUri, DOCUMENT_RESOURCE_URI);
  const resource = (await call('resources/read', { uri: DOCUMENT_RESOURCE_URI })).result.contents[0]; assert.equal(resource.text, documentHtml);
  assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
  assert.doesNotMatch(resource.text, /<script[^>]+src=|fetch\(|eval\(|new Function|Marked\(|katex\.render/);
  assert.equal((await call('tools/call', { name: 'render_document', arguments: input('body') })).status, 401);
  const success = (await call('tools/call', { name: 'render_document', arguments: documentFactories.teaching() }, true)).result;
  assert.equal(success.isError, undefined); assert.ok(success.content[0].text.includes('最后，回到原始方程'));
  assert.equal((await call('tools/call', { name: 'render_document', arguments: input(':::bad {}\n:::') }, true)).result.isError, true);
});

test('checkpoint 2: static directives embed the mature components in the reading flow', async t => {
  for (const name of ['project', 'comparison', 'visual']) {
    const app = await host(t); const normalized = normalizeDocument(documentFactories[name]()); await app.deliver(normalized);
    for (const block of normalized.view.blocks) assert.ok(app.root.querySelector(`[data-block-id="${block.id}"]`), block.kind);
    assert.deepEqual(app.errors, []); assert.equal(app.saved.length, 0);
  }
});

test('checkpoint 3: quiz grades real submissions, retries and restores; changed questions reset old state', async t => {
  const normalized = normalizeDocument(documentFactories.quiz()); const app = await host(t); await app.deliver(normalized);
  const button = label => [...app.root.querySelectorAll('button')].find(b => b.textContent === label);
  assert.ok(!app.root.textContent.includes(quizData.questions[0].explanation));
  button('提交答案').click(); assert.match(app.root.textContent, /请先回答每一道题/);
  const fields = [...app.root.querySelectorAll('fieldset')];
  fields.forEach((field, index) => field.querySelector(`input[value="${quizData.questions[index].correct}"]`).click());
  button('提交答案').click(); assert.match(app.root.textContent, /2 \/ 2 正确/);
  assert.ok(app.root.textContent.includes(quizData.questions[0].explanation));
  const submitted = app.saved.at(-1);
  const restored = await host(t, submitted); await restored.deliver(normalized); assert.equal(restored.root.querySelectorAll('input:checked').length, 0); assert.equal(restored.root.querySelector('.cui-feedback'), null); assert.equal(restored.saved.length, 0);
  app.window.dispatchEvent(new app.window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: submitted } } }));
  assert.match(app.root.textContent, /2 \/ 2 正确/);
  button('重新测试').click(); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  app.root.querySelector('input').click(); const radio = app.root.querySelector('input'); radio.focus();
  const next = normalizeDocument({ ...documentFactories.quiz(), source: '前面的新说明。\n\n' + documentFactories.quiz().source });
  await app.deliver(next); assert.equal(app.root.querySelector('input'), radio); assert.equal(radio.checked, true);
  const changed = normalizeDocument({ ...documentFactories.quiz(), source: documentFactories.quiz().source.replace('速度为零时', '瞬时速度为零时') });
  await app.deliver(changed); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  assert.ok(!app.outbound.some(message => message.method === 'tools/call' || message.method === 'ui/message'));
});

test('collapse and tabs keep semantic keyboard controls and isolate restored disclosure state', async t => {
  const normalized = normalizeDocument(documentFactories.comparison()); const app = await host(t); await app.deliver(normalized);
  // The document reading outline is also native details, with intentionally
  // ephemeral state. Exercise the authored disclosure's persisted state here.
  const details = app.root.querySelector('details.cui-collapse');
  assert.equal(details.querySelector('summary').textContent, '展开检查条件');
  details.open = true; details.dispatchEvent(new app.window.Event('toggle')); await tick();
  assert.ok(Object.values(app.saved.at(-1).privateContent.chatuiResponse.blocks).some(block => block.privateContent.collapse?.open === true));
  const tabs = [...app.root.querySelectorAll('[role=tab]')];
  tabs[0].dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(app.window.document.activeElement, tabs[1]);
  const restored = await host(t, app.saved.at(-1)); await restored.deliver(normalized);
  assert.equal(restored.root.querySelector('details.cui-collapse').open, true); assert.equal(restored.root.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected'), 'true');
  const changed = normalizeDocument({ ...documentFactories.comparison(), source: documentFactories.comparison().source.replace('展开检查条件', '新的补充条件') });
  await restored.deliver(changed); assert.equal(restored.root.querySelector('details.cui-collapse').open, false);
});

test('client rejects forged mode/callout metadata and exposes the complete same-source fallback', async t => {
  const app = await host(t); const normalized = normalizeDocument(documentFactories.teaching());
  const malformed = { ...normalized.view, callouts: { [normalized.view.blocks[0].id]: 'key' } };
  assert.throws(() => validateDocumentView(malformed), /提示块/);
  const parent = app.window.parent;
  app.window.dispatchEvent(new app.window.MessageEvent('message', { source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: malformed, content: [{ type: 'text', text: normalized.text }] } } }));
  assert.equal(app.root.querySelector('.cui-render-fallback').textContent, normalized.text);
});

test('RC: bounded KaTeX failures preserve literal math and surrounding document, legacy route stays strict', async t => {
  const tex = String.raw`\frac{x}{`;
  const normalized = normalizeDocument(input(`Before $x^2$ and $${tex}$. After.\n\n${directive('comparison', { items: [{ label: 'broken', tex }, { label: 'valid', tex: 'y^2' }] })}`));
  assert.deepEqual(normalized.mathDiagnostics.map(d => d.stage), ['katex', 'katex']);
  assert.match(normalized.text, /After/);
  assert.match(normalized.text, /\\frac\{x\}\{/);
  assert.throws(() => normalizeResponse(compileDocumentInput(input(`$${tex}$`)).response), /TeX/);
  const app = await host(t); await app.deliver(normalized);
  assert.equal(app.root.querySelectorAll('math').length, 4);
  assert.equal(app.root.textContent.split('公式排版失败').length - 1, 2);
  assert.deepEqual(app.errors, []);
});

test('RC diagnostics and cache-isolated resource URIs are opt-in; production discovery is unchanged', async () => {
  const rpc = async (method, params, opts) => (await (await handleMcp(new Request('https://renderer.invalid/mcp', {method:'POST', headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),opts)).json()).result;
  const before = await rpc('tools/list', {});
  assert.equal(before.tools.find(t => t.name === 'render_document')._meta.ui.resourceUri, DOCUMENT_RESOURCE_URI);
  const candidate = await rpc('tools/list', {}, {documentRouting:true,diagnostics:{version:'1.5.1-rc.3'}});
  const uri = candidate.tools.find(t => t.name === 'render_document')._meta.ui.resourceUri;
  assert.equal(uri, 'ui://chatui/document-v4-rc3.html');
  const resource = await rpc('resources/read', {uri}, {diagnostics:{version:'1.5.1-rc.3'}});
  assert.equal(resource.contents[0].uri, uri);
  assert.match(resource.contents[0].text, /data-chatui-diagnostics="rc3"/);
  assert.equal(await rpc('resources/read', {uri}), undefined);
});


test('RC: reproduced authoring double-escape fails at MathML validation, document fallback retains the exact TeX', () => {
  const tex = String.raw`\int_a^b f(x)\\,dx=F(b)-F(a)`;
  const document = input(`Before $${tex}$. After.`);
  assert.throws(() => normalizeResponse(compileDocumentInput(document).response), /公式不能含 HTML、样式、链接或事件属性/);
  const result = normalizeDocument(document);
  assert.equal(result.mathDiagnostics[0].stage, 'mathml-validation');
  assert.ok(result.text.includes(tex));
  assert.ok(result.text.includes('After'));
});

test('RC: staged server diagnostics survive the actual result-to-DOM bridge', async t => {
  const result = normalizeDocument(input('Before $x^2$. After.'));
  result.view.runtimeDiagnostics = {version:'1.5.1-rc.3',instanceId:'test-instance',documentCompileNumber:1,normalizationMs:2,mathFallbacks:0};
  assert.equal(validOutput(result.view),true,JSON.stringify(validOutput.errors));
  const app = await host(t); await app.deliver(result); await tick();
  for (let i = 0; i < 20 && !JSON.parse(app.root.getAttribute('data-chatui-rc')).metrics.renders[0]?.firstPaintAt; i++) await tick();
  const diagnostics = JSON.parse(app.root.getAttribute('data-chatui-rc'));
  assert.deepEqual(diagnostics.server,result.view.runtimeDiagnostics);
  assert.equal(diagnostics.contentId,result.view.contentId);
  assert.ok(diagnostics.metrics.renders[0].firstPaintAt !== null);
});

test('RC: missing, model-only and incomplete quiz restore candidates cannot reveal grading', async t => {
  const result = normalizeDocument(documentFactories.quiz());
  const app = await host(t); await app.deliver(result);
  const q = [...app.root.querySelectorAll('fieldset')];
  q.forEach((field,index)=>field.querySelector(`input[value="${quizData.questions[index].correct}"]`).click());
  [...app.root.querySelectorAll('button')].find(b=>b.textContent==='提交答案').click();
  const saved = app.saved.at(-1);
  const incomplete = structuredClone(saved);
  const entry = Object.values(incomplete.privateContent.chatuiResponse.blocks)[0];
  entry.privateContent.chatui.value.answers = {};
  entry.privateContent.chatui.value.submitted = true;
  for (const candidate of [undefined, {modelContent:saved.modelContent}, incomplete]) {
    const fresh = await host(t,candidate); await fresh.deliver(result);
    assert.equal(fresh.root.querySelectorAll('input:checked').length,0);
    assert.ok(!fresh.root.textContent.includes('正确答案'));
    assert.ok(!fresh.root.textContent.includes(quizData.questions[0].explanation));
  }
});


test('RC: a supplied math label cannot erase literal TeX from the complete document fallback', () => {
  const tex = String.raw`\frac{x}{`;
  const result = normalizeDocument(input(directive('answer', {title:'说明',mathLabel:'人类标签',tex})));
  assert.equal(result.mathDiagnostics.length,1);
  assert.ok(result.text.includes('人类标签'));
  assert.ok(result.text.includes(tex));
});

test('RC: client rejection keeps the complete readable document and never reveals unsubmitted quiz answers', async t => {
  const tex = String.raw`\frac{x}{`;
  const result = normalizeDocument(input('Before.\n\n' + directive('answer',{title:'结果',mathLabel:'人类标签',tex}) + '\n\n' + directive('quiz',quizData) + '\n\nAfter.'));
  const app = await host(t);
  app.window.dispatchEvent(new app.window.MessageEvent('message',{source:app.window.parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{...result.view,callouts:{invalid:'note'}},content:[{type:'text',text:result.text}]}}}));
  await tick();
  const fallback = app.root.querySelector('pre.cui-render-fallback');
  assert.ok(fallback);
  for (const literal of ['Before.','After.','人类标签',tex,quizData.questions[0].prompt]) assert.ok(fallback.textContent.includes(literal),literal);
  assert.ok(!fallback.textContent.includes(quizData.questions[0].explanation));
  assert.equal(app.root.querySelectorAll('script').length,0);
});
