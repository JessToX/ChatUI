import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { explanationHtml } from '../lib/explanation.generated.mjs';
import { TYPES, COMPONENT_DATA_DESCRIPTION } from '../lib/component-validation.mjs';
import { validateExplanation, resolveExplanation, formatFact, EXPLANATION_SCHEMA } from '../lib/explanation-validation.mjs';
import { handleMcp, EXPLANATION_RESOURCE_URI, RESOURCE_URI } from '../lib/mcp.mjs';
import { learningExample, writingExample, progressExample, causalExample } from '../examples/explanations.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../lib/vendor/component-examples.json', import.meta.url)));
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = () => new Promise(resolve => setTimeout(resolve, 240));
const prose = (id = 'intro', text = '只显示已知事实。') => ({ id, kind: 'prose', text });
const config = blocks => ({ schemaVersion: 1, contentId: 'composition-test', facts: {}, blocks });
const legacy = (type, id) => {
  const fixture = copy(fixtures[type]);
  if (type === 'media-panel') fixture.data.items.forEach(item => delete item.imageUrl);
  return { id, kind: 'component', type, data: fixture.data, ...(fixture.title ? { title: fixture.title } : {}) };
};
async function rpc(method, params = {}) {
  const request = new Request('https://renderer.test/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'test-only', 'oai-authenticated-user-email': 'test@example.invalid' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  return (await (await handleMcp(request)).json()).result;
}
const tool = snapshot => rpc('tools/call', { name: 'render_explanation', arguments: snapshot });
async function host(t, { widgetState, deferContext = false, deferLinks = false } = {}) {
  const errors = [], outbound = [], saved = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(explanationHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid/', virtualConsole });
  const { window } = dom;
  const send = message => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: message }));
  const parent = { postMessage(message) {
    outbound.push(copy(message));
    if (deferContext && message.method === 'ui/update-model-context') return;
    if (deferLinks && message.method === 'ui/open-link') return;
    if (message.id !== undefined) queueMicrotask(() => {
      const result = message.method === 'ui/initialize' ? {
        protocolVersion: '2026-01-26', hostCapabilities: { message: {}, updateModelContext: { structuredContent: {} }, openLinks: {} }, hostContext: { theme: 'dark' }
      } : {};
      send({ jsonrpc: '2.0', id: message.id, result });
    });
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { widgetState, setWidgetState: payload => { saved.push(copy(payload)); } };
  for (const script of window.document.querySelectorAll('script')) window.eval(script.textContent);
  await tick();
  const root = window.document.querySelector('#chatui-component');
  const deliver = result => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: copy(result) });
  const restore = state => window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: copy(state) } } }));
  t.after(() => { send({ jsonrpc: '2.0', id: 'teardown', method: 'ui/resource-teardown' }); dom.window.close(); });
  return { window, root, outbound, saved, errors, send, deliver, restore, block: id => root.querySelector(`[data-block-id="${id}"]`), status: () => window.document.querySelector('#chatui-status').textContent };
}

test('discovery exposes an independently rooted, typed explanation resource while preserving legacy entry points', async () => {
  const tools = (await rpc('tools/list')).tools;
  assert.deepEqual(tools.map(item => item.name), ['render_html', 'render_response', 'render_component', 'render_incline_forces', 'render_explanation', 'render_document']);
  const explanation = tools.find(tool => tool.name === 'render_explanation');
  assert.equal(explanation._meta.ui.resourceUri, EXPLANATION_RESOURCE_URI);
  assert.notEqual(EXPLANATION_RESOURCE_URI, RESOURCE_URI);
  assert.deepEqual(explanation.inputSchema, EXPLANATION_SCHEMA);
  assert.deepEqual(EXPLANATION_SCHEMA.$defs.component.properties.type.enum, TYPES);
  assert.equal(EXPLANATION_SCHEMA.$defs.component.properties.data.description, COMPONENT_DATA_DESCRIPTION);
  assert.equal(tools.find(tool => tool.name === 'render_component').inputSchema.properties.data.description, COMPONENT_DATA_DESCRIPTION);
  assert.deepEqual(EXPLANATION_SCHEMA.$defs.textFactRef.required, ['fact', 'format']);
  assert.deepEqual(EXPLANATION_SCHEMA.$defs.textFactRef.properties.format.enum, ['text', 'quantity', 'unit', 'label']);
  assert.equal(EXPLANATION_SCHEMA.$defs.mathNode.anyOf[0].anyOf[1].$ref, '#/$defs/textFactRef');
  const resources = (await rpc('resources/list')).resources;
  assert.equal(resources.length, 4);
  const resource = (await rpc('resources/read', { uri: EXPLANATION_RESOURCE_URI })).contents[0];
  assert.equal(resource.text, explanationHtml);
  assert.equal(resource._meta.ui.prefersBorder, false);
  assert.match(resource.text, /data-renderer="explanation"/);
  assert.equal((await rpc('resources/read', { uri: 'ui://chatui/renderer-v1.html' })).contents[0].mimeType, 'text/html;profile=mcp-app');
});

test('one immutable facts dictionary resolves values, units, text, labels and safe MathML consistently', () => {
  const input = config([
    prose('intro', '{{speed}} / {{speed|text}} / {{speed|unit}} / {{speed|label}}'),
    { id: 'math', kind: 'math', math: { tag: 'mn', text: { fact: 'speed', format: 'text' } } },
    { id: 'motion', kind: 'component', type: 'motion-lab', data: { initialVelocity: { fact: 'speed' }, acceleration: -10, duration: 4 } }
  ]);
  input.facts = { speed: { value: 20, unit: 'm/s', precision: 2, label: '初速度' } };
  assert.equal(validateExplanation(input), input);
  const resolved = resolveExplanation(input);
  assert.equal(resolved.blocks[0].text, '20.00 m/s / 20.00 / m/s / 初速度');
  assert.equal(resolved.blocks[1].math.text, '20.00');
  assert.equal(resolved.blocks[2].data.initialVelocity, 20);
  assert.deepEqual(input.blocks[2].data.initialVelocity, { fact: 'speed' }, 'Authoring snapshot remains unchanged');
  assert.equal(formatFact({ value: -1e-10, unit: 'N', precision: 2 }).split(' ')[0], '-1E-10');
  assert.equal(formatFact({ value: 0, unit: 'N', precision: 2 }), '0.00 N');
  assert.equal(formatFact({ value: '已确认', label: '状态' }, 'label'), '状态');
});

test('the public diagram example is callable and independent label overrides keep each own coordinate bounds', async () => {
  const published = (await rpc('tools/list')).tools.find(item => item.name === 'render_explanation');
  const minimal = JSON.parse(published.description.split('Minimal diagram call: ')[1]);
  assert.doesNotThrow(() => validateExplanation(minimal));
  assert.equal((await tool(minimal)).isError, undefined);
  for (const overrides of [{ labelX: 200 }, { labelY: 160 }, { labelX: 400 }, { labelY: 240 }]) {
    const input = copy(minimal); Object.assign(input.blocks[0].elements[0], overrides);
    assert.doesNotThrow(() => validateExplanation(input));
    assert.deepEqual((await tool(input)).structuredContent, input);
  }
  const referenced = copy(minimal); referenced.facts = { labelPosition: { value: 200 } };
  referenced.blocks[0].elements[0].labelX = { fact: 'labelPosition' };
  assert.doesNotThrow(() => validateExplanation(referenced));
  for (const overrides of [{ labelX: -1 }, { labelX: 401 }, { labelY: -1 }, { labelY: 241 }]) {
    const input = copy(minimal); Object.assign(input.blocks[0].elements[0], overrides);
    assert.throws(() => validateExplanation(input), /标签/);
    assert.equal((await tool(input)).isError, true);
  }
  const primitive = EXPLANATION_SCHEMA.$defs.primitive.oneOf.find(item => item.properties.kind.const === 'arrow');
  assert.match(primitive.properties.labelX.description, /independent/);
  assert.match(primitive.properties.labelY.description, /independent/);
});

test('the actual explanation resource displays independent label overrides with the omitted axis default', async t => {
  const published = (await rpc('tools/list')).tools.find(item => item.name === 'render_explanation');
  const minimal = JSON.parse(published.description.split('Minimal diagram call: ')[1]);
  const app = await host(t);
  for (const [overrides, expected] of [[{ labelX: 100 }, [100, 102]], [{ labelY: 80 }, [200, 80]]]) {
    const input = copy(minimal); Object.assign(input.blocks[0].elements[0], overrides);
    const result = await tool(input); assert.equal(result.isError, undefined); app.deliver(result);
    const label = app.block('relation').querySelector('.cui-diagram-label');
    assert.ok(label); assert.equal(Number(label.getAttribute('x')), expected[0]);
    assert.equal(Number(label.getAttribute('y')), expected[1]);
    assert.equal(label.textContent, 'A → B'); assert.equal(app.status(), '');
  }
  const input = copy(minimal); input.facts = { labelPosition: { value: 180 } };
  input.blocks[0].elements[0].labelX = { fact: 'labelPosition' };
  app.deliver(await tool(input));
  const label = app.block('relation').querySelector('.cui-diagram-label');
  assert.equal(Number(label.getAttribute('x')), 180); assert.equal(Number(label.getAttribute('y')), 102);
  assert.equal(app.status(), ''); assert.deepEqual(app.errors, []);
});

test('diagram cross-field dimensions and unique IDs are explicit and enforce inclusive aspect-ratio boundaries', async () => {
  const published = (await rpc('tools/list')).tools.find(item => item.name === 'render_explanation');
  const minimal = JSON.parse(published.description.split('Minimal diagram call: ')[1]);
  const boxSchema = EXPLANATION_SCHEMA.$defs.diagram.properties.viewBox;
  assert.match(boxSchema.description, /height\/width must be 0\.25–3/);
  for (const key of ['width', 'height']) {
    assert.equal(boxSchema.properties[key].anyOf[0].minimum, 120);
    assert.equal(boxSchema.properties[key].anyOf[0].maximum, 1280);
  }
  for (const viewBox of [{ width: 480, height: 120 }, { width: 120, height: 360 }]) {
    const input = copy(minimal); input.blocks[0].viewBox = viewBox;
    assert.doesNotThrow(() => validateExplanation(input));
  }
  for (const viewBox of [{ width: 481, height: 120 }, { width: 120, height: 361 }, { width: 1280, height: 120 }]) {
    const input = copy(minimal); input.blocks[0].viewBox = viewBox;
    assert.throws(() => validateExplanation(input), /height\/width.*0\.25–3/);
  }
  assert.match(EXPLANATION_SCHEMA.$defs.diagram.properties.elements.description, /unique within this layer/);
  assert.match(EXPLANATION_SCHEMA.$defs.diagram.properties.states.description, /unique state ID/);
  const duplicate = copy(minimal); duplicate.blocks[0].elements.push(copy(duplicate.blocks[0].elements[0]));
  assert.throws(() => validateExplanation(duplicate), /同层图元 id 不能重复/);
});

test('numeric and text fact schemas enforce the same precision distinction as runtime validation', () => {
  const branches = EXPLANATION_SCHEMA.properties.facts.additionalProperties.oneOf;
  const numeric = branches.find(item => item.properties.value.type === 'number');
  const text = branches.find(item => item.properties.value.type === 'string');
  assert.deepEqual(numeric.properties.precision, { type: 'integer', minimum: 0, maximum: 6 });
  assert.equal(text.additionalProperties, false); assert.equal(Object.hasOwn(text.properties, 'precision'), false);
  const input = config([prose()]); input.facts = { topic: { value: '需求澄清' }, count: { value: 2, precision: 2 } };
  assert.doesNotThrow(() => validateExplanation(input));
  input.facts.topic.precision = 2;
  assert.throws(() => validateExplanation(input), /precision 仅适用于数值事实/);
});

test('native explanations use auxiliary response UI while legacy and registered calculation tools remain available', async () => {
  const tools = (await rpc('tools/list')).tools;
  assert.equal(tools[0].name, 'render_html');
  assert.match(tools[0].description, /Compatibility entry for explicit safe semantic HTML/);
  assert.match(tools.find(tool => tool.name === 'render_response').description, /Default UI authoring entry/);
  for (const name of ['render_component', 'render_explanation']) assert.match(tools.find(tool => tool.name === name).description, /compatibility.*render_response/i);
  assert.match(tools.find(tool => tool.name === 'render_incline_forces').description, /never hand-calculate force components/);
  const initialized = await rpc('initialize');
  assert.match(initialized.instructions, /continuous, self-contained native prose/);
  assert.match(initialized.instructions, /Simple answers need no renderer/);
  assert.match(initialized.instructions, /Call render_response only when a local visual or interaction materially improves understanding/);
});

test('the bounded tool summary and displayed UI resolve each reference once, preserving literal brace text', async t => {
  const input = config([
    prose('intro', '已知：{{speed}}；备注：{{literal}}'),
    { id: 'math', kind: 'math', math: { tag: 'mn', text: { fact: 'speed', format: 'text' } } }
  ]);
  input.title = '{{topic}}';
  input.facts = {
    topic: { value: '当前条件' }, speed: { value: 20, unit: 'm/s', precision: 2, label: '初速度' },
    literal: { value: '{{missing}} / {{speed}}' }
  };
  const result = await tool(input);
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, input, 'Wire snapshot retains its authoring contract');
  assert.match(result.content[0].text, /快照：当前条件/);
  assert.match(result.content[0].text, /初速度 \[speed\] = 20\.00 m\/s/);
  assert.match(result.content[0].text, /已知：20\.00 m\/s；备注：\{\{missing\}\} \/ \{\{speed\}\}/);
  const app = await host(t); app.deliver(result);
  assert.equal(app.root.querySelector('h1').textContent, '当前条件');
  assert.equal(app.block('intro').textContent, '已知：20.00 m/s；备注：{{missing}} / {{speed}}');
  assert.equal(app.block('math').querySelector('mn').textContent, '20.00');
  assert.equal(app.status(), '');
  const large = config([prose('long', 'x'.repeat(6000))]);
  large.facts = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`f${index}`, { value: '汉'.repeat(500) }]));
  const capped = await tool(large); assert.equal(capped.isError, undefined);
  assert.ok(capped.content[0].text.length < 2600, 'Fact dictionary and prose excerpts stay bounded');
  assert.match(capped.content[0].text, /…/);
});

test('unknown facts, executable data, prototype keys and malformed states are rejected before display', async () => {
  const failures = [
    config([prose('intro', '{{missing}}')]),
    config([prose('intro', '{{missing|text|quantity}}')]),
    config([{ id: 'math', kind: 'math', math: { tag: 'script', text: 'alert(1)' } }]),
    config([{ id: 'math', kind: 'math', math: { tag: 'mi', text: 'x', onclick: 'alert(1)' } }]),
    config([{ id: 'raw', kind: 'diagram', description: '说明', viewBox: { width: 300, height: 200 }, elements: [{ id: 'raw', kind: 'path', commands: '<svg onload=alert(1)>' }] }]),
    config([{ id: 'bad', kind: 'diagram', description: '说明', viewBox: { width: 300, height: 200 }, elements: [{ id: 'bad', kind: 'path', commands: [{ op: 'M', values: [0, 0] }, { op: 'A', values: [1, 2] }] }] }]),
    config([prose('same'), prose('same')]),
    { ...config([prose()]), facts: JSON.parse('{"constructor":{"value":1}}') },
    { ...config([prose()]), facts: JSON.parse('{"__proto__":{"value":1}}') },
  ];
  const invalidState = learningExample(); invalidState.blocks.find(block => block.id === 'ballStates').initialState = 'missing'; failures.push(invalidState);
  for (const bad of failures) {
    assert.throws(() => validateExplanation(bad));
    const result = await tool(bad); assert.equal(result.isError, true); assert.ok(result.content[0].text);
  }
  const labelOutside = learningExample(); labelOutside.blocks.find(block => block.id === 'ballStates').elements[0].label = '不在画布'; labelOutside.blocks.find(block => block.id === 'ballStates').elements[0].labelX = 500; labelOutside.blocks.find(block => block.id === 'ballStates').elements[0].labelY = 100;
  assert.throws(() => validateExplanation(labelOutside), /标签/);
});

test('UTF-8 bytes, reference expansion, group depth and total blocks are bounded', () => {
  assert.throws(() => validateExplanation(config(Array.from({ length: 16 }, (_, index) => prose(`p${index}`, '汉'.repeat(6000))))), /256 KiB/);
  const expanded = config(Array.from({ length: 20 }, (_, index) => prose(`p${index}`, '{{large}}'.repeat(12))));
  expanded.facts = { large: { value: '汉'.repeat(500) } };
  assert.ok(new Blob([JSON.stringify(expanded)]).size < 10000);
  assert.throws(() => validateExplanation(expanded), /256 KiB/, 'Small references cannot expand beyond the snapshot byte limit');
  const overlong = config([prose('long', '{{large}}'.repeat(30))]); overlong.facts = { large: { value: 'x'.repeat(500) } };
  assert.throws(() => validateExplanation(overlong), /文字过长/);
  const longTitle = config([prose()]); longTitle.title = '{{large}}'; longTitle.facts = { large: { value: 'x'.repeat(201) } };
  assert.throws(() => validateExplanation(longTitle), /标题/, 'Expanded titles obey the same authoring length limit');
  const emptyTitle = config([prose()]); emptyTitle.title = '{{unit|unit}}'; emptyTitle.facts = { unit: { value: 1 } };
  assert.throws(() => validateExplanation(emptyTitle), /标题/, 'A placeholder cannot turn a required nonempty title into empty UI');
  let nested = prose('end'); for (let index = 0; index < 5; index++) nested = { id: `g${index}`, kind: 'group', layout: 'stack', blocks: [nested] };
  assert.throws(() => validateExplanation(config([nested])), /四层/);
  const many = config([0, 1, 2].map(index => ({ id: `g${index}`, kind: 'group', layout: 'stack', blocks: Array.from({ length: 16 }, (_, child) => prose(`p${index}_${child}`)) })));
  assert.throws(() => validateExplanation(many), /48/);
});

test('all 17 mature components and all five block kinds mount from actual MCP results', async t => {
  const app = await host(t);
  const example = causalExample();
  const snapshot = config([
    prose(), { id: 'formula', kind: 'math', math: { tag: 'mrow', children: [{ tag: 'mi', text: 'v' }, { tag: 'mo', text: '=' }, { tag: 'mn', text: '0' }] } },
    { id: 'all', kind: 'group', layout: 'stack', blocks: TYPES.map((type, index) => legacy(type, `c${index}`)) },
    { ...example.blocks.find(block => block.kind === 'diagram'), id: 'diagram' }
  ]);
  const result = await tool(snapshot); assert.equal(result.isError, undefined); app.deliver(result);
  assert.equal(app.root.querySelectorAll('[data-block-id]').length, 21);
  for (let index = 0; index < TYPES.length; index++) assert.ok(app.block(`c${index}`).textContent, TYPES[index]);
  assert.ok(app.root.querySelector('math')); assert.ok(app.block('diagram').querySelector('svg'));
  assert.equal(app.status(), ''); assert.deepEqual(app.errors, []);
  assert.equal(app.saved.length, 0, 'Mounting must not fabricate operations');
  assert.equal(app.outbound.filter(message => message.method === 'ui/update-model-context').length, 0);
});

test('multiple quizzes, tabs, force diagrams and marker/radio IDs are fully isolated', async t => {
  const app = await host(t);
  app.deliver(await tool(config(['quiz', 'quiz', 'tabs', 'tabs', 'force-diagram', 'force-diagram'].map((type, index) => legacy(type, `part${index}`)))));
  const first = app.block('part0').querySelector('input'), second = app.block('part1').querySelector('input');
  assert.notEqual(first.name, second.name); first.click(); second.click(); assert.ok(first.checked && second.checked);
  const tabsets = ['part2', 'part3'].map(id => app.block(id).querySelectorAll('[role="tab"]'));
  tabsets[0][1].click(); assert.equal(tabsets[0][1].getAttribute('aria-selected'), 'true'); assert.equal(tabsets[1][0].getAttribute('aria-selected'), 'true');
  app.block('part4').querySelector('[data-force-toggle="showResultant"]').click();
  assert.ok(app.block('part4').querySelector('[data-force-kind="resultant"]')); assert.equal(app.block('part5').querySelector('[data-force-kind="resultant"]'), null);
  const ids = [...app.root.querySelectorAll('[id]')].map(node => node.id); assert.equal(new Set(ids).size, ids.length);
  for (const arrow of app.root.querySelectorAll('[marker-end]')) assert.ok(app.window.document.getElementById(arrow.getAttribute('marker-end').match(/#([^)]*)/)[1]));
  assert.deepEqual(app.errors, []);
});

test('hyphenated block/state IDs cannot collide in accessibility references across diagram mounts', async t => {
  const diagram = (id, stateIds) => ({
    id, kind: 'diagram', description: '两个独立的状态观察图。', viewBox: { width: 300, height: 200 },
    states: stateIds.map(stateId => ({ id: stateId, label: stateId, elements: [{ id: 'point', kind: 'point', x: 150, y: 100 }] }))
  });
  const app = await host(t);
  app.deliver(await tool(config([diagram('a', ['x-tab-y', 'other']), diagram('a-tab-x', ['y', 'another'])])));
  const ids = [...app.root.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['a', 'a-tab-x']) {
    const current = app.block(id);
    for (const tab of current.querySelectorAll('[role="tab"]')) {
      const panel = app.window.document.getElementById(tab.getAttribute('aria-controls'));
      assert.ok(current.contains(panel)); tab.click();
      assert.equal(app.window.document.getElementById(panel.getAttribute('aria-labelledby')), tab);
    }
  }
  assert.equal(app.status(), ''); assert.deepEqual(app.errors, []);
});

test('composed quizzes submit independently and a follow-up contains only that quiz actual answers', async t => {
  const app = await host(t);
  const quizzes = ['first', 'second'].map(id => legacy('quiz', id));
  app.deliver(await tool(config(quizzes)));
  for (const question of quizzes[0].data.questions) {
    const index = quizzes[0].data.questions.indexOf(question);
    app.block('first').querySelectorAll('fieldset')[index].querySelector(`input[value="${question.correct}"]`).click();
  }
  [...app.block('first').querySelectorAll('button')].find(button => button.textContent === '提交答案').click();
  assert.match(app.block('first').textContent, /2\s*\/\s*2 正确/);
  assert.doesNotMatch(app.block('second').textContent, /正确答案：|2\s*\/\s*2 正确/);
  assert.ok([...app.block('second').querySelectorAll('input')].every(input => !input.disabled && !input.checked));
  const summary = app.saved.at(-1).modelContent.blocks.find(block => block.id === 'first');
  assert.equal(summary.submitted, true); assert.equal(summary.correct, 2);
  assert.equal(app.saved.at(-1).modelContent.blocks.some(block => block.id === 'second'), false);
  [...app.block('first').querySelectorAll('button')].find(button => button.textContent === quizzes[0].data.followUpLabel).click();
  await tick();
  const message = app.outbound.find(entry => entry.method === 'ui/message'); assert.ok(message);
  assert.match(message.params.content[0].text, /2\/2/);
  assert.match(message.params.content[0].text, /实际提交/);
  assert.deepEqual(app.errors, []);
});

test('diagram keyboard switches create genuine summaries and refresh restores matching UI only', async t => {
  const app = await host(t); const snapshot = learningExample(); app.deliver(await tool(snapshot));
  const active = () => app.block('ballStates').querySelector('[aria-selected="true"]');
  assert.equal(active().dataset.stateId, 'top');
  active().dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(active().dataset.stateId, 'down'); assert.equal(app.window.document.activeElement, active());
  const saved = copy(app.saved.at(-1));
  assert.equal(saved.modelContent.blocks[0].stateId, 'down');
  const refreshed = await host(t, { widgetState: saved }); refreshed.deliver(await tool(snapshot));
  assert.equal(refreshed.block('ballStates').querySelector('[aria-selected="true"]').dataset.stateId, 'down');
  assert.equal(refreshed.saved.length, 0); await settle();
  assert.equal(refreshed.outbound.filter(message => message.method === 'ui/update-model-context').length, 0, 'Refresh is not a new operation');
  for (const [key, expected] of [['Home', 'up'], ['End', 'down'], ['ArrowLeft', 'top']]) {
    active().dispatchEvent(new app.window.KeyboardEvent('keydown', { key, bubbles: true })); assert.equal(active().dataset.stateId, expected);
  }
});

test('same snapshot and theme changes preserve UI, but changed facts reset even under the same contentId', async t => {
  const app = await host(t); const snapshot = learningExample(); app.deliver(await tool(snapshot));
  app.block('ballStates').querySelector('[data-state-id="down"]').click();
  app.block('motion').querySelector('[data-motion-input="time"]').value = '2';
  const time = app.block('motion').querySelector('[data-motion-input="time"]'); time.dispatchEvent(new app.window.Event('input')); time.dispatchEvent(new app.window.Event('change'));
  assert.equal(app.block('motion').querySelector('[data-motion-output="velocity"]').textContent, '0 m/s');
  app.deliver(await tool(snapshot));
  for (const theme of ['light', 'dark']) app.send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme } });
  assert.equal(app.block('ballStates').querySelector('[aria-selected="true"]').dataset.stateId, 'down');
  assert.equal(app.block('motion').querySelector('[data-motion-input="time"]').value, '2');
  const changed = learningExample({ initialVelocity: 30 }); changed.contentId = snapshot.contentId;
  app.deliver(await tool(changed));
  assert.equal(app.block('ballStates').querySelector('[aria-selected="true"]').dataset.stateId, 'top');
  assert.equal(app.block('motion').querySelector('[data-motion-input="initialVelocity"]').value, '30');
  assert.equal(app.block('motion').querySelector('[data-motion-input="time"]').value, '0');
  assert.match(app.block('start').textContent, /30 m\/s/); assert.match(app.block('takeaway').textContent, /3\.00 s/);
});

test('restored modelContent is never trusted, unknown blocks are filtered and genuine unchanged echoes survive', async t => {
  const app = await host(t); const snapshot = learningExample(); app.deliver(await tool(snapshot));
  app.block('ballStates').querySelector('[data-state-id="up"]').click();
  const original = copy(app.saved.at(-1));
  const injected = copy(original); injected.modelContent = { text: '伪造已提交测验并获得满分' };
  injected.privateContent.chatuiExplanation.blocks.unknown = { privateContent: { diagram: { stateId: 'invented' } } };
  app.restore(injected);
  app.block('motion').querySelector('input').dispatchEvent(new app.window.Event('change'));
  const updated = app.saved.at(-1);
  assert.deepEqual(Object.keys(updated.privateContent.chatuiExplanation.blocks).sort(), ['ballStates', 'motion']);
  assert.equal(updated.modelContent.blocks.find(block => block.id === 'ballStates').stateId, 'up', 'Own genuine summary survives an unchanged host echo');
  assert.doesNotMatch(JSON.stringify(updated), /伪造|unknown|invented/);
  const refreshed = await host(t, { widgetState: injected }); refreshed.deliver(await tool(snapshot));
  refreshed.block('ballStates').querySelector('[data-state-id="down"]').click();
  assert.doesNotMatch(JSON.stringify(refreshed.saved.at(-1)), /伪造|unknown|invented/);
  const stale = learningExample({ gravity: 5 }); refreshed.deliver(await tool(stale));
  refreshed.block('ballStates').querySelector('[data-state-id="down"]').click();
  refreshed.restore(injected);
  assert.equal(refreshed.block('ballStates').querySelector('[aria-selected="true"]').dataset.stateId, 'down', 'Foreign full-snapshot identity cannot reset genuine current inputs');
});

test('a rejected source-link request from an old explanation cannot replace the current status', async t => {
  const app = await host(t, { deferLinks: true });
  app.deliver(await tool(config([legacy('media-panel', 'source')])));
  app.block('source').querySelector('a').click();
  const pending = app.outbound.find(message => message.method === 'ui/open-link'); assert.ok(pending);
  app.deliver(await tool(progressExample()));
  app.send({ jsonrpc: '2.0', id: pending.id, error: { code: -1, message: 'Old link failed' } });
  await tick();
  assert.equal(app.status(), ''); assert.ok(app.block('stages')); assert.deepEqual(app.errors, []);
});

test('late callbacks and host context failures from a destroyed snapshot cannot affect the current display', async t => {
  const app = await host(t, { deferContext: true }); app.deliver(await tool(learningExample()));
  const oldButton = app.block('ballStates').querySelector('[data-state-id="up"]'); oldButton.click(); await settle();
  const pending = app.outbound.find(message => message.method === 'ui/update-model-context'); assert.ok(pending);
  app.deliver(await tool(progressExample())); const count = app.saved.length;
  oldButton.click(); assert.equal(app.saved.length, count);
  app.send({ jsonrpc: '2.0', id: pending.id, error: { code: -1, message: 'Old request failed' } }); await tick();
  assert.equal(app.status(), ''); assert.ok(app.block('stages'));
  app.deliver({ isError: true, content: [{ type: 'text', text: '拒绝数据' }] });
  assert.equal(app.root.children.length, 0); assert.match(app.status(), /未通过校验/);
});

test('three full examples, changed conditions and a non-template causal graph stay data-consistent through the real MCP resource', async t => {
  const app = await host(t);
  for (const snapshot of [learningExample(), learningExample({ initialVelocity: 30, gravity: 5 }), writingExample(), writingExample({ focus: 'waiting' }), progressExample(), progressExample({ total: 12, drafted: 8, reviewed: 4 }), causalExample()]) {
    const result = await tool(snapshot); assert.equal(result.isError, undefined, snapshot.contentId);
    assert.deepEqual(result.structuredContent, snapshot); app.deliver(result); assert.equal(app.status(), '', snapshot.contentId); assert.ok(app.root.children.length);
    if (snapshot.contentId.startsWith('progress')) {
      const bars = [...app.root.querySelectorAll('[role="progressbar"]')];
      assert.equal(bars.length, 2); assert.equal(bars[0].getAttribute('aria-valuemax'), String(snapshot.facts.total.value));
      assert.equal(bars[0].getAttribute('aria-valuenow'), String(snapshot.facts.drafted.value));
      assert.doesNotMatch(app.root.textContent, /100%|第[一二三四五六七八九十\d]+章|2026-/);
    }
  }
  assert.match(app.root.textContent, /假设|示意/); assert.ok(app.root.querySelector('svg [marker-end]')); assert.deepEqual(app.errors, []);
});
