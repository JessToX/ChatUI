import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { normalizeResponse, responseText as legacyResponseText } from '../lib/response-normalization.mjs';
import { responseText } from '../lib/response-text.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { projectQuizResult } from '../lib/quiz-boundary.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const input = (source, contentId = 'document-reading') => ({ source, contentId });
const directive = (type, data, body = '') => `:::${type} ${JSON.stringify(data)}\n${body}\n:::`;
const quiz = { questions: [{ id: 'check', prompt: 'Which observation follows?', options: [{ id: 'a', label: 'Visible option one' }, { id: 'b', label: 'Visible option two' }], correct: 'b', explanation: 'PRIVATE_GRADING_EXPLANATION' }] };
const documentFixture = () => normalizeDocument(input([
  '# Synthetic report\n\n## First section\n\nFIRST_MARKER\n\n### Evidence\n\nEvidence E01.\n\n## Same heading\n\nCurrent claims.\n\n## Same heading\n\nLAST_VISIBLE_MARKER\n\n## Final section',
  directive('collapse', { summary: 'Closed supporting evidence' }, '## Closed heading\n\nCLOSED_EVIDENCE_MARKER'),
  directive('tabs', { items: [{ label: 'Method A', body: '### Active tab heading\n\nACTIVE_TAB_MARKER' }, { label: 'Method B', body: '### Hidden tab heading\n\nHIDDEN_TAB_MARKER' }] }),
  '| Evidence | Limit |\n| --- | --- |\n| E02 | Synthetic only |\n\n```js\nconst evidence = "CODE_MARKER";\n```\n\nFormula $x^2$. Failed formula $\\frac{x}{$.',
  directive('quiz', quiz),
  'END_MARKER'
].join('\n\n')));

async function host(t, { clipboard, html = documentHtml, setup } = {}) {
  const errors = [], outbound = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid/', virtualConsole });
  const { window } = dom; window.TextEncoder = TextEncoder;
  setup?.(window);
  if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: clipboard } });
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) {
    outbound.push(message);
    if (message.id) queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: message.method === 'ui/initialize' ? { hostCapabilities: {}, hostContext: { theme: 'light' } } : {} }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick();
  const root = window.document.querySelector('#chatui-component');
  const teardown = () => send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' });
  t.after(() => { teardown(); window.close(); });
  return { root, window, errors, outbound, teardown, restore(state) { window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: state } } })); }, async deliver(normalized, content = normalized.text) {
    const result = { structuredContent: normalized.view, content: [{ type: 'text', text: normalized.text }] };
    const envelope = normalized.view.sourceHash && !/^[a-f0-9]{16}$/.test(normalized.view.sourceHash) ? result : projectQuizResult(result);
    // Deliberate forged host content tests client copy isolation. The server
    // boundary rejects this separately; copying derives from the public View.
    envelope.content = [{ type: 'text', text: content }];
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: envelope });
    for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await tick();
  } };
}

test('document outline lists verified visible H2/H3 only, has unique generated IDs and offers no fake navigation', async t => {
  const app = await host(t); await app.deliver(documentFixture());
  const outline = app.root.querySelector('.cui-document-outline');
  assert.equal(outline.hidden, false);
  assert.equal(outline.tagName, 'DETAILS'); assert.equal(outline.open, false);
  assert.equal(outline.querySelector('summary').textContent, '章节概览 · 6 节');
  const labels = () => [...outline.querySelectorAll('li')].map(node => node.textContent);
  assert.deepEqual(labels(), ['First section', 'Evidence', 'Same heading', 'Same heading', 'Final section', 'Active tab heading']);
  assert.equal(outline.querySelector('a, button, [tabindex]'), null);
  const headings = [...app.root.querySelectorAll('.cui-document h2, .cui-document h3')];
  assert.equal(new Set(headings.map(node => node.id)).size, headings.length);
  assert.ok(headings.every(node => /^chatui-component-document-heading-d_[a-f0-9]+_\d+_?[-\w]*-\d+$/.test(node.id)));
  const details = app.root.querySelector('.cui-collapse'); details.open = true; details.dispatchEvent(new app.window.Event('toggle'));
  assert.ok(labels().includes('Closed heading'));
  app.root.querySelectorAll('[role=tab]')[1].click();
  assert.ok(labels().includes('Hidden tab heading')); assert.ok(!labels().includes('Active tab heading'));
  assert.ok(!app.outbound.some(message => /scroll|navigate|open-link/.test(message.method || '')));
  assert.deepEqual(app.errors, []);
});

for (const count of [4, 5, 6, 8]) test(`outline ${count} visible chapter boundary is count-driven and defaults to native collapsed details`, async t => {
  const app = await host(t);
  await app.deliver(normalizeDocument(input(Array.from({ length: count }, (_, i) => `## ${i + 1}. Chapter ${i + 1}\n\nParagraph.`).join('\n\n'))));
  const outline = app.root.querySelector('details.cui-document-outline');
  assert.equal(outline.hidden, count < 6); assert.equal(outline.open, false);
  assert.equal(outline.querySelector('summary').textContent, `章节概览 · ${count} 节`);
  assert.equal(outline.querySelectorAll('li').length, count < 6 ? 0 : count);
  assert.equal(outline.querySelector('ol,a,[tabindex]'), null);
  outline.open = true; assert.equal(outline.open, true); outline.open = false; assert.equal(outline.open, false);
});

test('outline excludes closed or inactive headings and literal author anchors stay inert', async t => {
  const app = await host(t);
  await app.deliver(normalizeDocument(input('## One\n\n## Two\n\n## Three\n\n## Four\n\n## Five\n\n<h2 id="author-anchor">Fake title</h2>\n\n' + directive('collapse', { summary: 'Hidden' }, '## Six'))));
  assert.equal(app.root.querySelector('.cui-document-outline').hidden, true);
  assert.equal(app.root.querySelector('#author-anchor'), null);
  const details = app.root.querySelector('.cui-collapse'); details.open = true; details.dispatchEvent(new app.window.Event('toggle'));
  assert.equal(app.root.querySelector('.cui-document-outline').hidden, false);
  assert.equal(app.root.querySelectorAll('.cui-document-outline li').length, 6);
  app.root.querySelector('.cui-document-outline').open = true;
  details.open = false; details.dispatchEvent(new app.window.Event('toggle'));
  assert.equal(app.root.querySelector('.cui-document-outline').hidden, true);
  assert.equal(app.root.querySelector('.cui-document-outline').open, false);
});

test('clipboard receives the exact same-source complete safe fallback, independent of tool content and disclosure state', async t => {
  const copied = [], normalized = documentFixture();
  const app = await host(t, { clipboard: async text => copied.push(text) });
  await app.deliver(normalized, 'FORGED_TOOL_CONTENT PRIVATE_GRADING_EXPLANATION');
  assert.equal(legacyResponseText, responseText, 'The server keeps its original exported serializer API.');
  assert.equal(responseText(normalized.view), normalized.text);
  const button = app.root.querySelector('.cui-document-copy'); button.click(); await tick();
  assert.deepEqual(copied, [normalized.text]);
  for (const marker of ['FIRST_MARKER', 'CLOSED_EVIDENCE_MARKER', 'ACTIVE_TAB_MARKER', 'HIDDEN_TAB_MARKER', 'E02 | Synthetic only', 'CODE_MARKER', '\\(x^2\\)', '\\frac{x}{', 'END_MARKER', quiz.questions[0].prompt]) assert.ok(copied[0].includes(marker), marker);
  assert.doesNotMatch(copied[0], /PRIVATE_GRADING_EXPLANATION|FORGED_TOOL_CONTENT|"correct"|"explanation"/);
  assert.doesNotMatch(copied[0], /章节概览|按正文顺序列出|横向滚动查看完整/);
  assert.equal(copied[0].split('FIRST_MARKER').length - 1, 1);
  assert.equal(app.root.querySelector('.cui-collapse').open, false);
  assert.equal(app.root.querySelector('.cui-document-copy-status').textContent, '已复制完整文档。');
  assert.equal(button.disabled, false);
  assert.equal(app.root.querySelector('.cui-document-copy-fallback').hidden, true);
});

test('quiz answers and explanations stay out of full copy even after submission and reset', async t => {
  const copied = [], normalized = documentFixture();
  const app = await host(t, { clipboard: async text => copied.push(text) }); await app.deliver(normalized);
  const button = label => [...app.root.querySelectorAll('button')].find(node => node.textContent === label);
  app.root.querySelector('input[value="b"]').click(); button('提交答案').click();
  assert.match(app.root.textContent, /PRIVATE_GRADING_EXPLANATION/);
  button('复制完整文档').click(); await tick();
  button('重新测试').click(); button('复制完整文档').click(); await tick();
  assert.deepEqual(copied, [normalized.text, normalized.text]);
  assert.ok(copied.every(text => !text.includes('PRIVATE_GRADING_EXPLANATION')));
});

for (const rejected of [false, true]) test(`clipboard ${rejected ? 'rejection' : 'unavailability'} opens focused selected readonly full text with keyboard close`, async t => {
  const normalized = documentFixture();
  const app = await host(t, rejected ? { clipboard: () => Promise.reject(new Error('Permission denied')) } : {}); await app.deliver(normalized);
  const button = app.root.querySelector('.cui-document-copy'); button.click(); await tick();
  const field = app.root.querySelector('.cui-document-copy-text'), fallback = app.root.querySelector('.cui-document-copy-fallback');
  assert.equal(fallback.hidden, false); assert.equal(field.readOnly, true); assert.equal(field.value, normalized.text);
  assert.equal(app.window.document.activeElement, field); assert.equal(field.selectionStart, 0); assert.equal(field.selectionEnd, normalized.text.length);
  const status = app.root.querySelector('.cui-document-copy-status'); assert.match(status.textContent, /自动复制未完成/); assert.doesNotMatch(status.textContent, /已复制/);
  assert.ok(app.root.querySelector(`label[for="${field.id}"]`));
  field.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(fallback.hidden, true); assert.equal(field.value, ''); assert.equal(app.window.document.activeElement, button);
  button.click(); await tick(); app.root.querySelector('.cui-document-copy-close').click();
  assert.equal(fallback.hidden, true); assert.equal(app.window.document.activeElement, button);
});

test('copy announces success only after the actual clipboard operation resolves', async t => {
  let resolveCopy;
  const app = await host(t, { clipboard: () => new Promise(resolve => { resolveCopy = resolve; }) }); await app.deliver(documentFixture());
  const button = app.root.querySelector('.cui-document-copy'); button.click();
  assert.equal(button.disabled, true); assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(app.root.querySelector('.cui-document-copy-status').textContent, '');
  resolveCopy(); await tick();
  assert.equal(app.root.querySelector('.cui-document-copy-status').textContent, '已复制完整文档。');
});

test('outline disclosure is local to the current snapshot and restoration does not transfer it to another document', async t => {
  let saved;
  const app = await host(t, { setup(window) { window.openai = { setWidgetState(state) { saved = state; } }; } });
  await app.deliver(documentFixture());
  app.root.querySelector('.cui-document-outline').open = true;
  const collapse = app.root.querySelector('.cui-collapse'); collapse.open = true; collapse.dispatchEvent(new app.window.Event('toggle'));
  assert.ok(saved);
  const next = normalizeDocument(input(Array.from({ length: 8 }, (_, i) => `## New chapter ${i + 1}`).join('\n\n')));
  await app.deliver(next);
  let outline = app.root.querySelector('.cui-document-outline');
  assert.equal(outline.open, false); assert.equal(outline.querySelectorAll('li').length, 8);
  app.restore(saved); await tick();
  assert.equal(outline.open, false); assert.equal(outline.querySelectorAll('li').length, 8);
  assert.doesNotMatch(outline.textContent, /Closed heading|First section/);
  outline.open = true;
  await app.deliver(normalizeDocument(input('## A\n\n## B\n\n## C\n\n## D\n\n## E\n\n## F', 'new-document-identity')));
  outline = app.root.querySelector('.cui-document-outline');
  assert.equal(outline.open, false); assert.equal(outline.querySelectorAll('li').length, 6);
});

const wideSource = [
  '$$a+b+c+d+e+f+g+h+i+j+k+l$$',
  '| Evidence | Boundary |\n| --- | --- |\n| Synthetic only | Repeated observations require review |',
  '```js\nconst observation = "Synthetic local evidence with an intentionally long record";\n```'
].join('\n\n');
const resizeProbe = () => {
  const observers = [];
  return { observers, setup(window) { window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  }; }, notify() { observers.forEach(observer => observer.callback([])); } };
};
const measure = (node, client = 200, scroll = 200) => {
  const size = { client, scroll, reads: 0 };
  Object.defineProperties(node, {
    clientWidth: { configurable: true, get() { size.reads++; return size.client; } },
    scrollWidth: { configurable: true, get() { size.reads++; return size.scroll; } }
  });
  return size;
};

test('only measured overflowing formula, table and code gain a hint, region semantics and a Tab stop', async t => {
  const probe = resizeProbe(); const app = await host(t, { setup: probe.setup }); await app.deliver(normalizeDocument(input(wideSource)));
  const regions = [...app.root.querySelectorAll('.cui-document-scroll-block')].map(wrapper => wrapper.firstElementChild);
  assert.equal(regions.length, 3);
  const sizes = regions.map(node => measure(node)); probe.notify(); await tick();
  for (const node of regions) {
    assert.equal(node.hasAttribute('tabindex'), false); assert.equal(node.hasAttribute('role'), false);
    assert.equal(node.nextElementSibling.hidden, true);
  }
  sizes.forEach(size => { size.scroll = 501; }); probe.notify(); await tick();
  for (const node of regions) {
    const hint = node.nextElementSibling;
    assert.equal(node.tabIndex, 0); assert.equal(node.getAttribute('role'), 'region'); assert.equal(hint.hidden, false);
    assert.equal(node.getAttribute('aria-describedby'), hint.id); assert.match(hint.textContent, /横向滚动查看完整/);
    assert.ok(node.classList.contains('cui-document-overflow'));
    const keyboard = new app.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    node.dispatchEvent(keyboard); assert.equal(keyboard.defaultPrevented, false, 'Native keyboard scrolling is not intercepted.');
  }
  sizes.forEach(size => { size.scroll = size.client + 1; }); app.window.dispatchEvent(new app.window.Event('resize')); await tick();
  for (const node of regions) {
    assert.equal(node.hasAttribute('tabindex'), false); assert.equal(node.hasAttribute('role'), false);
    assert.equal(node.hasAttribute('aria-label'), false); assert.equal(node.hasAttribute('aria-describedby'), false);
    assert.equal(node.nextElementSibling.hidden, true);
  }
  assert.deepEqual(app.errors, []);
});

test('hidden and zero-width content never advertises scrolling, and disclosure, theme and content changes remeasure it', async t => {
  const probe = resizeProbe(), app = await host(t, { setup: probe.setup });
  await app.deliver(normalizeDocument(input(directive('collapse', { summary: 'Wide supporting evidence' }, wideSource))));
  const regions = [...app.root.querySelectorAll('.cui-document-scroll-block')].map(wrapper => wrapper.firstElementChild);
  const sizes = regions.map(node => measure(node, 200, 500));
  probe.notify(); await tick(); assert.ok(regions.every(node => !node.hasAttribute('tabindex')));
  const details = app.root.querySelector('.cui-collapse'); details.open = true; details.dispatchEvent(new app.window.Event('toggle')); await tick();
  assert.ok(regions.every(node => node.tabIndex === 0));
  sizes.forEach(size => { size.client = 0; }); probe.notify(); await tick(); assert.ok(regions.every(node => !node.hasAttribute('tabindex')));
  sizes.forEach(size => { size.client = 200; });
  app.window.document.documentElement.style.colorScheme = 'dark'; await tick(); await tick();
  assert.ok(regions.every(node => node.tabIndex === 0));
  const observer = probe.observers.find(value => value.targets.has(regions[0])); assert.ok(observer);
  await app.deliver(normalizeDocument(input('## Replacement\n\nA short paragraph.'))); await tick();
  assert.ok(regions.every(node => !observer.targets.has(node))); assert.equal(app.root.querySelector('.cui-document-scroll-hint'), null);
});

test('scroll measurement observers and scheduled callbacks cannot mutate or leak after teardown', async t => {
  const probe = resizeProbe(), app = await host(t, { setup: probe.setup }); await app.deliver(normalizeDocument(input(wideSource)));
  const node = app.root.querySelector('.cui-document-scroll-block').firstElementChild;
  const size = measure(node, 200, 500); probe.notify(); await tick();
  assert.equal(node.tabIndex, 0);
  probe.notify(); app.teardown(); size.client = 600; const reads = size.reads;
  probe.notify(); app.window.dispatchEvent(new app.window.Event('resize'));
  app.window.document.documentElement.style.colorScheme = 'dark'; await tick(); await tick();
  assert.ok(probe.observers.every(observer => observer.disconnected));
  assert.equal(size.reads, reads); assert.equal(node.tabIndex, 0, 'Detached UI remains untouched by stale work.');
});

for (const rejectOld of [false, true]) test(`late clipboard ${rejectOld ? 'rejection' : 'success'} cannot affect a new keyed document snapshot or its copy`, async t => {
  let finishOld;
  const copied = [];
  const app = await host(t, { clipboard: text => {
    copied.push(text);
    return copied.length === 1 ? new Promise((resolve, reject) => { finishOld = () => rejectOld ? reject(new Error('late')) : resolve(); }) : Promise.resolve();
  } });
  await app.deliver(documentFixture()); app.root.querySelector('.cui-document-copy').click();
  const latest = normalizeDocument(input('## Revised snapshot\n\nNEW_CONTENT_MARKER'));
  await app.deliver(latest);
  assert.equal(app.root.querySelector('.cui-document-copy').disabled, false);
  finishOld(); await tick();
  assert.equal(app.root.querySelector('.cui-document-copy-status').textContent, '');
  assert.equal(app.root.querySelector('.cui-document-copy-fallback').hidden, true);
  app.root.querySelector('.cui-document-copy').click(); await tick();
  assert.equal(copied[1], latest.text); assert.doesNotMatch(copied[1], /CLOSED_EVIDENCE_MARKER/);
  assert.equal(app.root.querySelectorAll('.cui-document-tools').length, 1);
});

test('late clipboard rejection after teardown cannot expose fallback or steal focus', async t => {
  let rejectCopy;
  const app = await host(t, { clipboard: () => new Promise((resolve, reject) => { rejectCopy = reject; }) }); await app.deliver(documentFixture());
  app.root.querySelector('.cui-document-copy').click(); app.teardown();
  const sentinel = app.window.document.createElement('button'); app.window.document.body.append(sentinel); sentinel.focus();
  rejectCopy(new Error('late')); await tick();
  assert.equal(app.root.querySelector('.cui-document-copy-status').textContent, '');
  assert.equal(app.root.querySelector('.cui-document-copy-fallback').hidden, true);
  assert.equal(app.window.document.activeElement, sentinel);
});

test('rejected snapshots remove document copy controls and legacy response resources gain no document toolbar', async t => {
  const app = await host(t); const normalized = documentFixture(); await app.deliver(normalized);
  await app.deliver({ view: { ...normalized.view, sourceHash: 'invalid' }, text: 'Safe compiler fallback' });
  assert.equal(app.root.querySelector('.cui-document-copy'), null);
  assert.equal(app.root.querySelector('.cui-render-fallback').textContent, 'Safe compiler fallback');
  const legacy = await host(t, { html: responseHtml });
  await legacy.deliver(normalizeResponse({ schemaVersion: 1, contentId: 'legacy', facts: {}, blocks: [{ id: 'prose', kind: 'prose', text: '## One\n\n## Two\n\n## Three\n\n## Four' }] }));
  assert.equal(legacy.root.querySelectorAll('h2').length, 4);
  assert.equal(legacy.root.querySelector('.cui-document-tools'), null);
});

test('document geometry underflow rejection retains the concrete radius reason and safe text while removing stale controls', async t => {
  const normalized = normalizeDocument(input('Geometry safety.\n\n' + directive('geometry', { radius: 2, heightRatio: 0.05, unit: 'cm' })));
  const app = await host(t); await app.deliver(normalized);
  assert.ok(app.root.querySelector('input[type=range]'));
  const rejected = JSON.parse(JSON.stringify(normalized));
  rejected.view.blocks.find(block => block.type === 'geometry').data.radius = 2e-162;
  rejected.text = '<script>window.fallbackExecuted = true</script>\n完整安全回退原文';
  await app.deliver(rejected);
  const status = app.window.document.querySelector('#chatui-status');
  assert.match(status.textContent, /文档校验或显示失败：圆半径必须为可计算的正数/);
  assert.equal(status.children.length, 0);
  assert.doesNotMatch(status.textContent, /at validate|Error:|\.mjs:/);
  assert.equal(app.root.querySelector('input, button, script'), null);
  assert.equal(app.root.querySelector('.cui-render-fallback').textContent, rejected.text);
  assert.equal(app.window.fallbackExecuted, undefined);
  assert.equal(app.root.hasAttribute('aria-busy'), false);
  // A later representable snapshot still mounts: rejection does not wedge UI.
  await app.deliver(normalized);
  assert.ok(app.root.querySelector('input[type=range]')); assert.equal(status.textContent, '');
  assert.deepEqual(app.errors, []);

  const legacy = await host(t, { html: responseHtml });
  const legacyView = normalizeResponse({ schemaVersion: 1, contentId: 'legacy-geometry', facts: {}, blocks: [{ id: 'geometry', kind: 'component', type: 'geometry', data: { radius: 2, heightRatio: 0.05 } }] });
  legacyView.view.blocks[0].data.radius = 2e-162; await legacy.deliver(legacyView);
  assert.equal(legacy.window.document.querySelector('#chatui-status').textContent, '视图未能完成显示，以下保留同源可读文本。');
});
