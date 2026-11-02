import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole } = jsdom;
import { normalizeHtml, sanitizeHtmlFragment, htmlFallbackText } from '../lib/html-normalization.mjs';
import { sanitizeBrowserHtml } from '../lib/html-surface.js';
import { HTML_CLASSES, HTML_TAGS, HTML_MAX_BYTES } from '../lib/html-policy.mjs';
import { validateHtmlInput, validateHtmlView, HTML_INPUT_SCHEMA, HTML_OUTPUT_SCHEMA } from '../lib/html-validation.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { handleMcp, RESPONSE_RESOURCE_URI } from '../lib/mcp.mjs';
import { velocityHtml, disclosureHtml, readingHtml } from '../examples/html.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const input = html => ({ contentId: 'html-unit-v1', html });
const resultFor = config => { const { view, text } = normalizeHtml(config); return { structuredContent: view, content: [{ type: 'text', text }] }; };
const structuredFor = blocks => { const { view, text } = normalizeResponse({ schemaVersion: 1, contentId: 'structured-unit-v1', facts: {}, blocks }); return { structuredContent: view, content: [{ type: 'text', text }] }; };
async function rpc(method, params = {}, { signed = true, headers: extra = {} } = {}) {
  const headers = { 'content-type': 'application/json', ...(signed ? { 'oai-authenticated-user-id': 'synthetic-html-user', 'oai-authenticated-user-email': 'html@example.invalid' } : {}), ...extra };
  const response = await handleMcp(new Request('https://renderer.test/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  return { status: response.status, ...await response.json() };
}
async function host(t, { openLinks = true, rejectedLink = false } = {}) {
  const errors = [], outbound = [], saved = [], network = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(responseHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid/', virtualConsole });
  const { window } = dom; window.TextEncoder = TextEncoder;
  window.alert = () => errors.push('model-script-executed');
  window.fetch = url => { network.push(String(url)); throw new Error('No widget network'); };
  const send = message => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: message }));
  const parent = { postMessage(message) {
    outbound.push(clone(message)); if (message.id === undefined) return;
    queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id,
      ...(rejectedLink && message.method === 'ui/open-link' ? { error: { code: -1, message: 'rejected' } } : { result: message.method === 'ui/initialize' ? {
        hostCapabilities: { updateModelContext: {}, ...(openLinks ? { openLinks: {} } : {}) }, hostContext: { theme: 'light' }
      } : {} }) }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { widgetState: { stale: 'ignored-for-html' }, setWidgetState: state => saved.push(clone(state)) };
  for (const script of window.document.querySelectorAll('script')) window.eval(script.textContent);
  await tick();
  const root = window.document.getElementById('chatui-component');
  const deliver = result => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: clone(result) });
  t.after(() => { send({ jsonrpc: '2.0', id: 'teardown', method: 'ui/resource-teardown' }); window.close(); });
  return { window, root, errors, network, saved, outbound, send, deliver, status: () => window.document.getElementById('chatui-status').textContent };
}

test('render_html preserves strict contracts and shares the current auxiliary resource with render_response', async () => {
  const tools = (await rpc('tools/list')).result.tools;
  const html = tools.find(tool => tool.name === 'render_html');
  const structured = tools.find(tool => tool.name === 'render_response');
  assert.equal(tools[0], html); assert.deepEqual(html.inputSchema, HTML_INPUT_SCHEMA); assert.deepEqual(html.outputSchema, HTML_OUTPUT_SCHEMA);
  assert.match(html.description, /Compatibility entry/); assert.match(html.description, /Independent server\/browser sanitization/);
  assert.match(html.description, /complete native prose/);
  assert.equal(html.annotations.readOnlyHint, true); assert.equal(html._meta.ui.resourceUri, 'ui://chatui/response-v7.html');
  assert.equal(html._meta.ui.resourceUri, structured._meta.ui.resourceUri); assert.equal(html._meta['openai/outputTemplate'], RESPONSE_RESOURCE_URI);
  const init = (await rpc('initialize')).result;
  assert.equal(init.serverInfo.version, '1.6.1-iteration.1'); assert.match(init.instructions, /self-contained native prose/); assert.match(init.instructions, /render_response only when a local visual or interaction/);
  const current = (await rpc('resources/read', { uri: RESPONSE_RESOURCE_URI })).result.contents[0];
  const alias = (await rpc('resources/read', { uri: 'ui://chatui/response-v1.html' })).result.contents[0];
  assert.equal(alias.uri, 'ui://chatui/response-v1.html'); assert.equal(alias.text, current.text); assert.deepEqual(alias._meta, current._meta);
  assert.equal(current.mimeType, 'text/html;profile=mcp-app'); assert.equal(current._meta.ui.prefersBorder, false);
  assert.deepEqual(current._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
  assert.doesNotMatch(responseHtml, /<script[^>]+src=|<iframe|fetch\(|@import\s+['"]|eval\(|new Function/);
});

test('tool sanitizes without mutating input, defaults native theme and returns complete same-source text', async () => {
  const config = { ...input(velocityHtml), title: '仅作为元数据，不自动插入' }; const original = clone(config);
  const { result } = await rpc('tools/call', { name: 'render_html', arguments: config });
  assert.equal(result.isError, undefined); assert.equal(result.structuredContent.mode, 'html'); assert.equal(result.structuredContent.schemaVersion, 1);
  assert.equal(result.structuredContent.theme, 'native'); assert.equal(validateHtmlView(result.structuredContent), result.structuredContent);
  assert.equal(result.content[0].text, htmlFallbackText(result.structuredContent.html)); assert.match(result.content[0].text, /三个速度必须在同一个坐标系中处理/);
  assert.deepEqual(config, original); assert.ok(Number.isFinite(result._meta.chatui.normalizationMs));
});

const invalidInputs = [null, [], {}, input(''), input('   '), { ...input('<p>ok</p>'), extra: true },
  { ...input('<p>ok</p>'), contentId: '' }, { ...input('<p>ok</p>'), contentId: 'x'.repeat(201) },
  { ...input('<p>ok</p>'), contentId: '😀'.repeat(201) }, { ...input('<p>ok</p>'), title: null },
  { ...input('<p>ok</p>'), theme: 'dark' }, { ...input('<p>ok</p>'), fallbackText: '' }, { ...input('<p>ok</p>'), fallbackText: 1 }];
for (const [index, config] of invalidInputs.entries()) test(`strict HTML contract rejects malformed input ${index} without fake UI data`, async () => {
  assert.throws(() => validateHtmlInput(config));
  const { result } = await rpc('tools/call', { name: 'render_html', arguments: config });
  assert.equal(result.isError, true); assert.equal(result.structuredContent, undefined); assert.equal(typeof result.content[0].text, 'string');
});

test('HTML calls retain authentication, origin checking and streamed 256 KiB request limit', async () => {
  const params = { name: 'render_html', arguments: input('<p>safe</p>') };
  assert.equal((await rpc('tools/call', params, { signed: false })).status, 401);
  assert.equal((await rpc('tools/call', params, { signed: false, headers: { 'oai-authenticated-user-id': 'id-only' } })).status, 401);
  assert.equal((await rpc('tools/call', params, { headers: { origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await rpc('tools/call', { ...params, arguments: input('中'.repeat(100000)) })).status, 413);
  assert.throws(() => validateHtmlInput(input('a'.repeat(HTML_MAX_BYTES))), /256 KiB/);
  assert.equal((await rpc('tools/call', { ...params, arguments: input('<script>alert(1)</script>') })).result.isError, true);
});

test('metadata and explicit fallback are literal text, never extra HTML or silently truncated', async t => {
  const fallbackText = '<img src="https://evil.invalid/fallback" onerror="alert(1)">\n中文 & entities\n' + '完整尾部'.repeat(2500);
  const result = resultFor({ ...input('<p>当前正文</p>'), title: '不应被插入的标题', fallbackText });
  assert.equal(result.content[0].text, fallbackText); const app = await host(t); app.deliver(result);
  assert.equal(app.root.textContent, '当前正文'); assert.equal(app.root.querySelector('h1,h2'), null);
  result.structuredContent.theme = 'dark'; app.deliver(result);
  assert.equal(app.root.querySelector('pre').textContent, fallbackText); assert.equal(app.root.querySelector('img'), null); assert.deepEqual(app.network, []);
});

test('fallback parser retains Chinese, decoded entities, lists, code whitespace, tables and closed details', () => {
  const html = sanitizeHtmlFragment('<h2>中文 &amp; 实体</h2><p>第一段<br>下一行</p><ol start="3"><li>第三项</li><li value="7">第七项<ul><li>嵌套</li></ul></li></ol><ol reversed><li>倒二</li><li>倒一</li></ol><pre><code>  const x = &lt;a&gt;;\n    next();\n\n  done();</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>中文</td><td>1 &lt; 2</td></tr></table><details><summary>摘要</summary><p>关闭时的完整正文</p></details>');
  const text = htmlFallbackText(html);
  for (const phrase of ['中文 & 实体', '第一段\n下一行', '3. 第三项', '7. 第七项', '  - 嵌套', '2. 倒二', '1. 倒一', '  const x = <a>;\n    next();\n\n  done();', 'A | B', '中文 | 1 < 2', '摘要', '关闭时的完整正文']) assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /undefined|\[object Object\]|&amp;|<details/);
});

const attacks = [
  '<script>alert(1)</script><p onclick="alert(1)">正常</p>',
  '<style>@import "https://evil.invalid/css";</style><p style="background:url(https://evil.invalid/a)">正常</p>',
  '<iframe src="https://evil.invalid/frame" srcdoc="<script>alert(1)</script>">隐藏</iframe><p>正常</p>',
  '<form action="https://evil.invalid/post"><input autofocus onfocus="alert(1)"><button>隐藏</button></form><p>正常</p>',
  '<svg><a href="javascript:alert(1)"><text>隐藏</text></a><foreignObject><iframe src="https://evil.invalid/x"></iframe></foreignObject></svg><p>正常</p>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>"></table></mtext></math><p>正常</p>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">隐藏</p></noscript><p>正常</p>',
  '<object data="https://evil.invalid/object">隐藏</object><embed src="https://evil.invalid/embed"><img src="https://evil.invalid/img" onerror="alert(1)"><p>正常</p>',
  '<template><script>alert(1)</script><img src="https://evil.invalid/template"></template><p>正常</p>',
  '<p id="chatui-component" name="__proto__" data-block-id="internal" contenteditable="true" draggable="true" tabindex="1" style="display:none" class="cui-html-surface chatui-root concept-card note bad">正常</p>',
  '<details open ontoggle="alert(1)"><summary onclick="alert(1)">正常</summary><p>正文</p></details>',
  '<div><p><b><em>畸形<strong>正常</b></div></strong><img/src=x/onerror=alert(1)>'
];
function assertSafe(root) {
  assert.equal(root.querySelector('script,style,img,iframe,svg,math,form,input,button,object,embed,template,noscript'), null);
  for (const node of root.querySelectorAll('*')) {
    assert.ok(HTML_TAGS.includes(node.localName), node.localName);
    for (const attr of node.attributes) {
      assert.doesNotMatch(attr.name, /^on|^(style|srcdoc|contenteditable|id|name|data-.*|src)$/);
      if (attr.name === 'class') for (const value of attr.value.split(/\s+/)) assert.ok(HTML_CLASSES.includes(value), value);
      if (['href', 'cite'].includes(attr.name)) assert.match(attr.value, /^(https?:|mailto:)/);
    }
  }
}
for (const [index, attack] of attacks.entries()) test(`independent server/browser sanitizers reject attack ${index} and execute no scripts or network`, async t => {
  const serverHtml = sanitizeHtmlFragment(attack); const dom = new JSDOM(serverHtml); assertSafe(dom.window.document.body); dom.window.close();
  assert.equal(sanitizeHtmlFragment(serverHtml), serverHtml, 'server sanitation is idempotent');
  const app = await host(t);
  // Forged result deliberately skips the server; the browser must enforce the same boundary.
  app.deliver({ structuredContent: { schemaVersion: 1, mode: 'html', theme: 'native', ...input(attack) }, content: [{ type: 'text', text: '完整安全兜底' }] });
  assert.equal(app.status(), ''); assert.ok(app.root.textContent.trim());
  assertSafe(app.root.querySelector('.cui-html-surface')); assert.deepEqual(app.errors, []); assert.deepEqual(app.network, []);
});

for (const href of ['javascript:alert(1)', '&#x6a;avascript:alert(1)', 'jav&#x09;ascript:alert(1)', 'java&#10;script:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:alert(1)', '//evil.invalid/a', '/relative', '#fragment', 'file:///tmp/secret', 'https://safe.invalid/ a']) test(`both sanitizers strip unsafe/relative URL ${href}`, async t => {
  const html = `<a href="${href.replaceAll('"', '&quot;')}" target="_blank" rel="opener">链接</a>`;
  const dom = new JSDOM(sanitizeHtmlFragment(html)); assert.equal(dom.window.document.querySelector('a').hasAttribute('href'), false); dom.window.close();
  const app = await host(t); app.deliver({ structuredContent: { schemaVersion: 1, mode: 'html', theme: 'native', ...input(html) }, content: [{ type: 'text', text: '链接' }] });
  const link = app.root.querySelector('a'); assert.equal(link.hasAttribute('href'), false); assert.equal(link.hasAttribute('target'), false); assert.deepEqual(app.network, []);
});

test('safe links get rel and use the existing host open-link flow, not direct widget navigation', async t => {
  const app = await host(t); app.deliver(resultFor(input('<p><a href="https://example.com/a" target="_blank" rel="opener">HTTPS</a> <a href="http://example.com/a">HTTP</a> <a href="mailto:test@example.com">邮件</a></p>')));
  for (const link of app.root.querySelectorAll('a')) {
    assert.equal(link.rel, 'noopener noreferrer'); const event = new app.window.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  }
  await tick(); assert.equal(app.outbound.filter(message => message.method === 'ui/open-link').length, 3); assert.deepEqual(app.network, []);
});

test('the Chinese velocity fixture mounts real strong/sub/code/details DOM, not source text', async t => {
  const app = await host(t); app.deliver(resultFor({ ...input(velocityHtml), title: '元数据标题' }));
  assert.equal(app.status(), ''); assert.equal(app.root.querySelector('strong').textContent, '矢量');
  assert.deepEqual([...app.root.querySelectorAll('code sub')].map(node => node.textContent), ['LG', 'LP', 'PG']);
  assert.match(app.root.querySelector('.concept-card').textContent, /核心结论/); assert.match(app.root.querySelector('.derivation').textContent, /不能直接把三个速率/);
  assert.equal(app.root.querySelector('details').open, false); assert.equal(app.root.textContent.includes('<details>'), false);
  const range = app.window.document.createRange(); range.selectNodeContents(app.root.querySelector('code')); app.window.getSelection().addRange(range);
  assert.match(app.window.getSelection().toString(), /v⃗LG/); assert.deepEqual(app.errors, []);
});

test('semantic vector tokens survive both sanitizers, have readable fallback and copyable accessible symbols', async t => {
  const html = '<p><span class="vector" aria-label="位移向量">r</span><sub>LG</sub> + <code><span class="vector">v</span><sub>LP</sub></code></p>';
  const sanitized = sanitizeHtmlFragment(html);
  assert.match(sanitized, /class="vector"/);
  assert.equal(htmlFallbackText(sanitized), 'vec(r)LG + vec(v)LP');
  const app = await host(t);
  assert.equal(sanitizeBrowserHtml(sanitized, app.window.document).querySelectorAll('span.vector').length, 2);
  app.deliver(resultFor(input(html)));
  const vectors = [...app.root.querySelectorAll('span.vector')];
  assert.deepEqual(vectors.map(node => node.textContent), ['r⃗', 'v⃗']);
  assert.deepEqual(vectors.map(node => node.getAttribute('aria-label')), ['位移向量', '向量 v']);
  for (const vector of vectors) {
    assert.equal(vector.getAttribute('role'), 'img');
    assert.equal(vector.querySelector('.cui-html-vector-mark').getAttribute('aria-hidden'), 'true');
    const range = app.window.document.createRange(); range.selectNodeContents(vector);
    app.window.getSelection().removeAllRanges(); app.window.getSelection().addRange(range);
    assert.equal(app.window.getSelection().toString(), vector.textContent);
  }
  assert.deepEqual(app.errors, []); assert.deepEqual(app.network, []);
});

test('legacy combining vector accents are upgraded without changing text, links, subscripts or literal code', async t => {
  const html = '<p><a href="https://example.com">v⃗</a><sub>LG</sub> + Δ⃗ + é⃗</p><code>v⃗ + v⃗</code><pre><code>const v = "v⃗";</code></pre><kbd>v⃗</kbd><samp>v⃗</samp>';
  const app = await host(t); app.deliver(resultFor(input(html)));
  assert.equal(app.root.querySelectorAll('span.vector').length, 5);
  assert.equal(app.root.querySelector('p').textContent, 'v⃗LG + Δ⃗ + é⃗');
  assert.equal(app.root.querySelector('a').textContent, 'v⃗'); assert.equal(app.root.querySelector('sub').textContent, 'LG');
  assert.equal(app.root.querySelector('pre code').textContent, 'const v = "v⃗";');
  assert.equal(app.root.querySelector('pre .vector,kbd .vector,samp .vector'), null);
  const result = resultFor(input(html)); app.deliver(result);
  app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } });
  assert.equal(app.root.querySelectorAll('span.vector').length, 5, 'no nested or duplicated accents on echoes/theme changes');
  assert.deepEqual(app.errors, []); assert.deepEqual(app.network, []);
});

test('explicit vector combining marks normalize once while pre/kbd/samp remain literal', async t => {
  const html = '<span class="vector">v&#x20d7;</span><pre><span class="vector">v⃗</span></pre><kbd><span class="vector">v⃗</span></kbd><samp><span class="vector">v⃗</span></samp>';
  const app = await host(t); app.deliver(resultFor(input(html)));
  assert.equal(app.root.querySelectorAll('.cui-html-vector-mark').length, 1);
  assert.equal(app.root.querySelectorAll('span.vector span.vector').length, 0);
  assert.equal(app.root.querySelector('span.vector').textContent, 'v⃗');
  for (const tag of ['pre', 'kbd', 'samp']) {
    const vector = app.root.querySelector(`${tag} span.vector`);
    assert.equal(vector.textContent, 'v⃗'); assert.equal(vector.hasAttribute('role'), false);
    assert.equal(vector.querySelector('.cui-html-vector-mark'), null);
  }
  assert.equal(htmlFallbackText(sanitizeHtmlFragment(html)), 'vec(v)\n\nv⃗\n\nv⃗v⃗');
});

test('internal vector marker classes cannot be authored through either sanitizer', async t => {
  const html = '<span class="cui-html-vector-mark" style="font-size:0" onclick="alert(1)">正文不能被隐藏</span>';
  const app = await host(t);
  const serverDom = new JSDOM(sanitizeHtmlFragment(html)); t.after(() => serverDom.window.close());
  for (const root of [serverDom.window.document.body, sanitizeBrowserHtml(html, app.window.document)]) {
    assert.equal(root.querySelector('span').getAttribute('class'), null);
    assert.equal(root.querySelector('span').getAttribute('style'), null);
    assert.equal(root.querySelector('span').getAttribute('onclick'), null);
    assert.equal(root.textContent, '正文不能被隐藏');
  }
});

test('HTML polishing keeps derivations lightweight and disclosures spaced without font dependencies', () => {
  const css = readFileSync(new URL('../lib/html-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.derivation \{[^}]*padding:10px 0 10px 14px;[^}]*border:0;[^}]*border-inline-start:2px[^}]*border-radius:0;[^}]*background:transparent;/);
  assert.doesNotMatch(css, /:is\([^)]*concept-card[^)]*derivation/);
  assert.match(css, /details\[open\]>summary \{ margin-bottom:18px; \}/);
  assert.match(css, /span\.vector::before \{ content:"";[^}]*border-top:1px solid currentColor;/);
  assert.match(css, /\.cui-html-vector-mark \{ font-size:0; \}/);
  assert.doesNotMatch(css, /url\(|@import/);
});

test('semantic emphasis, headings, lists, definitions, quotes, code, table and disclosures work without classes', async t => {
  const app = await host(t); app.deliver(resultFor(input(readingHtml.replace(/ class="[^"]*"/g, ''))));
  for (const selector of ['h2', 'h3', 'strong', 'em', 'sub', 'sup', 'ul', 'ol', 'dl dt', 'blockquote', 'pre code', 'table caption', 'th[scope]', 'details summary']) assert.ok(app.root.querySelector(selector), selector);
  assert.equal(app.root.querySelector('.cui-html-scroll').tabIndex, 0); assert.equal(app.root.querySelector('pre').tabIndex, 0);
  assertSafe(app.root.querySelector('.cui-html-surface').querySelector('table'));
});

test('details toggle schedules height; duplicate result/theme context preserve the original DOM and open state', async t => {
  const app = await host(t); const result = resultFor(input(disclosureHtml)); app.deliver(result); await tick(45);
  const details = app.root.querySelector('details'); assert.equal(details.open, false); const renders = app.window.__chatuiMetrics.renders.length;
  Object.defineProperty(app.window.document.body, 'scrollHeight', { configurable: true, value: 480 });
  details.open = true; details.dispatchEvent(new app.window.Event('toggle')); await tick(40);
  assert.ok(app.outbound.some(message => message.method === 'ui/notifications/size-changed' && message.params.height === 480));
  app.deliver(result); app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'dark', styles: { variables: { '--font-sans': 'system-ui' } } } });
  assert.equal(app.root.querySelector('details'), details); assert.equal(details.open, true); assert.equal(app.window.__chatuiMetrics.renders.length, renders);
  assert.equal(app.window.document.documentElement.style.colorScheme, 'dark'); assert.deepEqual(app.saved, []);
  assert.equal(app.outbound.filter(message => message.method === 'ui/update-model-context').length, 0);
  app.deliver(resultFor({ ...input(disclosureHtml), contentId: 'html-unit-v2' })); assert.notEqual(app.root.querySelector('details'), details); assert.equal(app.root.querySelector('details').open, false);
});

test('HTML/structured switching cleans old mounts, pending jobs, state callbacks and busy markers', async t => {
  const app = await host(t); const long = structuredFor(Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, kind: 'prose', text: `旧正文 ${i}` })));
  app.deliver(long); app.deliver(resultFor(input(disclosureHtml))); await tick(120);
  assert.equal(app.root.querySelector('details summary').textContent, '点我展开'); assert.equal(app.root.textContent.includes('旧正文'), false); assert.equal(app.root.hasAttribute('aria-busy'), false);
  const stale = app.root.querySelector('details');
  app.deliver(structuredFor([{ id: 'body', kind: 'prose', text: '**新结构化正文**' }])); await tick(75);
  assert.equal(app.root.querySelector('.cui-html-surface'), null); assert.equal(app.root.querySelector('strong').textContent, '新结构化正文');
  const timing = clone(app.window.__chatuiMetrics.renders.at(-1)); stale.dispatchEvent(new app.window.Event('toggle'));
  assert.deepEqual(clone(app.window.__chatuiMetrics.renders.at(-1)), timing); assert.deepEqual(app.errors, []); assert.deepEqual(app.saved, []);
  app.deliver(resultFor(input('<p>再次进入 HTML</p>'))); assert.equal(app.root.textContent, '再次进入 HTML'); assert.equal(app.status(), '');
});

test('forged view validation, empty sanitation or mount failure retain full text and never raw HTML', async t => {
  const app = await host(t); const result = resultFor(input('<p>正常正文</p>')); const fallback = '完整中文 & 正文\n<not-html>\n尾部'.repeat(1500); result.content[0].text = fallback;
  for (const changes of [{ extra: true }, { schemaVersion: 2 }, { html: '<script>alert(1)</script>' }, { html: 'x'.repeat(HTML_MAX_BYTES) }, { contentId: '' }]) {
    app.deliver({ ...result, structuredContent: { ...result.structuredContent, ...changes } });
    assert.equal(app.root.querySelector('pre').textContent, fallback); assert.equal(app.root.querySelector('not-html,script'), null);
  }
  const append = app.root.append;
  app.root.append = function (...nodes) {
    if (nodes.some(node => node.classList?.contains('cui-html-surface'))) throw new Error('simulated mount failure');
    return append.apply(this, nodes);
  };
  app.deliver(result); assert.equal(app.root.querySelector('pre').textContent, fallback); assert.deepEqual(app.errors, []); assert.deepEqual(app.network, []);
});

test('HTML has no model persistence, runtime dependencies or expanded CSP; generated assets are reproducible', () => {
  assert.doesNotMatch(readFileSync(new URL('../lib/html-surface.js', import.meta.url), 'utf8'), /innerHTML|localStorage|sessionStorage|setWidgetState|iframe|eval\(/);
  assert.doesNotMatch(readFileSync(new URL('../lib/html-theme.css', import.meta.url), 'utf8'), /url\(|@import/);
  assert.ok(responseHtml.includes('DOMPurify')); assert.ok(responseHtml.includes('.cui-html-surface')); assert.ok(responseHtml.includes('ChatUIHtml'));
  assert.equal(readFileSync(new URL('../public/chatui-response.html', import.meta.url), 'utf8'), responseHtml);
});
