import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createGalleryScenarios } from '../examples/gallery.mjs';
import { compileGalleryScenarios } from '../scripts/generate-gallery.mjs';
import { documentHtml } from '../lib/document.generated.mjs';

const gradingFields = new Set(['correct', 'explanation', 'answerKey', 'grading']);
const assertPublic = value => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(gradingFields.has(key), false, `Public Gallery data contains grading field: ${key}`);
    assertPublic(child);
  }
};

test('S01/A00: G08 Gallery exposes only public quiz view and carries grading separately in _meta', () => {
  const scene = compileGalleryScenarios(createGalleryScenarios()).find(item => item.id === 'G08');
  assertPublic(scene.view);
  const grading = scene._meta?.chatui?.quizGrading;
  assert.equal(grading?.version, 1);
  assert.equal(grading.contentId, scene.view.contentId);
  assert.equal(grading.sourceHash, scene.view.sourceHash);
  assert.equal(grading.quizzes.length, 1);
  const question = grading.quizzes[0].questions[0];
  assert.equal(typeof question.correct, 'string');
  assert.equal(typeof question.explanation, 'string');
  assert.equal(scene.text.includes(question.explanation), false);
  assert.equal(JSON.stringify(scene.view).includes(question.explanation), false);
});

test('Gallery detects Quiz state isolation from actual compiled data and leaves non-Quiz scenarios without private grading metadata', () => {
  const input = createGalleryScenarios().find(item => item.id === 'G08');
  input.input = input.quizInput; delete input.quizInput;
  const quiz = compileGalleryScenarios([input])[0];
  assert.equal(quiz.hasQuiz, true, 'Normal document input with a Quiz must also reset on reload or scene switch');
  assertPublic(quiz.view);
  for (const scene of compileGalleryScenarios(createGalleryScenarios()).filter(item => !item.hasQuiz)) assert.equal(scene._meta, undefined);
});

const g08 = () => compileGalleryScenarios(createGalleryScenarios()).find(item => item.id === 'G08');
const bridge = readFileSync(new URL('../lib/widget-bridge.js', import.meta.url), 'utf8');
const frameAdapter = readFileSync(new URL('../gallery/frame.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function galleryFrame(t) {
  assert.equal(documentHtml.split(bridge).length, 2, 'Fixture exercises the current generated Renderer and actual offline frame adapter');
  const errors = [], outbound = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const nonce = 'synthetic-gallery-nonce';
  const html = documentHtml.replace(bridge, frameAdapter).replace('<html ', `<html data-gallery-nonce="${nonce}" `);
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://gallery-boundary.invalid', virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const parent = { postMessage(message) {
    outbound.push(structuredClone(message));
    if (message.op === 'copy') queueMicrotask(() => send('copy-result', { id: message.id, ok: false }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  const send = (op, payload = {}) => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: { channel: 'chatui-offline-v1', nonce, op, ...payload } }));
  for (const script of window.document.scripts) window.eval(script.textContent);
  const root = window.document.querySelector('#chatui-component');
  t.after(() => { send('destroy'); window.close(); });
  return { root, window, outbound, errors, send, async init(scene, changes = {}) {
    send('init', { view: scene.view, text: scene.text, ...(scene._meta ? { _meta: scene._meta } : {}), theme: 'light', ...changes });
    for (let index = 0; index < 100 && root.getAttribute('aria-busy') === 'true'; index++) await tick();
    await tick();
  } };
}

test('S01/A00: actual Gallery adapter grades only after submission, copies public text and resets on fresh mount', async t => {
  const scene = g08(), grading = scene._meta.chatui.quizGrading.quizzes[0].questions[0];
  const app = await galleryFrame(t); await app.init(scene);
  const button = label => [...app.root.querySelectorAll('button')].find(item => item.textContent === label);
  assert.equal(app.root.textContent.includes(grading.explanation), false);
  assert.doesNotMatch(app.root.textContent, /正确答案：/);
  app.root.querySelector(`input[value="${grading.correct}"]`).click();
  assert.equal(app.root.textContent.includes(grading.explanation), false);
  button('提交答案').click();
  assert.match(app.root.textContent, /1 \/ 1 正确/);
  assert.ok(app.root.textContent.includes(grading.explanation));
  button('复制完整文档').click(); await tick();
  const copy = app.outbound.find(message => message.op === 'copy');
  assert.equal(copy.text, scene.text); assert.equal(copy.text.includes(grading.explanation), false);
  assert.equal(app.root.querySelector('.cui-document-copy-text').value, scene.text);
  button('重新测试').click();
  assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  assert.equal(app.root.textContent.includes(grading.explanation), false);
  assert.equal(app.outbound.some(message => message.op === 'state'), false);
  assert.equal(JSON.stringify(app.outbound).includes(grading.explanation), false);
  const fresh = await galleryFrame(t); await fresh.init(scene);
  assert.equal(fresh.root.querySelectorAll('input:checked').length, 0);
  assert.equal(fresh.root.textContent.includes(grading.explanation), false);
  app.send('destroy'); app.send('init', { view: scene.view, text: scene.text, _meta: scene._meta });
  assert.equal(app.root.textContent.includes(grading.explanation), false);
  assert.deepEqual(app.errors, []); assert.deepEqual(fresh.errors, []);
});

test('S01/A00: missing or mismatched Gallery grading fails closed without recovering answers through fallback', async t => {
  const scene = g08(), grading = scene._meta.chatui.quizGrading.quizzes[0].questions[0];
  const altered = structuredClone(scene._meta); altered.chatui.quizGrading.contentId = 'another-synthetic-quiz';
  for (const meta of [undefined, altered]) {
    const app = await galleryFrame(t); await app.init(scene, { _meta: meta });
    assert.equal(app.root.querySelectorAll('input[type="radio"]').length, 0);
    assert.ok(app.root.textContent.includes(scene.text));
    assert.equal(app.root.textContent.includes(grading.explanation), false);
    assert.equal(app.outbound.some(message => message.op === 'state'), false);
    assert.ok(app.outbound.some(message => message.op === 'rejected'));
    assert.deepEqual(app.errors, []);
  }
});

test('Gallery themes retain the exact live Quiz inputs and scores without emitting state or grading', async t => {
  const scene = g08(), grading = scene._meta.chatui.quizGrading.quizzes[0].questions[0];
  const app = await galleryFrame(t); await app.init(scene);
  const input = app.root.querySelector(`input[value="${grading.correct}"]`);
  input.click();
  for (const theme of ['dark', 'light']) {
    app.send('theme', { theme });
    assert.equal(app.window.document.documentElement.style.colorScheme, theme);
    assert.equal(app.root.querySelector(`input[value="${grading.correct}"]`), input);
    assert.equal(input.checked, true);
    assert.equal(app.root.textContent.includes(grading.explanation), false);
  }
  [...app.root.querySelectorAll('button')].find(node => node.textContent === '提交答案').click();
  const scored = app.root.textContent;
  for (const theme of ['dark', 'light']) { app.send('theme', { theme }); assert.equal(app.root.textContent, scored); }
  app.send('theme', { theme: 'invalid' }); app.send('theme', { theme: 'dark', state: {} });
  assert.equal(app.window.document.documentElement.style.colorScheme, 'light');
  assert.equal(app.outbound.some(message => message.op === 'state'), false);
  assert.equal(JSON.stringify(app.outbound).includes(grading.explanation), false);
  assert.equal(app.window.localStorage.length, 0); assert.equal(app.window.sessionStorage.length, 0);
  assert.deepEqual(app.errors, []);
});

test('Gallery navigation failure keeps a clear static outline and never moves focus on an unconfirmed result', async t => {
  const scene = compileGalleryScenarios(createGalleryScenarios()).find(item => item.id === 'G05');
  const app = await galleryFrame(t); await app.init(scene);
  const chapter = app.root.querySelector('.cui-document-chapter');
  chapter.focus(); chapter.click();
  const request = app.outbound.find(message => message.op === 'navigate');
  assert.ok(request); assert.deepEqual(Object.keys(request).sort(), ['channel', 'height', 'id', 'nonce', 'op', 'top']);
  app.send('copy-result', { id: request.id, ok: true }); await tick();
  assert.equal(app.root.querySelectorAll('h2[tabindex="-1"]').length, 0, 'Wrong operation cannot acknowledge a navigation');
  app.send('navigate-result', { id: request.id, ok: false }); await tick();
  assert.equal(app.root.querySelector('.cui-document-chapter'), null);
  assert.match(app.root.querySelector('.cui-document-outline-note').textContent, /仅为静态概览/);
  assert.match(app.root.querySelector('.cui-document-navigation-status').textContent, /定位未确认/);
  assert.equal(app.root.querySelectorAll('h2[tabindex="-1"]').length, 0);
  assert.equal(app.window.document.activeElement, app.root.querySelector('.cui-document-outline-title'));
  assert.deepEqual(app.errors, []);
});
