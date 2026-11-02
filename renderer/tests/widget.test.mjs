import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { widgetHtml } from '../lib/widget.generated.mjs';
import { TYPES } from '../lib/component-validation.mjs';
import { handleMcp } from '../lib/mcp.mjs';
import { projectQuizResult } from '../lib/quiz-boundary.mjs';
const fixture = JSON.parse(readFileSync(new URL('../lib/vendor/component-examples.json', import.meta.url)));
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function host(t, { rejectMessage = false, deferContext = false } = {}) {
  const errors = [], outbound = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(widgetHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid/', virtualConsole });
  const { window } = dom;
  const parent = { postMessage(message) {
    outbound.push(copy(message));
    if (deferContext && message.method === 'ui/update-model-context') return;
    if (message.id !== undefined) queueMicrotask(() => {
      let result = {};
      if (message.method === 'ui/initialize') result = { protocolVersion: '2026-01-26', hostCapabilities: { message: {}, updateModelContext: { structuredContent: {} }, openLinks: {} }, hostContext: { theme: 'dark' } };
      if (message.method === 'ui/message' && rejectMessage) result = { isError: true };
      send({ jsonrpc: '2.0', id: message.id, result });
    });
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  const send = message => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: message }));
  const deliver = config => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: projectQuizResult({ structuredContent: copy(config) }) });
  for (const script of window.document.querySelectorAll('script')) window.eval(script.textContent);
  await tick();
  t.after(() => { send({ jsonrpc: '2.0', id: 'teardown', method: 'ui/resource-teardown' }); dom.window.close(); });
  return { window, root: window.document.querySelector('#chatui-component'), outbound, errors, send, deliver, button: label => [...window.document.querySelectorAll('button')].find(b => b.textContent === label) };
}

test('standard handshake precedes rendering; all 17 templates mount from actual tool results', async t => {
  const app = await host(t);
  assert.equal(app.outbound[0].method, 'ui/initialize');
  assert.ok(app.outbound.some(m => m.method === 'ui/notifications/initialized'));
  assert.equal(app.root.children.length, 0);
  for (const type of TYPES) {
    const config = copy(fixture[type]); if (type === 'media-panel') config.data.items.forEach(item => delete item.imageUrl);
    app.deliver(config);
    assert.ok(app.root.children.length, type);
    assert.equal(app.window.document.querySelector('#chatui-status').textContent, '', type);
  }
  assert.deepEqual(app.errors, []);
});

test('generated widget rejects full-slider geometry underflow before painting or saving zero area', async t => {
  const app = await host(t);
  for (const radius of [2e-162, 1e-160, 1e-153]) {
    app.deliver(copy(fixture.geometry));
    assert.ok(app.root.querySelector('svg'));
    const config = { schemaVersion: 1, contentId: 'geometry-numeric-limit', type: 'geometry', data: { radius, heightRatio: 1.5, unit: 'm' } };
    app.deliver(config); // Browser-side validation must also defend forged host results.
    assert.equal(app.root.querySelector('svg, input'), null);
    assert.match(app.window.document.querySelector('#chatui-status').textContent, /半径/);
    const result = await serverResult(config);
    assert.equal(result.isError, true); assert.equal(result.structuredContent, undefined);
  }
  assert.deepEqual(app.errors, []);
});

test('forces use given g=10 inputs; toggled components never enter sum and changed result resets controls', async t => {
  const app = await host(t);
  const config = { schemaVersion: 1, contentId: 'slope-g10', title: '斜面', type: 'force-diagram', data: { body: '2 kg 物块，g=10', unit: 'N', axisAngle: 30, forces: [{ id: 'weight', label: '重力', fx: 0, fy: -20 }] } };
  app.deliver(config);
  assert.equal(app.root.querySelector('[data-force-kind="real"]').getAttribute('data-fy'), '-20');
  app.root.querySelector('[data-force-toggle="showResultant"]').click();
  app.root.querySelector('[data-force-toggle="showComponents"]').click();
  const resultant = app.root.querySelector('[data-force-kind="resultant"]');
  assert.equal(resultant.getAttribute('data-fy'), '-20');
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 1);
  assert.equal(app.root.querySelectorAll('[data-force-kind="component"]').length, 2);
  app.deliver(config); // Duplicate host notification preserves in-progress UI.
  assert.equal(app.root.querySelector('[data-force-toggle="showComponents"]').checked, true);
  app.deliver({ ...config, data: { ...config.data, forces: [{ id: 'weight', label: '重力', fx: 0, fy: -30 }] } });
  assert.equal(app.root.querySelector('[data-force-kind="real"]').getAttribute('data-fy'), '-30');
  assert.equal(app.root.querySelector('[data-force-toggle="showComponents"]').checked, false);
});

test('computed incline tool results mount unchanged; controls retain physical sums across decomposition and new angles', async t => {
  const app = await host(t);
  const problem = { massKg: 2, gravityMps2: 10, inclineDeg: 30, contentId: 'computed-slope' };
  const near = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) < 1e-10, `${actual} != ${expected}`);
  const render = async fields => {
    const result = await serverResult({ ...problem, ...fields }, 'render_incline_forces');
    assert.equal(result.isError, undefined);
    app.deliver(result.structuredContent);
    assert.equal(app.window.document.querySelector('#chatui-status').textContent, '');
    return result.structuredContent.data.calculation;
  };
  const thirty = await render({});
  assert.match(app.root.textContent, /g=10 m\/s²/);
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 2);
  app.root.querySelector('[data-force-toggle="showResultant"]').click();
  app.root.querySelector('[data-force-toggle="showComponents"]').click();
  const sum = () => app.root.querySelector('[data-force-sum]');
  near(sum().getAttribute('data-fx'), thirty.netForceN.fx);
  near(sum().getAttribute('data-fy'), thirty.netForceN.fy);
  near(app.root.querySelector('[data-projection-values]').getAttribute('data-fx-prime'), -10);
  near(app.root.querySelector('[data-projection-values]').getAttribute('data-fy-prime'), -10 * Math.sqrt(3));
  const selection = app.root.querySelector('select'); selection.value = 'normal'; selection.dispatchEvent(new app.window.Event('change'));
  near(app.root.querySelector('[data-projection-values]').getAttribute('data-fx-prime'), 0);
  near(sum().getAttribute('data-magnitude'), 10);
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 2, 'Mathematical decomposition never adds a force');
  await render({ inclineDeg: 45 });
  assert.equal(app.root.querySelector('[data-force-toggle="showComponents"]').checked, false, 'Updated problem data resets old interaction');
  app.root.querySelector('[data-force-toggle="showResultant"]').click();
  near(sum().getAttribute('data-fx'), -10); near(sum().getAttribute('data-fy'), -10);
  await render({ inclineDeg: 0 });
  app.root.querySelector('[data-force-toggle="showResultant"]').click();
  assert.equal(sum().getAttribute('data-magnitude'), '0');
  assert.equal(app.root.querySelector('[data-force-kind="resultant"]'), null, 'Zero resultant has no direction arrow');
  await render({ inclineDeg: 90 });
  assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 1);
  assert.equal(app.root.querySelector('[data-real-force-row="normal"]'), null);
  assert.match(app.root.textContent, /垂直极限：N=0/);
  assert.deepEqual(app.errors, []);
});

test('quiz reports only real selections; submit computes score; follow-up contains actual results', async t => {
  const app = await host(t);
  const config = { schemaVersion: 1, contentId: 'quiz-real', type: 'quiz', data: { questions: [{ id: 'q1', prompt: '1 + 1 = ?', options: [{ id: 'a', label: '1' }, { id: 'b', label: '2' }], correct: 'b', explanation: '两个一。' }], followUp: '继续讲解' } };
  app.deliver(config); assert.equal(app.root.querySelector('.cui-feedback'), null);
  app.button('提交答案').click(); assert.match(app.root.textContent, /先回答/);
  app.root.querySelector('input[value="b"]').click(); app.button('提交答案').click();
  assert.match(app.root.textContent, /1 \/ 1 正确/);
  app.button('继续讨论本次结果').click(); await tick();
  const message = app.outbound.find(m => m.method === 'ui/message');
  assert.equal(message.params.role, 'user'); assert.match(message.params.content[0].text, /本次实际提交/); assert.match(message.params.content[0].text, /得分：1\/1/);
  app.deliver({ ...config, contentId: 'new-question' });
  assert.equal(app.root.querySelector('input:checked'), null); assert.equal(app.root.querySelector('.cui-feedback'), null);
});

test('host-rejected follow-up is visibly reported, not silently marked sent', async t => {
  const app = await host(t, { rejectMessage: true }); const config = copy(fixture.quiz); app.deliver(config);
  for (const field of app.root.querySelectorAll('fieldset')) field.querySelector('input').click();
  app.button('提交答案').click();
  const next = app.root.querySelector('.cui-result .cui-button-primary'); assert.ok(next); next.click(); await tick();
  assert.match(app.root.textContent, /未能确认继续消息已发送/);
});

test('motion slider updates real formula outputs and resets to new tool input', async t => {
  const app = await host(t); const config = { schemaVersion: 1, contentId: 'motion', type: 'motion-lab', data: { initialVelocity: 20, acceleration: -10, duration: 4 } }; app.deliver(config);
  const time = app.root.querySelector('[data-motion-input="time"]'); time.value = '2'; time.dispatchEvent(new app.window.Event('input')); time.dispatchEvent(new app.window.Event('change'));
  assert.equal(app.root.querySelector('[data-motion-output="velocity"]').textContent, '0 m/s');
  assert.equal(app.root.querySelector('[data-motion-output="position"]').textContent, '20 m');
  app.deliver({ ...config, data: { ...config.data, acceleration: -5 } });
  assert.equal(app.root.querySelector('[data-motion-input="acceleration"]').value, '-5');
  assert.equal(app.root.querySelector('[data-motion-input="time"]').value, '0');
});

test('untrusted strings stay text; forged non-parent messages are ignored; invalid results clear stale UI', async t => {
  const app = await host(t); const payload = '<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
  app.deliver({ ...fixture.profile, data: { name: payload } });
  assert.match(app.root.textContent, /<img/); assert.equal(app.root.querySelector('img,script'), null); assert.equal(app.window.pwned, undefined);
  app.window.dispatchEvent(new app.window.MessageEvent('message', { source: app.window, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: fixture.progress } } }));
  assert.match(app.root.textContent, /<img/);
  app.deliver({ ...fixture.progress, data: { value: 10, total: 0 } });
  assert.equal(app.root.children.length, 0); assert.match(app.window.document.querySelector('#chatui-status').textContent, /进度/);
});

test('theme changes are applied without resetting active interactions; no third-party fonts injected', async t => {
  const app = await host(t); app.deliver(fixture.quiz); app.root.querySelector('input').click();
  app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'light', styles: { css: { fonts: '@import url(https://evil.invalid)' }, variables: { '--color-text-primary': '#123456' } } } });
  assert.equal(app.window.document.documentElement.style.colorScheme, 'light'); assert.ok(app.root.querySelector('input:checked'));
  assert.doesNotMatch(app.window.document.head.innerHTML, /evil.invalid/);
});

test('actual progress tool results preserve both stages through update and theme changes without an aggregate rate', async t => {
  const app = await host(t);
  const config = { schemaVersion: 1, contentId: 'stages-six', type: 'progress', title: '翻译进度', data: { total: 10, unit: '章', stages: [
    { id: 'draft', label: '已成稿', value: 6 },
    { id: 'review', label: '已校对', value: 3, subsetOf: 'draft' }
  ] } };
  const display = async current => {
    const result = await serverResult(current);
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, current, 'Server never invents chapter identities or rewrites the supplied progress');
    assert.equal(originalRendererError(current), null, 'Canonical renderer accepts the successful server data independently');
    app.deliver(result.structuredContent);
    assert.equal(app.window.document.querySelector('#chatui-status').textContent, '');
  };
  const values = () => [...app.root.querySelectorAll('[role="progressbar"]')].map(bar => [bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax'), bar.firstElementChild.style.width]);
  await display(config);
  assert.deepEqual(values(), [['6', '10', '60%'], ['3', '10', '30%']]);
  assert.match(app.root.textContent, /包含于“已成稿”/);
  const update = copy(config); update.contentId = 'stages-seven'; update.data.stages[0].value = 7;
  await display(update);
  assert.deepEqual(values(), [['7', '10', '70%'], ['3', '10', '30%']]);
  assert.doesNotMatch(app.root.textContent, /10\s*\/\s*10|100%|第[一二三四五六七八九十\d]+章/);
  for (const theme of ['light', 'dark']) {
    app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme } });
    assert.equal(app.window.document.documentElement.style.colorScheme, theme);
    assert.deepEqual(values(), [['7', '10', '70%'], ['3', '10', '30%']]);
  }
  await display({ ...config, contentId: 'legacy-progress', data: { value: 6, total: 10, unit: '章' } });
  assert.deepEqual(values(), [['6', '10', '60%']], 'Legacy single value stays supported');
  assert.deepEqual(app.errors, []);
});

test('stage schema and relationship errors are rejected by server and canonical client before any successful result', async () => {
  const stage = { id: 'draft', label: '已成稿', value: 6 };
  const make = data => ({ schemaVersion: 1, contentId: 'invalid-stages', type: 'progress', data });
  const cases = [
    { total: 10, value: 6, stages: [stage] }, { total: 0, stages: [stage] }, { total: '10', stages: [stage] },
    ...[null, [], [null], [[stage]], Array.from({ length: 13 }, (_, i) => ({ ...stage, id: `s${i}` })), [stage, stage]].map(stages => ({ total: 10, stages })),
    ...[
      { id: '', label: '阶段', value: 0 }, { ...stage, id: 'x'.repeat(81) }, { ...stage, label: ' ' }, { ...stage, label: 'x'.repeat(161) },
      { ...stage, value: '6' }, { ...stage, value: null }, { ...stage, value: 11 }, { ...stage, value: -1 },
      { ...stage, subsetOf: null }, { ...stage, subsetOf: 'x'.repeat(81) }, { ...stage, subsetOf: 'missing' }, { ...stage, subsetOf: 'draft' }, { ...stage, extra: true }
    ].map(bad => ({ total: 10, stages: [bad] })),
    { total: 10, stages: [stage, { id: 'review', label: '已校对', value: 7, subsetOf: 'draft' }] },
    { total: 10, stages: [{ ...stage, subsetOf: 'review' }, { id: 'review', label: '已校对', value: 6, subsetOf: 'draft' }] },
    { total: 10, stages: [{ id: 'a', label: 'A', value: 6, subsetOf: 'b' }, { id: 'b', label: 'B', value: 6, subsetOf: 'c' }, { id: 'c', label: 'C', value: 6, subsetOf: 'a' }] }
  ];
  for (const data of cases) {
    const config = make(data);
    assert.ok(originalRendererError(config), JSON.stringify(data));
    const result = await serverResult(config);
    assert.equal(result.isError, true, JSON.stringify(data));
    assert.equal(result.structuredContent, undefined);
  }
  for (const stages of [
    [{ ...stage, id: 'x'.repeat(80), label: '中'.repeat(160), value: 0 }],
    Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `阶段${i}`, value: 10 - i / 2, ...(i ? { subsetOf: `s${i - 1}` } : {}) })).reverse(),
    [{ ...stage, value: 5e307 }, { id: 'review', label: '已校对', value: 0, subsetOf: stage.id }]
  ]) {
    const config = make({ total: stages[0].value > 10 ? 1e308 : 10, stages });
    const result = await serverResult(config);
    assert.equal(result.isError, undefined, JSON.stringify(config));
    assert.deepEqual(result.structuredContent, config);
    assert.equal(originalRendererError(config), null);
  }
});

test('remount and error cancel old pending state; late rejected context cannot overwrite a new component', async t => {
  const app = await host(t, { deferContext: true });
  const change = () => app.root.querySelector('input').click();
  const pause = () => new Promise(resolve => setTimeout(resolve, 240));
  const updates = () => app.outbound.filter(message => message.method === 'ui/update-model-context');
  app.deliver(fixture.quiz); change();
  app.deliver(fixture.progress); await pause();
  assert.equal(updates().length, 0, 'Old debounce is cancelled by remount');
  app.deliver(fixture.quiz); change();
  app.deliver({ ...fixture.progress, data: { value: 1, total: 0 } }); await pause();
  assert.equal(updates().length, 0, 'Old debounce is cancelled by rejected data');
  app.deliver(fixture.quiz); change(); await pause();
  assert.equal(updates().length, 1, 'An actual stable interaction sends context');
  app.deliver(fixture.progress);
  app.send({ jsonrpc: '2.0', id: updates()[0].id, result: { isError: true } }); await tick();
  assert.equal(app.window.document.querySelector('#chatui-status').textContent, '', 'Old asynchronous failure cannot alter the new result');
  assert.match(app.root.textContent, /6/);
});

// Exercise the unchanged canonical renderer directly. Going through our bridge
// would run the same validator twice and could hide a server/client mismatch.
const rawKit = readFileSync(new URL('../lib/vendor/component-kit.html', import.meta.url), 'utf8').match(/<script>\s*([\s\S]*?)<\/script>\s*$/)[1];
function fixtureVariant(type, path = [], value) {
  const config = copy(fixture[type]);
  if (type === 'media-panel') config.data.items.forEach(item => delete item.imageUrl);
  if (path.length) {
    let target = config.data;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
  }
  return config;
}
function originalRendererError(config) {
  const dom = new JSDOM('<div id="chatui-component"></div><script type="application/json" id="chatui-component-config"></script>', { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    dom.window.document.querySelector('#chatui-component-config').textContent = JSON.stringify(config);
    dom.window.eval(rawKit);
    const root = dom.window.document.querySelector('#chatui-component');
    assert.ok(root.children.length, `${config.type} must render content or an explicit error`);
    const message = root.querySelector(':scope > .cui-error[role="alert"]');
    return message?.textContent ?? null;
  } finally { dom.window.close(); }
}
async function serverResult(config, name = 'render_component') {
  const request = new Request('https://renderer.test/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'test-only', 'oai-authenticated-user-email': 'test@example.invalid' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: config } })
  });
  return (await (await handleMcp(request)).json()).result;
}

test('all 17 tool-success fixtures are independently accepted by the unchanged canonical renderer', async () => {
  for (const type of TYPES) {
    const config = fixtureVariant(type);
    assert.equal((await serverResult(config)).isError, undefined, type);
    assert.equal(originalRendererError(config), null, type);
  }
});

test('client rejection cases never produce successful tool data, including optional fields and coercion', async () => {
  const cases = [
    ['progress', ['value'], -1], ['progress', ['details'], [{ toString: 42 }]],
    ['timeline', ['items'], []], ['profile', ['tags'], [{ toString: 42 }]],
    ['comparison', ['items'], []], ['steps', ['items', 0, 'math'], { tag: 'script' }],
    ['rhythm', ['items', 0, 'emphasis'], 'big'], ['quiz', ['questions', 0, 'correct'], 'missing'],
    ['geometry', ['radius'], 0], ['answer', ['title'], ''], ['line-chart', ['points', 1, 'x'], -1e12],
    ['force-diagram', ['mode'], null], ['motion-lab', ['duration'], 0],
    ['media-panel', ['items', 0, 'sourceUrl'], ['https://example.com']],
    ['tabs', ['items', 0, 'title'], ''], ['reveal-steps', ['items', 0, 'math'], 'x'],
    ['data-table', ['filterLabel'], 42],
    ...[42, null, 'x'.repeat(1001)].map(value => ['force-diagram', ['note'], value]),
    ...[42, 'x'.repeat(25)].flatMap(value => ['xUnit', 'yUnit'].map(key => ['line-chart', [key], value])),
    ...[42, 'x'.repeat(1001)].map(value => ['tabs', ['note'], value]),
    ['tabs', ['items', 0, 'title'], 'x'.repeat(161)],
    ...[null, Array(13).fill('x'), [42], [''], ['x'.repeat(1001)]].map(value => ['tabs', ['items', 0, 'points'], value]),
    ['reveal-steps', ['items', 0, 'math'], null],
    ...[42, ' ', 'x'.repeat(1001)].map(value => ['reveal-steps', ['items', 0, 'mathLabel'], value]),
    ...['', 'x'.repeat(81)].map(value => ['data-table', ['filterLabel'], value]),
    ...[42, '', 'x'.repeat(501)].map(value => ['media-panel', ['items', 0, 'caption'], value]),
    ...[42, '', 'x'.repeat(301)].map(value => ['media-panel', ['items', 0, 'credit'], value]),
    ['media-panel', ['items', 0, 'sourceUrl'], 'https://example.com/' + 'x'.repeat(2029)]
  ];
  for (const [type, path, value] of cases) {
    const config = fixtureVariant(type, path, value), label = `${type}.${path.join('.')}: ${JSON.stringify(value).slice(0, 35)}`;
    assert.ok(originalRendererError(config), `Regression input must reproduce the original client rejection: ${label}`);
    const result = await serverResult(config);
    assert.equal(result.isError, true, label);
    assert.equal(result.structuredContent, undefined, label);
  }
});

test('valid optional-field boundaries retain tool/client agreement instead of being over-rejected', async () => {
  const cases = [
    ['force-diagram', ['note'], ''], ['force-diagram', ['note'], 'x'.repeat(1000)],
    ['line-chart', ['xUnit'], ''], ['line-chart', ['yUnit'], 'x'.repeat(24)],
    ['tabs', ['note'], 'x'.repeat(1000)], ['tabs', ['items', 0, 'title'], 'x'.repeat(160)],
    ['tabs', ['items', 0, 'points'], Array(12).fill('x'.repeat(1000))],
    ['reveal-steps', ['items', 0, 'math'], { tag: 'mrow', children: ['x', { tag: 'mo', text: '=' }, { tag: 'mn', text: '1' }] }],
    ['reveal-steps', ['items', 0, 'mathLabel'], 'x'.repeat(1000)],
    ['data-table', ['filterLabel'], 'x'.repeat(80)],
    ['media-panel', ['items', 0, 'caption'], 'x'.repeat(500)],
    ['media-panel', ['items', 0, 'credit'], 'x'.repeat(300)],
    ['media-panel', ['items', 0, 'sourceUrl'], 'https://example.com/' + 'x'.repeat(2028)]
  ];
  for (const [type, path, value] of cases) {
    const config = fixtureVariant(type, path, value), label = `${type}.${path.join('.')}`;
    const result = await serverResult(config);
    assert.equal(result.isError, undefined, label);
    assert.deepEqual(result.structuredContent, config, label);
    assert.equal(originalRendererError(config), null, label);
  }
});
