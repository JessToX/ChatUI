import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { safeJson } from '../scripts/generate-gallery.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { g01 } from '../examples/intellectual.mjs';
import { createGalleryScenarios } from '../examples/gallery.mjs';

const code = await readFile(new URL('../gallery/host.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../gallery/index.html', import.meta.url), 'utf8');
const fixture = normalizeDocument(g01());
const scenes = ['G01', 'G04'].map(id => ({ id, title: id, mode: 'document', goal: 'Goal', instructions: 'Instructions', expected: 'Expected', limitations: 'Limited', ...fixture }));
async function offlineFrame(t, normalized = fixture) {
  const html = await readFile(new URL('../public/gallery/renderer.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html.replace('<html ', '<html data-gallery-nonce="test-nonce" '), { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const { window } = dom; window.TextEncoder = TextEncoder;
  window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {};
  const messages = [];
  const parent = { postMessage(message) {
    messages.push(message);
    if (message.op === 'hello') queueMicrotask(() => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: { channel: 'chatui-offline-v1', nonce: 'test-nonce', op: 'init', view: normalized.view, text: normalized.text, theme: 'light' } })));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  for (const script of window.document.scripts) window.eval(script.textContent);
  for (let retry = 0; retry < 20 && !messages.some(message => message.op === 'ready'); retry++) await new Promise(resolve => setTimeout(resolve, 10));
  return { window, messages };
}
test('Gallery completes mounting while an offscreen opaque frame has suspended animation frames', async t => {
  const { window, messages } = await offlineFrame(t);
  assert.equal(window.document.querySelector('#chatui-component').getAttribute('aria-busy'), 'false');
  assert.equal(messages.filter(message => message.op === 'ready').length, 1);
  assert.ok(window.document.querySelector('#chatui-component').textContent.includes('当前图形与最优图形不同'));
});
test('G03 reading-note disclosure meets the 44px Document touch target', async t => {
  const normalized = normalizeDocument(createGalleryScenarios().find(scene => scene.id === 'G03').input);
  const { window } = await offlineFrame(t, normalized);
  const summary = window.document.querySelector('.cui-data > summary');
  assert.equal(summary.textContent, '读图说明');
  assert.ok(parseFloat(window.getComputedStyle(summary).minHeight) >= 44);
});
function app(t, clipboard) {
  const data = { renderer: '<html data-renderer="document"><body></body></html>', scenarios: scenes };
  const dom = new JSDOM(template.replace('__GALLERY_STYLE__', '').replace('__GALLERY_DATA__', () => safeJson(data)), { runScripts: 'outside-only', url: 'https://local.invalid/' });
  t.after(() => dom.window.close());
  if (clipboard) Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: clipboard } });
  dom.window.eval(code);
  function message(op, extra = {}, options = {}) {
    const frame = dom.window.document.querySelector('#gallery-frame');
    const nonce = /data-gallery-nonce="([a-f0-9]+)"/.exec(frame.srcdoc)[1];
    const payload = JSON.parse(JSON.stringify({ channel: 'chatui-offline-v1', nonce, op, ...extra }));
    // postMessage structured clone uses the destination realm's ordinary Object prototype.
    const clone = dom.window.JSON.parse(JSON.stringify(payload));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: options.source || frame.contentWindow, data: clone }));
    return frame;
  }
  return { window: dom.window, message };
}
test('bootstrap JSON cannot break its data context and preserves all source bytes including replacement tokens', () => {
  const value = { text: '</script><img src=x onerror=alert(1)>\u2028\u2029 $& $` $\' <script>' };
  const escaped = safeJson(value);
  assert.doesNotMatch(escaped, /[<>&\u2028\u2029]/u);
  assert.deepEqual(JSON.parse(escaped), value);
  const html = template.replace('__GALLERY_STYLE__', '').replace('__GALLERY_DATA__', () => escaped);
  const dom = new JSDOM(html);
  assert.deepEqual(JSON.parse(dom.window.document.querySelector('#gallery-data').textContent), value);
  assert.equal(dom.window.document.querySelector('img'), null); dom.window.close();
});
test('host removes grading bootstrap from hidden DOM and uses opaque scripts-only sandbox', t => {
  const { window } = app(t);
  assert.equal(window.document.querySelector('#gallery-data'), null);
  assert.equal(window.document.querySelector('#gallery-frame').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(window.openai, undefined);
  assert.equal(window.__galleryDiagnostics.generation, 1);
});
test('source, nonce, schema, initialization order and duplicate hello are validated', t => {
  const { window, message } = app(t);
  message('ready', { mountMs: 1 }); assert.equal(window.document.body.dataset.status, 'loading');
  message('hello', { nonce: 'wrong' }); message('hello', {}, { source: window });
  message('hello', { extra: true }); message('hello'); message('hello');
  message('ready', { mountMs: 1 }); assert.equal(window.document.body.dataset.status, 'ready');
  message('size', { height: -1 }); message('size', { height: 50001 }); message('size', { height: 100 });
  assert.equal(window.document.querySelector('#gallery-frame').style.height, '100px');
  assert.equal(window.__galleryDiagnostics.rejectedMessages, 7);
});
test('dangerous object keys and forged full-copy text never cross the trusted host boundary', async t => {
  const copied = []; const { window, message } = app(t, async text => copied.push(text));
  message('hello');
  message('state', { state: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') });
  message('copy', { id: 1, text: 'forged private content' });
  message('copy', { id: 1, text: fixture.text });
  await new Promise(resolve => setTimeout(resolve, 0));
  message('copy', { id: 1, text: fixture.text });
  assert.deepEqual(copied, [fixture.text]);
  assert.equal(window.__galleryDiagnostics.stateOperations, 0);
  assert.equal({}.polluted, undefined);
});
test('inherited Object operation names are rejected as unknown messages without throwing', async t => {
  const { window, message } = app(t);
  message('hello'); message('toString'); message('constructor');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(window.__galleryDiagnostics.rejectedMessages, 2);
  message('ready', { mountMs: 1 }); assert.equal(window.document.body.dataset.status, 'ready');
});
test('old frames and late clipboard completion cannot affect the next scene', async t => {
  let finish; const { window, message } = app(t, () => new Promise(resolve => { finish = resolve; }));
  const old = message('hello'); const oldNonce = /data-gallery-nonce="([a-f0-9]+)"/.exec(old.srcdoc)[1];
  message('copy', { id: 1, text: fixture.text });
  window.document.querySelector('[data-scene="G04"]').click();
  finish(); await new Promise(resolve => setTimeout(resolve, 0));
  window.dispatchEvent(new window.MessageEvent('message', { source: old.contentWindow, data: { channel: 'chatui-offline-v1', nonce: oldNonce, op: 'ready', mountMs: 1 } }));
  assert.equal(window.document.body.dataset.currentScene, 'G04'); assert.equal(window.document.body.dataset.status, 'loading');
  message('hello'); message('ready', { mountMs: 1 }); assert.equal(window.document.body.dataset.status, 'ready');
});

test('theme controls preserve the initialized frame; explicit reset still creates a fresh identity', t => {
  const { window, message } = app(t);
  const original = message('hello'); message('ready', { mountMs: 1 });
  const theme = window.document.querySelector('#theme');
  theme.value = 'dark'; theme.dispatchEvent(new window.Event('change'));
  assert.equal(window.document.querySelector('#gallery-frame'), original);
  assert.equal(window.__galleryDiagnostics.generation, 1);
  assert.equal(window.document.documentElement.style.colorScheme, 'dark');
  window.document.querySelector('#reset').click();
  assert.notEqual(window.document.querySelector('#gallery-frame'), original);
  assert.equal(window.__galleryDiagnostics.generation, 2);
});

test('chapter requests reject invalid positions, identities and unsolicited fields', t => {
  const { window, message } = app(t); message('hello');
  for (const extra of [
    { id: 1, top: -1, height: 10 }, { id: 1, top: 0, height: 50001 },
    { id: 0, top: 0, height: 10 }, { id: 1, top: 0, height: 10, selector: 'private-parent' }
  ]) message('navigate', extra);
  assert.equal(window.__galleryDiagnostics.rejectedMessages, 4);
});
