import { componentTemplate } from './component-template.mjs';
/** DOM behavior only; this does not establish layout or ordinary Chat routing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const fixture = () => ({ schemaVersion: 1, contentId: 'independent-table-v1', type: 'data-table', title: '参考资料比较', data: {
  columns: [{ key: 'name', label: '资料', type: 'text' }, { key: 'count', label: '样本数', type: 'number' }],
  rows: [
    { id: 'ten', values: { name: 'B 水循环', count: 10 } },
    { id: 'two', values: { name: 'A 水循环', count: 2 } },
    { id: 'same', values: { name: 'C 土壤', count: 2 } }
  ]
} });
const clone = value => JSON.parse(JSON.stringify(value));
function mount(config = fixture(), saved) {
  const virtualConsole = new VirtualConsole();
  const errors = []; virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(componentTemplate(config.type), { runScripts: 'outside-only', virtualConsole });
  const { window } = dom, saves = [];
  window.openai = { widgetState: saved, setWidgetState(payload) { saves.push(clone(payload)); return Promise.resolve(); } };
  window.document.querySelector('#chatui-component-config').textContent = JSON.stringify(config);
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  const root = window.document.querySelector('#chatui-component');
  return {
    window, root, saves, errors, close: () => window.close(),
    ids: () => [...root.querySelectorAll('tbody tr')].map(row => row.getAttribute('data-row-id')),
    search(value) { const input = root.querySelector('[data-table-search]'); assert.ok(input); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); },
    sort(key) { const button = [...root.querySelectorAll('[data-table-sort]')].find(node => node.getAttribute('data-table-sort') === key); assert.ok(button); button.click(); },
    restore(value) { window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: value } } })); }
  };
}

test('data-table searches actual cells and announces match count', t => {
  const app = mount(); t.after(app.close);
  assert.deepEqual(app.ids(), ['ten', 'two', 'same']);
  app.search('水循环');
  assert.deepEqual(app.ids(), ['ten', 'two']);
  assert.equal(app.root.querySelector('[data-table-count]').textContent, '显示 2 / 3 条');
  assert.equal(app.root.querySelector('[data-table-empty]').hidden, true);
  app.search('10'); assert.deepEqual(app.ids(), ['ten']);
  assert.deepEqual(app.errors, []);
});

test('data-table uses numeric sort and stable equal-value ordering', t => {
  const input = fixture(), original = clone(input), app = mount(input); t.after(app.close);
  app.sort('count'); assert.deepEqual(app.ids(), ['two', 'same', 'ten']);
  assert.equal(app.root.querySelectorAll('th')[1].getAttribute('aria-sort'), 'ascending');
  app.sort('count'); assert.deepEqual(app.ids(), ['ten', 'two', 'same']);
  assert.equal(app.root.querySelectorAll('th')[1].getAttribute('aria-sort'), 'descending');
  assert.deepEqual(input, original);
});

test('data-table sorts text and filters sorted rows', t => {
  const app = mount(); t.after(app.close);
  app.sort('name'); assert.deepEqual(app.ids(), ['two', 'ten', 'same']);
  app.search('水循环'); assert.deepEqual(app.ids(), ['two', 'ten']);
  app.sort('name'); assert.deepEqual(app.ids(), ['ten', 'two']);
});

test('empty results and reset change the real table and sort state', t => {
  const app = mount(); t.after(app.close);
  app.sort('count'); app.search('没有这个词'); assert.deepEqual(app.ids(), []);
  assert.equal(app.root.querySelector('[data-table-empty]').hidden, false);
  assert.equal(app.root.querySelector('[data-table-count]').textContent, '显示 0 / 3 条');
  app.root.querySelector('[data-table-reset]').click();
  assert.deepEqual(app.ids(), ['ten', 'two', 'same']);
  assert.equal(app.root.querySelector('[data-table-search]').value, '');
  assert.equal(app.root.querySelector('[data-table-reset]').disabled, true);
  assert.ok([...app.root.querySelectorAll('th')].every(th => th.getAttribute('aria-sort') === 'none'));
});

test('data-table rejects invalid columns, row identifiers, missing values and wrong scalar types', t => {
  const changes = [
    f => f.data.columns.pop(),
    f => f.data.columns[1].key = 'name',
    f => f.data.columns[1].type = 'html',
    f => f.data.columns[0].label = 'x'.repeat(81),
    f => f.data.rows = [],
    f => f.data.rows[1].id = 'ten',
    f => f.data.rows[0].values.count = '10',
    f => f.data.rows[0].values.count = null,
    f => delete f.data.rows[0].values.count,
    f => f.data.rows[0].values.name = { value: 'x' },
    f => f.data.rows[0].values.name = 'x'.repeat(501),
    f => f.data.filterLabel = ''
  ];
  for (const change of changes) { const f = fixture(); change(f); const app = mount(f); t.after(app.close); assert.ok(app.root.querySelector('[role="alert"]')); assert.equal(app.root.querySelector('table'), null); }
});

test('unsafe markup remains literal text in labels, cells and column keys', t => {
  const f = fixture(), attack = '<img src=x onerror="window.injected=1">';
  f.title = attack; f.data.columns[0].label = attack; f.data.rows[0].values.name = attack;
  f.data.columns[1].key = '<svg onload=alert(1)>';
  f.data.rows.forEach(row => { row.values[f.data.columns[1].key] = row.values.count; delete row.values.count; });
  const app = mount(f); t.after(app.close);
  assert.equal(app.root.querySelector('img,svg,script'), null); assert.match(app.root.textContent, /<img/); assert.equal(app.window.injected, undefined);
  app.sort(f.data.columns[1].key); assert.deepEqual(app.ids(), ['two', 'same', 'ten']);
});

test('data-table persists actual filter, order and visible row IDs and restores them', t => {
  const first = mount(); t.after(first.close); first.search('水循环'); first.sort('count');
  const saved = first.saves.at(-1);
  assert.deepEqual(saved.modelContent.visibleRowIds, ['two', 'ten']); assert.equal(saved.modelContent.visibleCount, 2);
  const second = mount(fixture(), saved); t.after(second.close);
  assert.deepEqual(second.ids(), ['two', 'ten']); assert.equal(second.root.querySelector('[data-table-search]').value, '水循环');
  assert.equal(second.saves.length, 0, 'restoration must not create a state write loop');
  first.search('土壤'); second.restore(first.saves.at(-1)); assert.deepEqual(second.ids(), ['same']);
});

test('data-table bounds searches, validates restored state and isolates changed data', t => {
  const app = mount(); t.after(app.close); app.search('x'.repeat(500));
  assert.equal(app.root.querySelector('[data-table-search]').value.length, 120);
  const saved = clone(app.saves.at(-1)); saved.privateContent.chatui.value = { query: '', sortKey: 'missing', sortDirection: 'asc' };
  app.restore(saved); assert.deepEqual(app.ids(), ['ten', 'two', 'same']);
  saved.privateContent.chatui.value = { query: 'x'.repeat(121), sortKey: null, sortDirection: 'asc' };
  app.restore(saved); assert.equal(app.root.querySelector('[data-table-search]').value, '');
  app.search('土壤'); const changed = fixture(); changed.data.rows[0].values.count = 99;
  const other = mount(changed, app.saves.at(-1)); t.after(other.close); assert.deepEqual(other.ids(), ['ten', 'two', 'same']);
});

test('data-table preserves semantic accessible table controls and confines wide tables to a region', t => {
  const f = fixture(); f.data.columns.push({ key: 'kind', label: '类型', type: 'text' }, { key: 'year', label: '年份', type: 'number' });
  f.data.rows.forEach(row => Object.assign(row.values, { kind: '实验', year: 2026 }));
  const app = mount(f); t.after(app.close);
  assert.equal(app.root.querySelectorAll('table caption').length, 1);
  assert.ok([...app.root.querySelectorAll('th')].every(th => th.scope === 'col'));
  const input = app.root.querySelector('input'); assert.equal(input.labels.length, 1); assert.equal(input.labels[0].textContent, '搜索表格内容');
  assert.equal(app.root.querySelector('.cui-table-scroll').tabIndex, 0);
  assert.equal(app.root.querySelector('table').style.minWidth, '32rem');
  assert.ok([...app.root.querySelectorAll('button')].every(button => button.type === 'button'));
});
