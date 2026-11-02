import { componentTemplate } from './component-template.mjs';
/** Behavior-only checks; jsdom does not establish browser layout or Chat auto-activation. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const clone = value => JSON.parse(JSON.stringify(value));
const fixture = (type, data) => ({ schemaVersion: 1, contentId: `exploration-${type}-v1`, type, title: '探索与讲解', data });
const tabs = () => fixture('tabs', { items: [
  { id: 'concept', label: '概念', title: '先看含义', body: '合力是所有真实作用力的矢量和。', points: ['先选研究对象', '分力不是额外作用力'] },
  { id: 'example', label: '例子', body: '向右 6 N，向左 2 N，合力向右 4 N。' },
  { id: 'check', label: '核对', body: '核对正方向与单位。' }
] });
const reveal = (initialVisible = 1) => fixture('reveal-steps', { initialVisible, items: [
  { title: '选取对象', detail: '只分析物块。' },
  { title: '沿水平方向求和', math: { tag: 'mrow', children: [{ tag: 'mn', text: '6' }, { tag: 'mo', text: '−' }, { tag: 'mn', text: '2' }, { tag: 'mo', text: '=' }, { tag: 'mn', text: '4' }] }, mathLabel: '六减二等于四', detail: '向右为正，合力为 4 N。' },
  { title: '解释结果', detail: '方向向右。' }
] });
function mount(config, { saved, id = 'chatui-component', source = componentTemplate(config.type) } = {}) {
  const dom = new JSDOM(source.replaceAll('chatui-component', id), { runScripts: 'outside-only', url: 'https://chatui-component.test/', virtualConsole: new VirtualConsole() });
  const { window } = dom, saves = [];
  window.openai = { widgetState: saved && clone(saved), setWidgetState(value) { saves.push(clone(value)); } };
  window.document.getElementById(`${id}-config`).textContent = JSON.stringify(config);
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  const root = window.document.getElementById(id);
  return { window, root, saves, close: () => window.close(), restore(value) { window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: clone(value) } } })); } };
}
const activeTab = app => app.root.querySelector('[role="tab"][aria-selected="true"]');
const visibleSteps = app => [...app.root.querySelectorAll('[data-reveal-step]')].filter(node => !node.hidden).length;
const action = (app, name) => app.root.querySelector(`[data-reveal-action="${name}"]`);

test('tabs change real content, keep one tab stop and label the corresponding visible panel', t => {
  const app = mount(tabs()); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  const buttons = [...app.root.querySelectorAll('[role="tab"]')];
  assert.equal(buttons.length, 3);
  assert.equal(activeTab(app).getAttribute('data-tab-id'), 'concept');
  buttons[1].click();
  assert.equal(activeTab(app), buttons[1]);
  assert.equal(buttons.filter(button => button.tabIndex === 0).length, 1);
  const panel = app.window.document.getElementById(buttons[1].getAttribute('aria-controls'));
  assert.equal(panel.hidden, false);
  assert.equal(panel.getAttribute('aria-labelledby'), buttons[1].id);
  assert.match(panel.textContent, /向右 4 N/);
  assert.equal(app.root.querySelector('[data-tab-panel="concept"]').hidden, true);
  assert.equal(app.saves.at(-1).modelContent.selectedId, 'example');
  assert.equal(app.root.querySelector('a, form'), null);
});

test('tabs support wrapping ArrowLeft/ArrowRight and Home/End while moving keyboard focus', t => {
  const app = mount(tabs()); t.after(app.close);
  const press = key => {
    const event = new app.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    activeTab(app).dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(app.window.document.activeElement, activeTab(app));
  };
  press('ArrowLeft'); assert.equal(activeTab(app).getAttribute('data-tab-id'), 'check');
  press('ArrowRight'); assert.equal(activeTab(app).getAttribute('data-tab-id'), 'concept');
  press('End'); assert.equal(activeTab(app).getAttribute('data-tab-id'), 'check');
  press('Home'); assert.equal(activeTab(app).getAttribute('data-tab-id'), 'concept');
});

test('tabs restore only matching content and use root-scoped ARIA identifiers', t => {
  const config = tabs();
  const first = mount(config, { id: 'chatui-tabs-first' }); t.after(first.close);
  first.root.querySelector('[data-tab-id="example"]').click();
  const saved = first.saves.at(-1);
  const restored = mount(config, { saved, id: 'chatui-tabs-second' }); t.after(restored.close);
  assert.equal(activeTab(restored).getAttribute('data-tab-id'), 'example');
  const controls = [...restored.root.querySelectorAll('[role="tab"]')].map(node => node.getAttribute('aria-controls'));
  assert.ok(controls.every(id => id.startsWith('chatui-tabs-second-')));
  assert.equal(new Set(controls).size, controls.length);
  const changed = clone(config); changed.data.items[1].body = '不同例子';
  const other = mount(changed, { saved }); t.after(other.close);
  assert.equal(activeTab(other).getAttribute('data-tab-id'), 'concept');
  const tampered = clone(saved); tampered.privateContent.chatui.value.selected = 'missing';
  restored.restore(tampered);
  assert.equal(activeTab(restored).getAttribute('data-tab-id'), 'concept');
});

test('tab labels, body, points and note remain inert text', t => {
  const payload = '<img src=x onerror="window.__injected=true">';
  const config = tabs();
  config.data.items[0] = { id: '__proto__', label: '文本', title: payload, body: payload, points: [payload] }; config.data.note = payload;
  const app = mount(config); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(app.root.querySelector('img, script'), null);
  assert.equal(app.window.__injected, undefined);
  assert.ok(app.root.textContent.includes(payload));
});

test('tabs reject empty, duplicate, unbounded or malformed content without dead controls', t => {
  const valid = tabs().data;
  for (const data of [
    { items: [] }, { items: [valid.items[0]] }, { items: Array(7).fill(valid.items[0]) },
    { items: [valid.items[0], { ...valid.items[1], id: 'concept' }] },
    { items: [valid.items[0], { ...valid.items[1], body: '' }] },
    { items: [valid.items[0], { ...valid.items[1], label: 'a'.repeat(61) }] },
    { items: [valid.items[0], { ...valid.items[1], points: {} }] },
    { items: [valid.items[0], { ...valid.items[1], points: [''] }] },
    { ...valid, note: {} }
  ]) {
    const app = mount(fixture('tabs', data)); t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'));
    assert.equal(app.root.querySelector('[role="tab"]'), null);
  }
});

test('revealing steps changes actual visibility, current step and controls without asserting mastery', t => {
  const app = mount(reveal()); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(visibleSteps(app), 1);
  assert.equal(action(app, 'previous').disabled, true);
  assert.equal(action(app, 'reset').disabled, true);
  action(app, 'next').click();
  assert.equal(visibleSteps(app), 2);
  assert.equal(app.root.querySelector('[aria-current="step"]').getAttribute('data-reveal-step'), '2');
  assert.match(app.root.querySelector('[data-reveal-status]').textContent, /已展开 2 \/ 3 步/);
  action(app, 'next').click();
  assert.equal(visibleSteps(app), 3);
  assert.equal(action(app, 'next').disabled, true);
  action(app, 'previous').click(); assert.equal(visibleSteps(app), 2);
  action(app, 'reset').click(); assert.equal(visibleSteps(app), 1);
  assert.equal(app.saves.at(-1).modelContent.revealed, 1);
  assert.equal(Object.hasOwn(app.saves.at(-1).modelContent, 'mastered'), false);
  assert.equal(app.root.querySelector('[role="progressbar"]'), null);
});

test('revealed formulas use safe MathML and have an accessible reading label', t => {
  const app = mount(reveal()); t.after(app.close);
  action(app, 'next').click();
  const math = app.root.querySelector('math');
  assert.equal(math.namespaceURI, 'http://www.w3.org/1998/Math/MathML');
  assert.equal(math.getAttribute('aria-label'), '六减二等于四');
  assert.equal(math.textContent, '6−2=4');
  assert.equal(math.closest('[data-reveal-step]').hidden, false);
});

test('reveal state restores for exact content, resets to configured initial count and rejects invalid restored counts', t => {
  const config = reveal(2);
  const first = mount(config); t.after(first.close);
  assert.equal(visibleSteps(first), 2);
  action(first, 'previous').click(); assert.equal(visibleSteps(first), 1);
  action(first, 'reset').click(); assert.equal(visibleSteps(first), 2);
  action(first, 'next').click();
  const saved = first.saves.at(-1);
  const restored = mount(config, { saved }); t.after(restored.close);
  assert.equal(visibleSteps(restored), 3);
  const changed = clone(config); changed.data.items[0].detail = '另一个研究对象。';
  const other = mount(changed, { saved }); t.after(other.close);
  assert.equal(visibleSteps(other), 2);
  for (const value of [-1, 0, 4, 1.5, '3', null]) {
    const tampered = clone(saved); tampered.privateContent.chatui.value.visible = value;
    restored.restore(tampered); assert.equal(visibleSteps(restored), 2);
  }
});

test('reveal rejects empty/invalid data and unsafe formula tags instead of rendering partial reasoning', t => {
  const valid = reveal().data;
  for (const data of [
    { items: [] }, { items: Array(13).fill(valid.items[0]) },
    { ...valid, initialVisible: 0 }, { ...valid, initialVisible: 4 }, { ...valid, initialVisible: '1' },
    { items: [{ title: '步骤', detail: '' }] }, { items: [{ title: {}, detail: '解释' }] },
    { items: [{ title: '步骤', detail: '解释', math: null }] },
    { items: [{ title: '步骤', detail: '解释', math: { tag: 'script', text: 'window.__injected=true' } }] }
  ]) {
    const app = mount(fixture('reveal-steps', data)); t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'));
    assert.equal(app.root.querySelector('[data-reveal-action]'), null);
    assert.equal(app.window.__injected, undefined);
  }
});

test('one-step reasoning stays readable with bounded controls and inert prose', t => {
  const payload = '<img src=x onerror="window.__injected=true">';
  const app = mount(fixture('reveal-steps', { items: [{ title: '一步', detail: payload }] })); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(visibleSteps(app), 1);
  assert.ok([...app.root.querySelectorAll('button')].every(button => button.disabled));
  assert.ok(app.root.textContent.includes(payload));
  assert.equal(app.root.querySelector('img, script'), null);
});
