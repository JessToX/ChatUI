import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { componentTemplate } from './component-template.mjs';

export const formData = () => ({ fields: [
  { id: 'topic', type: 'text', label: '实验名称', required: true, maxLength: 40 },
  { id: 'count', type: 'number', label: '样本数量', min: 1, max: 100, value: 4, required: true },
  { id: 'method', type: 'select', label: '方法', required: true, options: [{ value: 'a', label: '方法 A' }, { value: 'b', label: '方法 B' }] },
  { id: 'mode', type: 'radio', label: '模式', value: 'fixed', options: [{ value: 'fixed', label: '固定条件' }, { value: 'trial', label: '当前实验' }] },
  { id: 'confirmed', type: 'checkbox', label: '已核对单位', required: true },
  { id: 'notes', type: 'textarea', label: '观察记录', maxLength: 200 }
] });
export function mount(type, data, saved) {
  const dom = new JSDOM(componentTemplate(type), { runScripts: 'outside-only', url: 'https://synthetic.invalid/', virtualConsole: new VirtualConsole() });
  const { window } = dom, saves = [];
  window.openai = { widgetState: saved, setWidgetState(value) { saves.push(JSON.parse(JSON.stringify(value))); } };
  window.document.getElementById('chatui-component-config').textContent = JSON.stringify({ schemaVersion: 1, contentId: 'iteration-1', type, data });
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  return { window, root: window.document.getElementById('chatui-component'), saves, close: () => window.close() };
}
test('minimal P1 form: real labeled inputs validate, focus the error, submit typed values and reset', t => {
  const app = mount('input-form', formData()); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  const field = id => app.root.querySelector(`[data-form-field="${id}"]`);
  const submit = () => app.root.querySelector('[data-form-action="submit"]').click();
  submit(); assert.equal(field('topic').getAttribute('aria-invalid'), 'true');
  assert.equal(app.window.document.activeElement, field('topic'));
  const change = (id, value) => { const node = field(id); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new app.window.Event('input', { bubbles: true })); };
  change('topic', '折射实验'); change('method', 'b'); change('confirmed', true); change('notes', '观察记录'); submit();
  assert.deepEqual(app.saves.at(-1).modelContent.values, { topic: '折射实验', count: 4, method: 'b', mode: 'fixed', confirmed: true, notes: '观察记录' });
  assert.match(app.root.querySelector('[data-form-result]').textContent, /折射实验/);
  change('count', '0'); submit(); assert.equal(field('count').getAttribute('aria-invalid'), 'true');
  assert.equal(Object.hasOwn(app.saves.at(-1).modelContent, 'values'), false);
  app.root.querySelector('[data-form-action="reset"]').click(); assert.equal(field('topic').value, ''); assert.equal(field('count').value, '4');
});
test('minimal P1 geometry: precise numeric input updates graph and table; invalid input retains last valid experiment', t => {
  const app = mount('geometry', { radius: 2, heightRatio: 1, unit: 'cm' }); t.after(app.close);
  const input = app.root.querySelector('[data-geometry-input]'); assert.ok(input);
  input.value = '1.5'; input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  const area = app.root.querySelector('[data-geometry-result="area"]');
  assert.ok(Math.abs(Number(area.dataset.value) - 3 * Math.sqrt(3)) < 1e-12);
  input.value = ''; input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.ok(Math.abs(Number(area.dataset.value) - 3 * Math.sqrt(3)) < 1e-12);
  app.root.querySelector('[data-geometry-reset]').click(); assert.equal(input.value, '1'); assert.equal(area.dataset.value, '4');
});

test('form draft, submitted state and changed-content identity restore independently', t => {
  const app = mount('input-form', { fields: [{ id: 'name', label: '名称', type: 'text' }] }); t.after(app.close);
  const field = app.root.querySelector('input'); field.value = '私有草稿'; field.dispatchEvent(new app.window.Event('input'));
  assert.equal(JSON.stringify(app.saves.at(-1).modelContent).includes('私有草稿'), false);
  const draft = mount('input-form', { fields: [{ id: 'name', label: '名称', type: 'text' }] }, app.saves.at(-1)); t.after(draft.close);
  assert.equal(draft.root.querySelector('input').value, '私有草稿'); assert.equal(draft.root.querySelector('[data-form-result]').hidden, true);
  app.root.querySelector('[data-form-action="submit"]').click(); const saved = app.saves.at(-1);
  const restored = mount('input-form', { fields: [{ id: 'name', label: '名称', type: 'text' }] }, saved); t.after(restored.close);
  assert.equal(restored.root.querySelector('[data-form-result]').hidden, false); assert.equal(restored.saves.length, 0);
  const changed = mount('input-form', { fields: [{ id: 'name', label: '不同名称', type: 'text' }] }, saved); t.after(changed.close);
  assert.equal(changed.root.querySelector('input').value, '');
  saved.privateContent.chatui.value.values.name = null;
  const invalid = mount('input-form', { fields: [{ id: 'name', label: '名称', type: 'text' }] }, saved); t.after(invalid.close);
  assert.equal(invalid.root.querySelector('[data-form-result]').hidden, true);
});

test('form boundaries, checkbox/radio names, explicit submission and inert text', t => {
  const payload = '<img src=x onerror="window.pwned=1">';
  const data = { fields: [
    { id: 'number', type: 'number', label: '值', min: -1, max: 1 },
    { id: 'text', type: 'text', label: payload, maxLength: 5 },
    { id: 'choice', type: 'radio', label: '选择', options: [{ value: 'a', label: payload }, { value: 'b', label: 'B' }] },
    { id: 'notes', type: 'textarea', label: '说明', value: payload }
  ] };
  const app = mount('input-form', data); t.after(app.close);
  const input = app.root.querySelector('[data-form-field="number"]'), submit = app.root.querySelector('[data-form-action="submit"]');
  for (const value of ['-1', '1', '0', '']) { input.value = value; input.dispatchEvent(new app.window.Event('input')); submit.click(); assert.equal(input.getAttribute('aria-invalid'), 'false'); }
  assert.equal(app.saves.at(-1).modelContent.values.number, null);
  for (const value of ['-1.01', '1.01', '1e99']) { input.value = value; input.dispatchEvent(new app.window.Event('input')); submit.click(); assert.equal(input.getAttribute('aria-invalid'), 'true'); }
  app.root.querySelector('[data-form-field="choice"][value="b"]').click();
  assert.equal(app.saves.at(-1).privateContent.chatui.value.values.choice, 'b');
  assert.equal(app.root.querySelector('img, script'), null); assert.equal(app.window.pwned, undefined); assert.ok(app.root.textContent.includes(payload));
  assert.equal(Object.hasOwn(app.saves.at(-1).modelContent, 'values'), false);
});

test('geometry precise inputs preserve state, rounding and boundaries; restore and reset synchronize both controls', t => {
  const config = { radius: 2, heightRatio: 1, unit: 'cm' }, app = mount('geometry', config); t.after(app.close);
  const input = app.root.querySelector('[data-geometry-input]'), slider = app.root.querySelector('[type="range"]');
  for (const q of [.05, 1.2345, 1.95]) {
    input.value = String(q); input.dispatchEvent(new app.window.Event('input')); input.dispatchEvent(new app.window.Event('change'));
    assert.equal(Number(slider.value), q); const area = app.root.querySelector('[data-geometry-result="area"]');
    assert.ok(Math.abs(Number(area.dataset.value) - 4 * q * Math.sqrt(2 * q - q * q)) < 1e-12);
    assert.equal(app.saves.at(-1).privateContent.chatui.value.heightRatio, q);
  }
  const restored = mount('geometry', config, app.saves.at(-1)); t.after(restored.close);
  assert.equal(restored.root.querySelector('[data-geometry-input]').value, '1.95');
  const count = app.saves.length;
  for (const q of ['', '0', '2', '1e99']) { input.value = q; input.dispatchEvent(new app.window.Event('input')); input.dispatchEvent(new app.window.Event('change')); assert.equal(input.getAttribute('aria-invalid'), 'true'); }
  assert.equal(app.saves.length, count); assert.equal(slider.value, '1.95');
  slider.value = '.8'; slider.dispatchEvent(new app.window.Event('input')); assert.equal(input.value, '0.8'); assert.equal(input.getAttribute('aria-invalid'), 'false');
});

test('worst escaped form state stays within the unchanged widget budget; malformed client specs have no controls', t => {
  const data = { fields: [{ id: 'a', label: '一', type: 'textarea', maxLength: 500 }, { id: 'b', label: '二', type: 'textarea', maxLength: 500 }] };
  const app = mount('input-form', data); t.after(app.close);
  for (const node of app.root.querySelectorAll('textarea')) { node.value = '\u0001'.repeat(500); node.dispatchEvent(new app.window.Event('input')); }
  app.root.querySelector('[data-form-action="submit"]').click();
  assert.equal(app.saves.at(-1).modelContent.status, 'submitted'); assert.ok(JSON.stringify(app.saves.at(-1)).length < 15000);
  const invalid = mount('input-form', { fields: [] }); t.after(invalid.close);
  assert.ok(invalid.root.querySelector('[role="alert"]')); assert.equal(invalid.root.querySelector('input, button'), null);
});

test('standalone validation survives host echo, partial correction, theme globals and remount', t => {
  const app = mount('input-form', formData()); t.after(app.close);
  const field = id => app.root.querySelector(`[data-form-field="${id}"]`);
  const echo = () => app.window.dispatchEvent(new app.window.CustomEvent('openai:set_globals', { detail: { globals: { theme: 'dark', widgetState: app.saves.at(-1) } } }));
  app.root.querySelector('[data-form-action="submit"]').click(); echo();
  assert.equal(field('topic').getAttribute('aria-invalid'), 'true');
  const error = app.window.document.getElementById(field('topic').getAttribute('aria-errormessage'));
  assert.ok(error.textContent); assert.equal(error.getAttribute('aria-live'), 'polite');
  field('topic').value = '合成实验'; field('topic').dispatchEvent(new app.window.Event('input')); echo();
  assert.equal(field('topic').getAttribute('aria-invalid'), 'false'); assert.equal(field('method').getAttribute('aria-invalid'), 'true');
  const restored = mount('input-form', formData(), app.saves.at(-1)); t.after(restored.close);
  assert.equal(restored.root.querySelector('[data-form-field="method"]').getAttribute('aria-invalid'), 'true');
  assert.equal(restored.root.querySelector('[data-form-result]').hidden, true); assert.equal(restored.saves.length, 0);
  assert.equal(Object.hasOwn(app.saves.at(-1).modelContent, 'values'), false);
  app.root.querySelector('[data-form-action="reset"]').click(); echo();
  assert.equal(field('topic').value, ''); assert.equal(field('topic').getAttribute('aria-invalid'), 'false');
  assert.equal(field('topic').hasAttribute('aria-errormessage'), false);
});
