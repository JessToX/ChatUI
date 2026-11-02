import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const fixture = (contentId = 'navigation-current') => {
  const result = normalizeDocument({ contentId, source: Array.from({ length: 8 }, (_, i) => `## Chapter ${i + 1}\n\nParagraph ${i + 1}.`).join('\n\n') });
  return { structuredContent: result.view, content: [{ type: 'text', text: result.text }] };
};
async function host(t, supported = true, paused = false) {
  const observers = [], scrolls = [], dom = new JSDOM(documentHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://local-navigation.invalid', virtualConsole: new VirtualConsole() });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  const frames = [];
  if (paused) window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  window.HTMLElement.prototype.scrollIntoView = function(options) { scrolls.push({ node: this, options }); };
  if (supported) window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) { if (message.method === 'ui/initialize') queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: { hostCapabilities: {}, hostContext: { theme: 'light' } } })); } };
  Object.defineProperty(window, 'parent', { value: parent });
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick();
  const root = window.document.querySelector('#chatui-component');
  t.after(() => { send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); window.close(); });
  return { root, window, observers, scrolls, resumeFrames() { frames.splice(0).forEach(callback => callback(0)); }, teardown() { send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); }, async deliver(result, complete = true) {
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
    for (let n = 0; complete && n < 100 && root.getAttribute('aria-busy') === 'true'; n++) await tick();
    await tick();
  }, intersect(ratio, width = 300, height = 30) {
    const observer = observers.at(-1);
    observer.callback([{ target: observer.target, isIntersecting: ratio > 0, intersectionRatio: ratio, boundingClientRect: { width, height }, rootBounds: null }]);
  } };
}
test('initial disclosure toggle cannot expose outline actions during a partial async mount', async t => {
  const app = await host(t, true, true);
  const source = Array.from({ length: 8 }, (_, i) => `## Chapter ${i + 1}\n\nParagraph.`).join('\n\n')
    + '\n\n:::collapse {"summary":"Initially open","open":true}\nSupport.\n:::'
    + Array.from({ length: 6 }, (_, i) => '\n\n:::profile ' + JSON.stringify({ name: 'Profile ' + i }) + '\n:::').join('');
  const result = normalizeDocument({ contentId: 'partial-mount', source });
  await app.deliver({ structuredContent: result.view, content: [{ type: 'text', text: result.text }] }, false);
  assert.equal(app.root.getAttribute('aria-busy'), 'true');
  app.root.querySelector('.cui-collapse').dispatchEvent(new app.window.Event('toggle'));
  assert.equal(app.root.querySelector('.cui-document-outline').hidden, true);
  for (let i = 0; i < 10 && app.root.getAttribute('aria-busy') === 'true'; i++) { app.resumeFrames(); await tick(); }
  assert.equal(app.root.getAttribute('aria-busy'), 'false');
  assert.equal(app.root.querySelector('.cui-document-outline').hidden, false);
  assert.equal(app.root.querySelectorAll('.cui-document-chapter').length, 8);
});
test('no IntersectionObserver keeps an accessible static outline without attempting navigation', async t => {
  const app = await host(t, false); await app.deliver(fixture());
  assert.equal(app.root.querySelectorAll('.cui-document-chapter').length, 0);
  assert.equal(app.root.querySelectorAll('.cui-document-outline li').length, 8);
  assert.match(app.root.querySelector('.cui-document-outline-note').textContent, /静态概览/);
  assert.equal(app.scrolls.length, 0);
});
test('native navigation requires full observed intersection before heading focus or success', async t => {
  const app = await host(t); await app.deliver(fixture());
  app.root.querySelectorAll('.cui-document-chapter')[7].click();
  const heading = app.observers.at(-1).target;
  assert.equal(app.scrolls[0].options.block, 'center');
  app.intersect(.9); await tick();
  assert.notEqual(app.window.document.activeElement, heading);
  assert.doesNotMatch(app.root.querySelector('.cui-document-navigation-status').textContent, /已定位/);
  app.intersect(1); await tick();
  assert.equal(app.window.document.activeElement, heading);
  assert.equal(app.root.querySelector('.cui-document-navigation-status').textContent, '已定位：Chapter 8');
  assert.equal(app.observers.at(-1).disconnected, true);
});
test('zero-size target and missing visibility confirmation time out honestly to static outline', async t => {
  const app = await host(t); await app.deliver(fixture());
  app.root.querySelectorAll('.cui-document-chapter')[7].click(); app.intersect(1, 0, 30);
  await new Promise(resolve => setTimeout(resolve, 1550));
  assert.equal(app.root.querySelectorAll('.cui-document-chapter').length, 0);
  assert.match(app.root.querySelector('.cui-document-navigation-status').textContent, /未确认/);
  assert.notEqual(app.window.document.activeElement, app.observers.at(-1).target);
  assert.equal(app.root.querySelector('.cui-document-copy').textContent, '复制完整文档');
});
for (const action of ['new snapshot', 'teardown']) test('pending navigation is cancelled on ' + action, async t => {
  const app = await host(t); await app.deliver(fixture()); app.root.querySelectorAll('.cui-document-chapter')[7].click();
  const old = app.observers.at(-1);
  if (action === 'teardown') app.teardown(); else await app.deliver(fixture('navigation-next'));
  assert.equal(old.disconnected, true);
  old.callback([{ target: old.target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: { width: 300, height: 30 } }]); await tick();
  assert.notEqual(app.window.document.activeElement, old.target);
  assert.ok(!app.root.textContent.includes('已定位：'));
});
