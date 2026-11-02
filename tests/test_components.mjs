import { componentTemplate } from './component-template.mjs';
/** Development-only behavior checks. jsdom does not validate browser layout or Chat activation. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const copy = value => JSON.parse(JSON.stringify(value));
const fixture = (type, data, extra = {}) => ({ schemaVersion: 1, contentId: `independent-${type}-v1`, title: '独立验证', type, data, ...extra });
const quiz = () => fixture('quiz', {
  questions: [
    { id: 'sign', prompt: '1 − 3 的值是？', options: [{ id: 'positive', label: '2' }, { id: 'negative', label: '−2' }], correct: 'negative', explanation: '1 再减去 3 等于 −2。' },
    { id: 'zero', prompt: '0 × 9 的值是？', options: [{ id: 'zero', label: '0' }, { id: 'nine', label: '9' }], correct: 'zero', explanation: '任何数乘 0 都是 0。' }
  ],
  followUp: '请根据我的实际作答继续讲解。',
  followUpLabel: '继续讲解'
});

function mount(config, { saved, bridge = false, rejectFollowUp = false, width } = {}) {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => consoleErrors.push(error.message));
  const dom = new JSDOM(componentTemplate(config.type), { runScripts: 'outside-only', url: 'https://chatui-component.test/', virtualConsole });
  const { window } = dom;
  if (width !== undefined) window.Element.prototype.getBoundingClientRect = () => ({ width, height: width, x: 0, y: 0, top: 0, left: 0, right: width, bottom: width });
  const saves = [];
  const messages = [];
  window.openai = {
    widgetState: saved ? copy(saved) : undefined,
    setWidgetState(payload) { saves.push(copy(payload)); return Promise.resolve(); }
  };
  if (bridge) window.openai.sendFollowUpMessage = async payload => {
    messages.push(copy(payload));
    if (rejectFollowUp) throw new Error('Bridge unavailable');
  };
  window.document.querySelector('#chatui-component-config').textContent = JSON.stringify(config);
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  const root = window.document.querySelector('#chatui-component');
  return {
    dom, window, root, saves, messages, consoleErrors,
    close: () => window.close(),
    button(label) { const found = [...root.querySelectorAll('button')].find(node => node.textContent === label); assert.ok(found, `Missing button ${label}`); return found; },
    choose(questionIndex, optionValue) {
      const field = root.querySelectorAll('fieldset')[questionIndex];
      const input = [...field.querySelectorAll('input[type="radio"]')].find(node => node.value === optionValue);
      assert.ok(input, `Missing choice ${optionValue}`);
      input.click();
    },
    restore(state) { window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: copy(state) } } })); }
  };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const closeTo = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} must be close to ${expected}`);
const composePath = fileURLToPath(new URL('../plugins/chatui/skills/chatui/scripts/compose.py', import.meta.url));
const compose = (config, id) => execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import json,runpy,sys; module=runpy.run_path(sys.argv[1]); print(module["compose"](json.load(sys.stdin),sys.argv[2]))', composePath, id], { input: JSON.stringify(config), encoding: 'utf8' });

test('progress reports real numerator, denominator, unit and proportional fill', t => {
  const app = mount(fixture('progress', { value: 6, total: 10, unit: '份', label: '已核对' }));
  t.after(app.close);
  const bar = app.root.querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '6');
  assert.equal(bar.getAttribute('aria-valuemax'), '10');
  assert.equal(bar.getAttribute('aria-valuetext'), '6/10份');
  assert.equal(bar.firstElementChild.style.width, '60%');
  assert.equal(app.root.querySelector('[role="alert"]'), null);
});

test('invalid or zero progress denominator produces readable failure, never fake progress', t => {
  for (const [value, total] of [[1, 0], [0, -5], [6, 5], [-1, 5], [1, null], [null, 5]]) {
    const app = mount(fixture('progress', { value, total }));
    t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'), `Expected invalid progress ${value}/${total}`);
    assert.equal(app.root.querySelector('[role="progressbar"]'), null);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('large valid progress values preserve their ratio without overflow', t => {
  const app = mount(fixture('progress', { value: 5e307, total: 1e308 }));
  t.after(app.close);
  const bar = app.root.querySelector('[role="progressbar"]');
  assert.ok(bar);
  assert.equal(bar.firstElementChild.style.width, '50%');
  assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
});

test('progress stages show two truthful shared-denominator bars and their inclusion without an invented total', t => {
  const app = mount(fixture('progress', { total: 10, unit: '章', stages: [
    { id: 'draft', label: '已成稿', value: 6 },
    { id: 'proofread', label: '已校对', value: 3, subsetOf: 'draft' }
  ] }));
  t.after(app.close);
  const bars = [...app.root.querySelectorAll('[role="progressbar"]')];
  assert.equal(bars.length, 2);
  assert.deepEqual(bars.map(bar => bar.getAttribute('aria-valuetext')), ['6/10章', '3/10章']);
  assert.deepEqual(bars.map(bar => bar.getAttribute('aria-label')), ['已成稿', '已校对']);
  assert.deepEqual(bars.map(bar => bar.firstElementChild.style.width), ['60%', '30%']);
  assert.deepEqual(bars.map(bar => bar.firstElementChild.style.getPropertyValue('--cui-mark')), ['var(--cui-blue-mark)', 'var(--cui-green-mark)']);
  assert.equal(app.root.querySelectorAll('.cui-progress-primary').length, 1);
  assert.equal(app.root.querySelector('.cui-progress-primary').getAttribute('data-progress-stage'), 'draft');
  assert.equal(app.root.querySelector('.cui-progress-primary .cui-progress-stage-count').textContent, '6 / 10 章');
  assert.equal(app.root.querySelector('.cui-progress-primary .cui-progress-unit').textContent, ' 章');
  assert.match(app.root.querySelector('[data-progress-stage="proofread"]').textContent, /包含于“已成稿”/);
  assert.match(app.root.textContent, /不将阶段比例相加/);
  assert.doesNotMatch(app.root.textContent, /9\s*\/\s*10|90%|第[一二三四五六七八九十\d]+章|前[一二三四五六七八九十\d]+章/);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
});

test('progress preserves supplied stage order, chained relations and safe long Chinese labels at numeric boundaries', t => {
  const label = '已完成独立审校的长中文阶段说明'.repeat(5) + '<img src=x onerror=alert(1)>';
  const data = { total: 1e308, unit: '份', stages: [
    { id: 'approved', label, value: 0, subsetOf: 'review' },
    { id: 'draft', label: '已成稿', value: 1e308 },
    { id: 'review', label: '已校对', value: 5e307, subsetOf: 'draft' }
  ] };
  const app = mount(fixture('progress', data), { width: 320 });
  t.after(app.close);
  assert.deepEqual([...app.root.querySelectorAll('[data-progress-stage]')].map(row => row.getAttribute('data-progress-stage')), ['approved', 'draft', 'review']);
  assert.deepEqual([...app.root.querySelectorAll('[role="progressbar"]')].map(bar => bar.firstElementChild.style.width), ['0%', '100%', '50%']);
  assert.match(app.root.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(app.root.querySelector('img, script'), null);
  assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  // jsdom checks the wrapping contract, not rendered browser pixel dimensions.
  const css = app.window.document.querySelector('style').textContent;
  assert.match(css, /\.cui-progress-stage-heading\s*\{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.cui-progress-stage-label\s*\{[^}]*min-width: 0/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test('contradictory or malformed stage graphs fail before displaying any partial progress', t => {
  const draft = { id: 'draft', label: '成稿', value: 6 }, child = { id: 'review', label: '校对', value: 3, subsetOf: 'draft' };
  const cases = [
    { total: 10, value: 6, stages: [draft] }, { total: 0, stages: [draft] },
    ...[null, [], Array.from({ length: 13 }, (_, i) => ({ ...draft, id: `stage-${i}` })), [null], [draft, draft]].map(stages => ({ total: 10, stages })),
    ...[
      { ...child, value: 7 }, { ...child, subsetOf: 'missing' }, { ...draft, subsetOf: 'draft' },
      { ...child, subsetOf: null }, { ...child, value: '3' }, { ...child, value: NaN }, { ...child, value: -1 }, { ...child, value: 11 },
      { ...child, id: '' }, { ...child, id: 'x'.repeat(81) }, { ...child, label: null }, { ...child, label: 'x'.repeat(161) },
      { ...child, percent: 30 }
    ].map(stage => ({ total: 10, stages: [draft, stage] })),
    { total: 10, stages: [{ ...draft, value: 3, subsetOf: 'review' }, child] },
    { total: 10, stages: [{ id: 'a', label: 'A', value: 3, subsetOf: 'b' }, { id: 'b', label: 'B', value: 3, subsetOf: 'c' }, { id: 'c', label: 'C', value: 3, subsetOf: 'a' }] }
  ];
  for (const data of cases) {
    const app = mount(fixture('progress', data)); t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'), JSON.stringify(data));
    assert.equal(app.root.querySelector('[role="progressbar"]'), null);
  }
});

test('quiz keeps answers and explanations concealed until all questions are answered and submitted', t => {
  const app = mount(quiz());
  t.after(app.close);
  assert.equal(app.root.querySelector('input:checked'), null);
  assert.equal(app.root.querySelector('.cui-feedback'), null);
  assert.doesNotMatch(app.root.textContent, /正确答案|1 再减去|任何数乘/);
  app.button('提交答案').click();
  assert.match(app.root.querySelector('[role="alert"]').textContent, /先回答/);
  assert.equal(app.saves.length, 0);
  assert.equal(app.root.querySelector('[aria-live="polite"]'), null);
  app.choose(0, 'positive');
  app.button('提交答案').click();
  assert.equal(app.root.querySelector('.cui-feedback'), null);
  assert.equal(app.root.querySelector('[aria-live="polite"]'), null);
  assert.deepEqual(app.saves.at(-1).modelContent.answers, [{ questionId: 'sign', selected: 'positive' }, { questionId: 'zero', selected: null }]);
  assert.equal(app.saves.at(-1).modelContent.submitted, false);
  assert.equal(Object.hasOwn(app.saves.at(-1).modelContent, 'correct'), false);
});

test('quiz scores actual wrong and correct answers, then retry clears all visible and persisted answers', t => {
  const app = mount(quiz());
  t.after(app.close);
  app.choose(0, 'positive');
  app.choose(1, 'zero');
  app.button('提交答案').click();
  assert.match(app.root.textContent, /1 \/ 2 正确/);
  assert.equal(app.root.querySelectorAll('.cui-feedback').length, 2);
  assert.equal(app.saves.at(-1).modelContent.correct, 1);
  assert.equal(app.saves.at(-1).modelContent.total, 2);
  assert.ok([...app.root.querySelectorAll('input')].every(input => input.disabled));
  assert.equal([...app.root.querySelectorAll('button')].some(button => button.textContent === '继续讲解'), false, 'Absent host bridge must not offer a conversation button');
  app.button('重新测试').click();
  assert.equal(app.root.querySelector('input:checked'), null);
  assert.equal(app.root.querySelector('.cui-feedback'), null);
  assert.doesNotMatch(app.root.textContent, /1 \/ 2 正确|正确答案/);
  assert.equal(app.saves.at(-1).modelContent.submitted, false);
  assert.ok(app.saves.at(-1).modelContent.answers.every(answer => answer.selected === null));
});

test('quiz grades through an accessible local button without form submission capability', t => {
  const app = mount(quiz());
  t.after(app.close);
  let nativeSubmissions = 0;
  app.window.document.addEventListener('submit', event => { nativeSubmissions++; event.preventDefault(); }, true);
  app.window.HTMLFormElement.prototype.submit = () => { throw new Error('Forms are forbidden'); };
  app.window.HTMLFormElement.prototype.requestSubmit = () => { throw new Error('Forms are forbidden'); };
  assert.equal(app.root.querySelector('form'), null);
  assert.equal(app.root.querySelector('[role="group"]').getAttribute('aria-label'), '独立验证');
  const submit = app.button('提交答案');
  assert.equal(submit.type, 'button');
  submit.focus();
  assert.equal(app.window.document.activeElement, submit, 'Native button must remain keyboard focusable');
  app.choose(0, 'negative');
  app.choose(1, 'zero');
  submit.click();
  assert.match(app.root.textContent, /2 \/ 2 正确/);
  assert.equal(nativeSubmissions, 0);
  assert.deepEqual(app.consoleErrors, []);
});

test('quiz restores current-session state and rejects prior mount snapshots even for the same public content', t => {
  const config = quiz();
  const first = mount(config);
  t.after(first.close);
  first.choose(0, 'positive');
  const partial = copy(first.saves.at(-1));
  first.choose(1, 'zero');
  first.button('提交答案').click();
  const submitted = copy(first.saves.at(-1));
  const restored = mount(config, { saved: partial });
  t.after(restored.close);
  assert.equal(restored.root.querySelectorAll('input:checked').length, 0);
  assert.equal(restored.root.querySelector('.cui-feedback'), null);
  restored.restore(submitted);
  assert.equal(restored.root.querySelector('.cui-feedback'), null);
  first.restore(partial);
  assert.equal(first.root.querySelectorAll('input:checked').length, 1);
  assert.equal(first.root.querySelector('.cui-feedback'), null);
  first.restore(submitted);
  assert.match(first.root.textContent, /1 \/ 2 正确/);
  const changed = copy(config);
  changed.data.questions[0].correct = 'positive';
  const replacement = mount(changed, { saved: submitted });
  t.after(replacement.close);
  assert.equal(replacement.root.querySelector('input:checked'), null);
  assert.equal(replacement.root.querySelector('.cui-feedback'), null);
  replacement.restore(submitted);
  assert.equal(replacement.root.querySelector('input:checked'), null);
});

test('tampered restored answers cannot create a submitted result when options are missing or invalid', t => {
  const config = quiz();
  const original = mount(config);
  t.after(original.close);
  original.choose(0, 'negative');
  const altered = copy(original.saves.at(-1));
  altered.privateContent.chatui.value = { answers: { sign: 'not-an-option' }, submitted: true };
  original.restore(altered);
  assert.equal(original.root.querySelector('input:checked'), null);
  assert.equal(original.root.querySelector('.cui-feedback'), null);
  const restored = mount(config, { saved: altered });
  t.after(restored.close);
  assert.equal(restored.root.querySelector('input:checked'), null);
  assert.equal(restored.root.querySelector('.cui-feedback'), null);
  restored.button('提交答案').click();
  assert.match(restored.root.querySelector('[role="alert"]').textContent, /先回答/);
});

test('special question identifiers cannot masquerade as already answered through object prototypes', t => {
  for (const id of ['constructor', '__proto__', 'toString']) {
    const config = quiz();
    config.data.questions = [{ ...config.data.questions[0], id }];
    const app = mount(config);
    t.after(app.close);
    app.button('提交答案').click();
    assert.equal(app.root.querySelector('.cui-feedback'), null, `Question ${id} was not answered`);
    assert.match(app.root.querySelector('[role="alert"]').textContent, /先回答/);
    app.choose(0, 'negative');
    app.button('提交答案').click();
    assert.match(app.root.textContent, /1 \/ 1 正确/);
  }
});

test('a real host continuation receives the actual selection and score, and bridge failure stays visible', async t => {
  const app = mount(quiz(), { bridge: true, rejectFollowUp: true });
  t.after(app.close);
  app.choose(0, 'positive');
  app.choose(1, 'zero');
  app.button('提交答案').click();
  app.button('继续讲解').click();
  await tick();
  assert.equal(app.messages.length, 1);
  assert.match(app.messages[0].prompt, /得分：1\/2/);
  assert.match(app.messages[0].prompt, /"selected":"2","correct":false/);
  assert.match(app.root.querySelector('[role="alert"]').textContent, /未能确认/);
  assert.equal(app.button('继续讲解').disabled, false);
});

test('malicious text stays inert in labels and formulas; unsupported formula elements fail closed', t => {
  const payload = '<img src=x onerror="window.__injected=true"><script>window.__injected=true</script>';
  const config = fixture('comparison', { items: [{ label: payload, math: { tag: 'mtext', text: payload }, detail: payload }] });
  const app = mount(config);
  t.after(app.close);
  assert.equal(app.window.__injected, undefined);
  assert.equal(app.root.querySelector('img, script'), null);
  assert.ok(app.root.textContent.includes(payload));
  assert.equal(app.root.querySelector('math').textContent, payload);
  const rejected = mount(fixture('comparison', { items: [{ label: 'Invalid', math: { tag: 'script', text: 'window.__injected=true' } }] }));
  t.after(rejected.close);
  assert.ok(rejected.root.querySelector('[role="alert"]'));
  assert.equal(rejected.window.__injected, undefined);
  assert.equal(rejected.root.querySelector('script'), null);
});

test('geometry keeps circle, triangle and area consistent at h=r and h=1.5r, and restores the actual chosen value', t => {
  const config = fixture('geometry', { radius: 3, heightRatio: 1, unit: 'cm' });
  const app = mount(config);
  t.after(app.close);
  function verify(ratio) {
    const slider = app.root.querySelector('input[type="range"]');
    slider.value = String(ratio);
    slider.dispatchEvent(new app.window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    const observed = app.saves.at(-1).modelContent;
    const height = 3 * ratio;
    const halfBase = Math.sqrt(9 - (3 - height) ** 2);
    closeTo(observed.height, height);
    closeTo(observed.halfBase, halfBase);
    closeTo(observed.area, height * halfBase);
    const circle = app.root.querySelector('circle.cui-outline');
    const cx = Number(circle.getAttribute('cx'));
    const cy = Number(circle.getAttribute('cy'));
    const r = Number(circle.getAttribute('r'));
    const points = app.root.querySelector('polygon').getAttribute('points').split(' ').map(point => point.split(',').map(Number));
    for (const [x, y] of points) closeTo(Math.hypot(x - cx, y - cy), r);
    closeTo(points[1][1], points[2][1]);
    closeTo((points[1][0] + points[2][0]) / 2, cx);
    closeTo((points[1][1] - points[0][1]) / r, ratio);
    return copy(app.saves.at(-1));
  }
  verify(1);
  const saved = verify(1.5);
  const restored = mount(config, { saved });
  t.after(restored.close);
  assert.equal(restored.root.querySelector('input[type="range"]').value, '1.5');
  assert.match(restored.root.textContent, /高度 h = 4.5 cm/);
  assert.doesNotMatch(restored.root.textContent, /NaN|Infinity/);
});

test('geometry rejects nonpositive and absent radii instead of drawing invalid calculations', t => {
  for (const radius of [0, -1, null, 1e200, 1e-200]) {
    const app = mount(fixture('geometry', { radius, heightRatio: 1.5 }));
    t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'));
    assert.equal(app.root.querySelector('svg'), null);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('small finite geometry values are readable and remain nonzero', t => {
  const app = mount(fixture('geometry', { radius: 1e-100, heightRatio: 1, unit: 'm' }));
  t.after(app.close);
  const slider = app.root.querySelector('input[type="range"]');
  slider.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  const data = app.saves.at(-1).modelContent;
  assert.equal(data.area, 1e-200);
  assert.equal(data.halfBase, 1e-100);
  assert.match(app.root.textContent, /1E-100/);
  assert.match(app.root.textContent, /1E-200/);
  assert.doesNotMatch(app.root.textContent, /NaN|Infinity|面积 = 0 /);
});

test('geometry labels the center-to-base distance with the correct sign and omits a zero-length measure', t => {
  const app = mount(fixture('geometry', { radius: 4, heightRatio: .5, unit: 'cm' }));
  t.after(app.close);
  const input = app.root.querySelector('input[type="range"]');
  for (const [ratio, expected, forbidden] of [[.5, /r\s*[−-]\s*h/, /h\s*[−-]\s*r/], [1.5, /h\s*[−-]\s*r/, /r\s*[−-]\s*h/]]) {
    input.value = String(ratio);
    input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
    const labels = [...app.root.querySelectorAll('svg text')].map(node => node.textContent).join(' ');
    assert.match(labels, expected);
    assert.doesNotMatch(labels, forbidden);
  }
  input.value = '1';
  input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  const labels = [...app.root.querySelectorAll('svg text')].map(node => node.textContent).join(' ');
  assert.doesNotMatch(labels, /h\s*[−-]\s*r|r\s*[−-]\s*h/);
  assert.match(app.root.querySelector('svg desc').textContent, /高度4/);
});

test('invalid geometry restoration uses the current configured value and never imports another exercise', t => {
  const config = fixture('geometry', { radius: 4, heightRatio: 1.2, unit: 'cm' });
  const first = mount(config);
  t.after(first.close);
  const slider = first.root.querySelector('input[type="range"]');
  slider.value = '1.7';
  slider.dispatchEvent(new first.window.Event('input', { bubbles: true }));
  slider.dispatchEvent(new first.window.Event('change', { bubbles: true }));
  const saved = copy(first.saves.at(-1));
  saved.privateContent.chatui.value.heightRatio = -9;
  const restored = mount(config, { saved });
  t.after(restored.close);
  assert.equal(restored.root.querySelector('input[type="range"]').value, '1.2');
  assert.match(restored.root.textContent, /高度 h = 4.8 cm/);
  const changed = copy(config);
  changed.data.radius = 5;
  const replacement = mount(changed, { saved: first.saves.at(-1) });
  t.after(replacement.close);
  assert.equal(replacement.root.querySelector('input[type="range"]').value, '1.2');
  assert.match(replacement.root.textContent, /高度 h = 6 cm/);
});

test('every bundled example creates a readable component without runtime failure', t => {
  const examples = JSON.parse(readFileSync(new URL('../plugins/chatui/skills/chatui/assets/component-examples.json', import.meta.url), 'utf8'));
  assert.deepEqual(new Set(Object.values(examples).map(config => config.type)), new Set([
    'progress', 'timeline', 'profile', 'comparison', 'steps', 'rhythm', 'quiz', 'geometry', 'answer', 'line-chart', 'force-diagram', 'motion-lab', 'tabs', 'reveal-steps', 'data-table', 'media-panel', 'input-form'
  ]));
  for (const [name, config] of Object.entries(examples)) {
    const app = mount(config);
    t.after(app.close);
    assert.ok(app.root.textContent.trim().length > 0, name);
    assert.deepEqual(app.consoleErrors, [], name);
    assert.equal([...app.root.querySelectorAll('[role="alert"]')].some(alert => alert.textContent.trim()), false, name);
  }
});

test('answer presents an accessible formula without claiming unverified correctness', t => {
  const app = mount(fixture('answer', {
    title: '求得速度',
    math: { tag: 'mrow', children: [{ tag: 'mi', text: 'v' }, { tag: 'mo', text: '=' }, { tag: 'mn', text: '12' }] },
    mathLabel: '速度等于十二米每秒',
    detail: '单位：m/s'
  }));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.match(app.root.textContent, /求得速度/);
  assert.match(app.root.textContent, /结果/);
  assert.doesNotMatch(app.root.textContent, /正确|Correct/);
  assert.equal(app.root.querySelector('math').getAttribute('aria-label'), '速度等于十二米每秒');
  assert.equal(app.root.querySelector('math').textContent, 'v=12');
  assert.equal(app.root.querySelector('button'), null, 'A result must not create a fake continuation action');
});

test('answer labels, result text and typed formulas keep untrusted HTML inert', t => {
  const payload = '<img src=x onerror="window.__injected=true"><script>window.__injected=true</script>';
  const app = mount(fixture('answer', {
    label: payload, title: payload, detail: payload, math: { tag: 'mtext', text: payload }, mathLabel: payload
  }));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(app.window.__injected, undefined);
  assert.equal(app.root.querySelector('img, script'), null);
  assert.ok(app.root.textContent.includes(payload));
  assert.equal(app.root.querySelector('math').getAttribute('aria-label'), payload);
  const bad = mount(fixture('answer', { title: 'Invalid formula', math: { tag: 'iframe', text: payload } }));
  t.after(bad.close);
  assert.ok(bad.root.querySelector('[role="alert"]'));
  assert.equal(bad.root.querySelector('math, iframe'), null);
});

const chart = (points, overrides = {}) => fixture('line-chart', {
  xLabel: '时间', yLabel: '速度', xUnit: 's', yUnit: 'm/s', seriesLabel: '实际速度', points, ...overrides
});

function renderedChart(app, input) {
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.deepEqual(app.consoleErrors, []);
  const svg = app.root.querySelector('svg[role="img"]');
  assert.ok(svg, 'The chart needs an accessible graphic');
  assert.ok(svg.querySelector('title')?.textContent.trim());
  assert.ok(svg.querySelector('desc')?.textContent.trim());
  const frame = svg.querySelector('[data-chart-frame]');
  assert.ok(frame);
  const bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map(name => [name, Number(frame.getAttribute(name))]));
  assert.ok(Object.values(bounds).every(Number.isFinite));
  assert.ok(bounds.width > 0 && bounds.height > 0);
  const nodes = [...svg.querySelectorAll('[data-chart-point]')];
  assert.equal(nodes.length, input.length);
  const output = nodes.map((node, index) => {
    assert.equal(Number(node.getAttribute('data-x')), input[index].x);
    assert.equal(Number(node.getAttribute('data-y')), input[index].y);
    const x = Number(node.getAttribute('cx'));
    const y = Number(node.getAttribute('cy'));
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= bounds.x - 1e-8 && x <= bounds.x + bounds.width + 1e-8, `x coordinate ${x} outside chart`);
    assert.ok(y >= bounds.y - 1e-8 && y <= bounds.y + bounds.height + 1e-8, `y coordinate ${y} outside chart`);
    return { x, y };
  });
  const line = svg.querySelector('[data-chart-line]');
  const points = line.getAttribute('points').trim().split(/\s+/).map(point => point.split(',').map(Number));
  assert.equal(points.length, input.length);
  points.forEach(([x, y], index) => { closeTo(x, output[index].x); closeTo(y, output[index].y); });
  assert.doesNotMatch(svg.innerHTML, /NaN|Infinity/);
  return output;
}

test('line chart maps negative x and y values faithfully, with readable axes and underlying data', t => {
  const input = [{ x: -3, y: -10 }, { x: -1, y: 0 }, { x: 1, y: 10 }];
  const app = mount(chart(input));
  t.after(app.close);
  const output = renderedChart(app, input);
  assert.ok(output[0].x < output[1].x && output[1].x < output[2].x);
  assert.ok(output[0].y > output[1].y && output[1].y > output[2].y, 'Higher values must plot higher');
  closeTo(output[1].x, (output[0].x + output[2].x) / 2);
  closeTo(output[1].y, (output[0].y + output[2].y) / 2);
  assert.match(app.root.querySelector('[data-axis="x"]').textContent, /时间/);
  assert.match(app.root.querySelector('[data-axis="y"]').textContent, /速度/);
  const table = app.root.querySelector('details table');
  assert.ok(table, 'A chart must expose its exact source data as text');
  assert.equal(table.querySelectorAll('tbody tr').length, input.length);
  assert.match(table.textContent, /-3/);
  assert.match(table.textContent, /-10/);
});

test('constant and small chart coordinates remain finite and preserve their data relationships', t => {
  for (const input of [
    [{ x: 0, y: -4 }, { x: 1, y: -4 }, { x: 2, y: -4 }],
    [{ x: -1e12, y: 0 }, { x: 0, y: 0 }, { x: 1e12, y: 0 }],
    [{ x: 0, y: 1 }, { x: 1e-300, y: 2 }, { x: 2e-300, y: 3 }]
  ]) {
    const app = mount(chart(input));
    t.after(app.close);
    const output = renderedChart(app, input);
    assert.ok(output[0].x < output[1].x && output[1].x < output[2].x);
    closeTo(output[1].x, (output[0].x + output[2].x) / 2);
    if (input[0].y === input[2].y) {
      closeTo(output[0].y, output[1].y);
      closeTo(output[1].y, output[2].y);
    } else {
      assert.ok(output[0].y > output[1].y && output[1].y > output[2].y);
    }
  }
});

test('degenerate, unsorted and unsupported chart data fails visibly instead of inventing a curve', t => {
  const invalid = [
    [], [{ x: 0, y: 1 }],
    [{ x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: '0', y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: null }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1e13, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: -1e13 }],
    Array.from({ length: 81 }, (_, x) => ({ x, y: x }))
  ];
  for (const input of invalid) {
    const app = mount(chart(input));
    t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'), `Must reject invalid data ${JSON.stringify(input).slice(0, 100)}`);
    assert.equal(app.root.querySelector('svg'), null);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('line chart source labels and notes are inert text, with no invented action', t => {
  const payload = '<img src=x onerror="window.__injected=true">';
  const app = mount(chart([{ x: 0, y: 1 }, { x: 1, y: 0 }], {
    xLabel: payload, yLabel: payload, seriesLabel: payload, xUnit: '<img src=x>', note: payload
  }));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(app.window.__injected, undefined);
  assert.equal(app.root.querySelector('img, script, button'), null);
  assert.ok(app.root.textContent.includes(payload));
});

test('composed HTML safely survives actual script parsing and renders separate fragments independently', t => {
  const injected = '</script><script>window.__injected=true</script><img src=x onerror="window.__injected=true">';
  const first = compose(fixture('profile', { name: injected, summary: '安全文本' }), 'chatui-composed-profile');
  const second = compose(fixture('progress', { value: 3, total: 4, label: '独立进度' }), 'chatui-composed-progress');
  const dom = new JSDOM(first + second, { runScripts: 'dangerously', url: 'https://chatui-component.test/', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  assert.equal(dom.window.__injected, undefined);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelectorAll('script').length, 4);
  assert.equal(document.querySelector('#chatui-composed-profile h3').textContent, injected);
  const progress = document.querySelector('#chatui-composed-progress [role="progressbar"]');
  assert.equal(progress.getAttribute('aria-valuenow'), '3');
  assert.equal(progress.firstElementChild.style.width, '75%');
  assert.equal(document.querySelector('#chatui-composed-profile [role="progressbar"]'), null);
});

test('two form-free quizzes keep their radio choices and scores independent', t => {
  const source = compose(quiz(), 'chatui-quiz-first') + compose(quiz(), 'chatui-quiz-second');
  const dom = new JSDOM(source, { runScripts: 'dangerously', url: 'https://chatui-component.test/', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const first = dom.window.document.querySelector('#chatui-quiz-first');
  const second = dom.window.document.querySelector('#chatui-quiz-second');
  assert.equal(dom.window.document.querySelector('form'), null);
  first.querySelector('input[value="negative"]').click();
  second.querySelector('input[value="positive"]').click();
  first.querySelector('input[value="zero"]').click();
  second.querySelector('input[value="nine"]').click();
  assert.equal(first.querySelectorAll('input:checked').length, 2);
  assert.equal(second.querySelectorAll('input:checked').length, 2);
  first.querySelector('button').click();
  second.querySelector('button').click();
  assert.match(first.textContent, /2 \/ 2 正确/);
  assert.match(second.textContent, /0 \/ 2 正确/);
});

const forceDiagram = (forces, overrides = {}) => fixture('force-diagram', { body: '物块', unit: 'N', forces, ...overrides });
const force = (id, fx, fy, label = id) => ({ id, label, fx, fy });
const forceSum = app => {
  const output = app.root.querySelector('[data-force-sum]');
  return ['fx', 'fy', 'magnitude'].map(name => Number(output.getAttribute(`data-${name}`)));
};
const forceToggle = (app, key) => app.root.querySelector(`[data-force-toggle="${key}"]`).click();

test('force diagram draws (3,4) with magnitude 5 and flips physical y only at the SVG boundary', t => {
  const app = mount(forceDiagram([force('pull', 3, 4, '拉力')]));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  const arrow = app.root.querySelector('[data-force-kind="real"]');
  assert.ok(arrow);
  assert.equal(Number(arrow.getAttribute('data-magnitude')), 5);
  const dx = Number(arrow.getAttribute('x2')) - Number(arrow.getAttribute('x1'));
  const dy = Number(arrow.getAttribute('y2')) - Number(arrow.getAttribute('y1'));
  assert.ok(dx > 0 && dy < 0);
  closeTo(dx / 3, -dy / 4);
  assert.equal(app.root.querySelectorAll('[data-force-kind="component"], [data-force-kind="resultant"]').length, 0);
  assert.ok([...app.root.querySelectorAll('input[type="checkbox"]')].every(input => !input.checked));
  assert.ok(app.root.querySelector('[data-force-sum]').hidden);
  assert.match(app.root.querySelector('table').textContent, /拉力345/);
  assert.match(app.root.textContent, /\+x 向右，\+y 向上/);
  assert.match(app.root.textContent, /二维质点/);
});

test('force resultant uses only actual forces and every arrow shares one stable length scale', t => {
  const forces = [force('pull', 6, 0), force('friction', -2, 0), force('normal', 0, 10), force('weight', 0, -10)];
  const app = mount(forceDiagram(forces));
  t.after(app.close);
  assert.deepEqual(forceSum(app), [4, 0, 4]);
  const arrowsBefore = [...app.root.querySelectorAll('[data-force-kind="real"]')].map(node => node.outerHTML);
  const scales = [...app.root.querySelectorAll('[data-force-kind="real"]')].map(node => Math.hypot(Number(node.getAttribute('x2')) - Number(node.getAttribute('x1')), Number(node.getAttribute('y2')) - Number(node.getAttribute('y1'))) / Number(node.getAttribute('data-magnitude')));
  scales.forEach(value => closeTo(value, scales[0]));
  forceToggle(app, 'showResultant');
  forceToggle(app, 'showComponents');
  assert.deepEqual(forceSum(app), [4, 0, 4]);
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 4);
  assert.deepEqual([...app.root.querySelectorAll('[data-force-kind="real"]')].map(node => node.outerHTML), arrowsBefore);
  const resultant = app.root.querySelector('[data-force-kind="resultant"]');
  assert.equal(Number(resultant.getAttribute('data-fx')), 4);
  assert.equal(Number(resultant.getAttribute('data-fy')), 0);
  closeTo(Number(resultant.getAttribute('x2')) - Number(resultant.getAttribute('x1')), 4 * scales[0]);
  assert.equal(app.saves.at(-1).modelContent.resultant.fx, 4);
});

test('rotated-axis gravity components recombine into the real force without entering the resultant twice', t => {
  const app = mount(forceDiagram([force('gravity', 0, -20, '重力')], { axisAngle: 30 }));
  t.after(app.close);
  forceToggle(app, 'showComponents');
  const projection = app.root.querySelector('[data-projection-values]');
  closeTo(Number(projection.getAttribute('data-fx-prime')), -10);
  closeTo(Number(projection.getAttribute('data-fy-prime')), -10 * Math.sqrt(3));
  const components = [...app.root.querySelectorAll('[data-force-kind="component"]')];
  assert.equal(components.length, 2);
  closeTo(components.reduce((sum, node) => sum + Number(node.getAttribute('data-fx')), 0), 0);
  closeTo(components.reduce((sum, node) => sum + Number(node.getAttribute('data-fy')), 0), -20);
  assert.ok(components.every(node => node.getAttribute('stroke-dasharray')));
  assert.deepEqual(forceSum(app), [0, -20, 20]);
  assert.equal(app.root.querySelectorAll('[data-force-kind="real"]').length, 1);
  forceToggle(app, 'showComponents');
  assert.equal(app.root.querySelector('[data-force-kind="component"]'), null);
  assert.deepEqual(forceSum(app), [0, -20, 20]);
});

test('balanced and zero forces do not invent a direction arrow', t => {
  for (const forces of [[force('up', 0, 10), force('down', 0, -10)], [force('zero', 0, 0)]]) {
    const app = mount(forceDiagram(forces));
    t.after(app.close);
    forceToggle(app, 'showResultant');
    assert.deepEqual(forceSum(app), [0, 0, 0]);
    assert.equal(app.root.querySelector('[data-force-kind="resultant"]'), null);
    assert.match(app.root.querySelector('[data-force-sum]').textContent, /合力为 0 N/);
    if (forces.length === 1) assert.equal(app.root.querySelector('[data-force-kind="real"]'), null);
    assert.doesNotMatch(app.root.querySelector('svg').outerHTML, /NaN|Infinity/);
  }
});

test('force diagram preserves a small true residual when large opposite forces cancel', t => {
  const app = mount(forceDiagram([force('large', 1e12, 0), force('small', 1e-6, 0), force('opposite', -1e12, 0)]));
  t.after(app.close);
  assert.deepEqual(forceSum(app), [1e-6, 0, 1e-6]);
  forceToggle(app, 'showResultant');
  assert.doesNotMatch(app.root.querySelector('[data-force-sum]').textContent, /合力为 0 N/);
});

test('direction-only force diagrams use equal lengths, real angles, and no fabricated magnitudes or decomposition controls', t => {
  const app = mount(fixture('force-diagram', { body: '小球', mode: 'direction', forces: [{ id: 'tension', label: '绳拉力', angle: 30 }, { id: 'weight', label: '重力', angle: -90 }] }));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.match(app.root.textContent, /大小未知/);
  assert.equal(app.root.querySelector('input, select, [data-force-sum], [data-projection-values]'), null);
  const arrows = [...app.root.querySelectorAll('[data-force-kind="real"]')];
  assert.equal(arrows.length, 2);
  const deltas = arrows.map(node => [Number(node.getAttribute('x2')) - Number(node.getAttribute('x1')), Number(node.getAttribute('y2')) - Number(node.getAttribute('y1'))]);
  closeTo(Math.hypot(...deltas[0]), Math.hypot(...deltas[1]));
  closeTo(-deltas[0][1] / deltas[0][0], Math.tan(Math.PI / 6));
  assert.ok(deltas[1][1] > 0);
  assert.ok(arrows.every(node => node.getAttribute('data-magnitude') === 'unknown'));
});

test('force diagram rejects invalid values, mixed definitions, units and components supplied as additional forces', t => {
  const valid = forceDiagram([force('a', 3, 4)]);
  const invalid = [
    { ...valid.data, forces: [] },
    { ...valid.data, forces: [force('a', 1, 0), force('a', 2, 0)] },
    { ...valid.data, forces: [force('a', 1e13, 0)] },
    { ...valid.data, forces: [force('a', '3', 4)] },
    { ...valid.data, forces: [force('a', Infinity, 0)] },
    { ...valid.data, forces: [force('a', NaN, 0)] },
    { ...valid.data, forces: [{ ...force('a', 3, 4), kind: 'component' }] },
    { ...valid.data, forces: [{ ...force('a', 3, 4), angle: 90 }] },
    { ...valid.data, forces: [{ ...force('a', 3, 4), tone: 'red' }] },
    { ...valid.data, unit: 'kg' },
    { ...valid.data, body: {} },
    { ...valid.data, axisAngle: 400 },
    { ...valid.data, mode: 'guessed' },
    { body: '小球', mode: 'direction', forces: [{ id: 'a', label: '未知', angle: null }] },
    { body: '小球', mode: 'direction', unit: 'N', forces: [{ id: 'a', label: '未知', angle: 45 }] }
  ];
  for (const data of invalid) {
    const app = mount({ ...valid, data });
    t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'), `Invalid force data accepted: ${JSON.stringify(data)}`);
    assert.equal(app.root.querySelector('svg'), null);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('force labels, body and notes remain inert text while selection controls update the chosen decomposition', t => {
  const payload = '<img src=x onerror="window.__injected=true">';
  const app = mount(forceDiagram([force('first', 3, 4, payload), force('__proto__', -2, 0, '另一个力')], { body: payload, note: payload }));
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(app.window.__injected, undefined);
  assert.equal(app.root.querySelector('img, script'), null);
  assert.ok(app.root.textContent.includes(payload));
  forceToggle(app, 'showComponents');
  const selection = app.root.querySelector('select');
  selection.value = '__proto__';
  selection.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  assert.equal(Number(app.root.querySelector('[data-projection-values]').getAttribute('data-fx-prime')), -2);
  assert.equal(Number(app.root.querySelector('[data-projection-values]').getAttribute('data-fy-prime')), 0);
  assert.deepEqual(forceSum(app), [1, 4, Math.sqrt(17)]);
});

test('force display preferences restore for identical content, never another physical problem', t => {
  const config = forceDiagram([force('a', 3, 4)]);
  const first = mount(config);
  t.after(first.close);
  forceToggle(first, 'showComponents');
  forceToggle(first, 'showResultant');
  const saved = first.saves.at(-1);
  const restored = mount(config, { saved });
  t.after(restored.close);
  assert.equal(restored.root.querySelectorAll('[data-force-kind="component"]').length, 2);
  assert.ok(restored.root.querySelector('[data-force-kind="resultant"]'));
  const next = mount(forceDiagram([force('a', -3, -4)]), { saved });
  t.after(next.close);
  assert.equal(next.root.querySelectorAll('[data-force-kind="component"], [data-force-kind="resultant"]').length, 0);
  assert.deepEqual(forceSum(next), [-3, -4, 5]);
});

test('dense force figures at narrow widths keep numbered labels separated and preserve the complete force table', t => {
  const app = mount(forceDiagram(Array.from({ length: 12 }, (_, index) => force(`f${index}`, 3, 0))), { width: 280 });
  t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.equal(app.root.querySelectorAll('[data-force-kind="real"]').length, 12);
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 12);
  const labels = [...app.root.querySelectorAll('[data-force-number]')].map(node => [Number(node.getAttribute('x')), Number(node.getAttribute('y'))]);
  assert.ok(labels.length > 0);
  for (const [index, label] of labels.entries()) {
    assert.ok(label[0] >= 16 && label[0] <= 264);
    assert.ok(label[1] >= 16 && label[1] <= 269);
    labels.slice(index + 1).forEach(other => assert.ok(Math.abs(other[0] - label[0]) >= 24 || Math.abs(other[1] - label[1]) >= 22));
  }
  assert.match(app.root.textContent, /同向箭头可能重合/);
});

test('separately composed force diagrams use independent SVG marker IDs and safely parse malicious labels', t => {
  const payload = '</script><script>window.__injected=true</script>';
  const config = forceDiagram([force('a', 3, 4, payload)]);
  const source = compose(config, 'chatui-force-first') + compose(config, 'chatui-force-second');
  const dom = new JSDOM(source, { runScripts: 'dangerously', url: 'https://chatui-component.test/', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  assert.equal(dom.window.__injected, undefined);
  const ids = [...document.querySelectorAll('marker')].map(marker => marker.id);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, ids.length);
  for (const root of document.querySelectorAll('div[id^="chatui-force-"]')) {
    assert.ok(root.textContent.includes(payload));
    for (const arrow of root.querySelectorAll('[marker-end]')) {
      const id = arrow.getAttribute('marker-end').slice(5, -1);
      assert.ok(id.startsWith(root.id));
      assert.ok(root.querySelector(`marker[id="${id}"]`));
    }
  }
});
