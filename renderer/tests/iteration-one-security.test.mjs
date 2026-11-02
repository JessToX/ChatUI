import assert from 'node:assert/strict';
import test from 'node:test';
import { componentTemplate } from '../../tests/component-template.mjs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { validateInputForm, formFieldError } from '../lib/input-form-policy.mjs';
import { componentText } from '../lib/response-text.mjs';

const textField = { id: 'note', type: 'textarea', label: '合成观察', maxLength: 5 };
const choices = { id: 'choice', type: 'select', label: '合成选择', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] };

function mount(t, data, saved) {
  const effects = [], writes = [];
  const vc = new VirtualConsole();
  for (const event of ['log', 'warn', 'error', 'info', 'debug']) vc.on(event, (...args) => effects.push(['console', event, ...args]));
  const dom = new JSDOM(componentTemplate('input-form'), {
    runScripts: 'outside-only', url: 'https://synthetic.invalid/', virtualConsole: vc
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.fetch = (...args) => { effects.push(['fetch', ...args]); return Promise.reject(new Error('Forbidden')); };
  window.navigator.sendBeacon = (...args) => { effects.push(['beacon', ...args]); return false; };
  window.XMLHttpRequest = class { constructor() { effects.push(['xhr']); } };
  window.Storage.prototype.setItem = (...args) => effects.push(['storage', ...args]);
  window.openai = { widgetState: saved, setWidgetState(value) { writes.push(structuredClone(value)); },
    callTool: (...args) => effects.push(['tool', ...args]), sendFollowUpMessage: (...args) => effects.push(['message', ...args]) };
  window.document.getElementById('chatui-component-config').textContent = JSON.stringify({ schemaVersion: 1, contentId: 'site-review-synthetic', type: 'input-form', data });
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  return { window, root: window.document.getElementById('chatui-component'), effects, writes };
}

test('blank optional text is bounded before empty-value handling; invalid blank choices reject', () => {
  assert.throws(() => validateInputForm({ fields: [{ ...textField, value: ' '.repeat(6) }] }));
  assert.throws(() => validateInputForm({ fields: [{ ...choices, value: ' ' }] }));
  assert.throws(() => validateInputForm({ fields: [{ ...choices, type: 'radio', value: '\t' }] }));
  assert.equal(formFieldError(textField, ' '.repeat(5)), '');
  assert.notEqual(formFieldError(textField, '\n'.repeat(6)), '');
  assert.equal(formFieldError(choices, ''), '');
  assert.equal(formFieldError(choices, 'a'), '');
  assert.notEqual(formFieldError({ id: 'n', type: 'number' }, ' '.repeat(41)), '');
});

test('standalone rejects over-budget whitespace defaults without rendering controls', t => {
  const app = mount(t, { fields: [{ ...textField, value: ' '.repeat(6) }] });
  assert.ok(app.root.querySelector('[role="alert"]'));
  assert.equal(app.root.querySelector('textarea'), null);
  assert.equal(app.writes.length, 0);
});

test('every form and fallback discloses host draft restoration and explicit model-context submission', t => {
  const data = { fields: [textField] }, app = mount(t, data);
  const privacy = app.root.querySelector('[data-form-privacy]');
  assert.ok(privacy);
  for (const text of ['草稿', '宿主', '提交', '模型上下文']) {
    assert.ok(privacy.textContent.includes(text));
    assert.ok(componentText('input-form', data).includes(text));
  }
  assert.equal(app.root.querySelector('textarea').autocomplete, 'off');
});

test('input sentinel stays out of logs, URL, browser storage, network and model context until submit', t => {
  const sentinel = 'SYNTHETIC_FORM_SENTINEL', data = { fields: [{ ...textField, maxLength: 100 }] };
  const app = mount(t, data), input = app.root.querySelector('textarea');
  input.value = sentinel; input.dispatchEvent(new app.window.Event('input'));
  assert.equal(JSON.stringify(app.writes.at(-1).modelContent).includes(sentinel), false);
  assert.equal(app.writes.at(-1).privateContent.chatui.value.values.note, sentinel);
  app.root.querySelector('[data-form-action="submit"]').click();
  assert.equal(app.writes.at(-1).modelContent.values.note, sentinel);
  app.root.querySelector('[data-form-action="reset"]').click();
  assert.equal(JSON.stringify(app.writes.at(-1)).includes(sentinel), false);
  assert.deepEqual(app.effects, []);
  assert.equal(app.window.location.href, 'https://synthetic.invalid/');
  assert.equal(app.window.document.cookie, '');
  assert.equal(app.window.localStorage.length + app.window.sessionStorage.length, 0);
});

test('untrusted restored values cannot exceed the declared capacity or acquire submitted status', t => {
  const data = { fields: [{ ...choices, required: true }] }, app = mount(t, data);
  const input = app.root.querySelector('select'); input.value = 'a'; input.dispatchEvent(new app.window.Event('input'));
  app.root.querySelector('[data-form-action="submit"]').click();
  const saved = app.writes.at(-1); saved.privateContent.chatui.value.values.choice = ' '.repeat(61);
  const restored = mount(t, data, saved);
  assert.equal(restored.root.querySelector('select').value, '');
  assert.equal(restored.root.querySelector('[data-form-result]').hidden, true);
  assert.equal(restored.writes.length, 0);
});

test('overlong restored select and radio drafts retain the current valid choice and revoke submission', t => {
  for (const type of ['select', 'radio']) {
    const app = mount(t, { fields: [{ ...choices, type, required: true }] });
    const input = app.root.querySelector(type === 'select' ? 'select' : 'input[value="a"]');
    if (type === 'select') input.value = 'a'; else input.checked = true;
    input.dispatchEvent(new app.window.Event('input'));
    app.root.querySelector('[data-form-action="submit"]').click();
    const saved = structuredClone(app.writes.at(-1));
    saved.privateContent.chatui.value.values.choice = 'x'.repeat(61);
    const writes = app.writes.length;
    app.window.dispatchEvent(new app.window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: saved } } }));
    assert.equal(type === 'select' ? input.value : input.checked, type === 'select' ? 'a' : true);
    assert.equal(app.root.querySelector('[data-form-result]').hidden, true);
    assert.equal(app.writes.length, writes, 'Restoration must not manufacture a user write');
    assert.equal(input.getAttribute('aria-invalid'), 'false');
  }
});
