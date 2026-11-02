import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp } from '../lib/mcp.mjs';
import Ajv from 'ajv';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createQuizDeliveryId, projectQuizView, projectQuizResult, hydrateQuizView, quizViewFingerprint } from '../lib/quiz-boundary.mjs';

const secret = 'S01_SYNTHETIC_PRIVATE_EXPLANATION_7f32';
const data = () => ({ questions: [{ id: 'q1', prompt: 'Synthetic question?', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }], correct: 'b', explanation: secret }], followUp: 'Continue' });
const component = () => ({ schemaVersion: 1, contentId: 's01-synthetic', type: 'quiz', data: data() });
const composed = () => ({ schemaVersion: 1, contentId: 's01-synthetic', facts: {}, blocks: [{ id: 'fold', kind: 'group', layout: 'stack', blocks: [{ id: 'question', kind: 'component', type: 'quiz', data: data() }] }] });
const inputs = {
  render_component: component,
  render_explanation: composed,
  render_response: composed,
  render_document: () => ({ contentId: 's01-synthetic', source: 'Public before.\n\n:::quiz ' + JSON.stringify(data()) + '\n:::\n\nPublic after.' })
};
async function call(name, args) {
  const request = new Request('https://synthetic.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic', 'oai-authenticated-user-email': 'synthetic@example.invalid' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return (await (await handleMcp(request)).json()).result;
}
function publicBoundary(value) {
  if (Array.isArray(value)) value.forEach(publicBoundary);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert.ok(!['correct', 'explanation', 'answerKey', 'grading', 'solution'].includes(key), `model-visible grading field: ${key}`);
    publicBoundary(child);
  }
  else if (typeof value === 'string') for (const marker of [secret, Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex'), encodeURIComponent(secret)]) assert.ok(!value.includes(marker), 'model-visible synthetic grading marker');
}
for (const [name, factory] of Object.entries(inputs)) test(`S01/A00 ${name} returns public questions and grading only in _meta`, async () => {
  const result = await call(name, factory());
  assert.equal(result.isError, undefined);
  publicBoundary({ structuredContent: result.structuredContent, content: result.content });
  assert.ok(JSON.stringify(result._meta).includes(secret), 'component grading preserved');
});
test('S01/A00 legacy nested grading aliases never survive public Quiz projection', async () => {
  const input = component();
  input.data.grading = { answerKey: 'b', explanation: secret };
  input.data.questions[0].solution = { encoded: Buffer.from(secret).toString('base64') };
  input.data.questions[0].options[0].grading = { correct: true };
  const result = await call('render_component', input);
  publicBoundary({ structuredContent: result.structuredContent, content: result.content });
});
test('S01/A00 grading fact references cannot leave duplicate secrets in public facts', async () => {
  for (const name of ['render_response', 'render_explanation']) {
    const input = composed(); input.facts.gradeText = { value: secret };
    input.blocks[0].blocks[0].data.questions[0].explanation = '{{gradeText}}';
    const result = await call(name, input);
    publicBoundary({ structuredContent: result.structuredContent, content: result.content });
    assert.equal(result.isError, undefined);
    assert.ok(JSON.stringify(result._meta).includes(secret));
  }
});
test('S01/A00 error output does not echo private grading reference IDs', async () => {
  const input = composed(); input.blocks[0].blocks[0].data.questions[0].explanation = '{{' + secret + '}}';
  const result = await call('render_response', input);
  assert.equal(result.isError, true);
  publicBoundary(result);
});
test('S01/A00 public document identity does not act as a grading hash oracle', async () => {
  const first = await call('render_document', inputs.render_document());
  const changed = data(); changed.questions[0].correct = 'a'; changed.questions[0].explanation = 'A_DIFFERENT_SYNTHETIC_PRIVATE_EXPLANATION';
  const second = await call('render_document', { contentId: 's01-synthetic', source: 'Public before.\n\n:::quiz ' + JSON.stringify(changed) + '\n:::\n\nPublic after.' });
  assert.equal(second.isError, undefined);
  const firstPublic = { ...first.structuredContent }, secondPublic = { ...second.structuredContent };
  delete firstPublic.deliveryId; delete secondPublic.deliveryId;
  assert.deepEqual(secondPublic, firstPublic);
  assert.equal(quizViewFingerprint(second.structuredContent), quizViewFingerprint(first.structuredContent));
  assert.notEqual(second.structuredContent.deliveryId, first.structuredContent.deliveryId);
  assert.notDeepEqual(second._meta.chatui.quizGrading, first._meta.chatui.quizGrading);
});
test('S01/A00 explicit public explanation copies and common encodings fail closed', async () => {
  for (const value of [secret, Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('base64url'), Buffer.from(secret).toString('hex'), Buffer.from(secret).toString('hex').toUpperCase(), Array.from(secret, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('')]) {
    const input = composed(); input.blocks.unshift({ id: 'public', kind: 'prose', text: value });
    const result = await call('render_response', input);
    assert.equal(result.isError, true); publicBoundary(result);
  }
});
test('S01/A00 encoded answer-key copies in facts fail closed while option IDs remain public', async () => {
  for (const value of [Buffer.from('b').toString('base64'), Buffer.from('b').toString('base64url'), Buffer.from('b').toString('hex'), '\\u0062']) {
    const input = composed(); input.facts.gradeEncoded = { value };
    const result = await call('render_response', input);
    assert.equal(result.isError, true); publicBoundary(result);
  }
  const result = await call('render_component', component());
  assert.equal(result.isError, undefined); assert.equal(result.structuredContent.data.questions[0].options[1].id, 'b');
});
test('S01/A00 public option exception cannot hide grading in another component options alias', async () => {
  const input = composed(); input.blocks.push({ id: 'alias', kind: 'component', type: 'progress', data: { value: 1, total: 2, options: [Buffer.from('b').toString('base64')] } });
  const result = await call('render_response', input);
  assert.equal(result.isError, true); publicBoundary(result);
});
test('S01/A00 explanation copies in public fact property names fail closed', async () => {
  const marker = 'grade_sentinel';
  const aliases = [marker, Buffer.from(marker).toString('base64url'), 'x' + Buffer.from(marker).toString('hex'), 'x' + Buffer.from(marker).toString('hex').toUpperCase()];
  for (const name of ['render_response', 'render_explanation']) for (const factId of aliases) {
    const input = composed(); input.blocks[0].blocks[0].data.questions[0].explanation = marker;
    input.facts[factId] = { value: 'Public context' };
    const result = await call(name, input);
    assert.equal(result.isError, true, `${name} must reject private explanation in a fact property name`);
    assert.ok(!JSON.stringify({ structuredContent: result.structuredContent, content: result.content }).includes(factId));
    publicBoundary(result);
  }
});
test('S01/A00 encoded answer-key copies in public fact property names fail closed', async () => {
  for (const name of ['render_response', 'render_explanation']) {
    const input = composed(), factId = Buffer.from('b').toString('base64url');
    input.facts[factId] = { value: 'Public context' };
    const result = await call(name, input);
    assert.equal(result.isError, true, `${name} must reject encoded grading answer in a fact property name`);
    publicBoundary(result);
  }
});
test('S01/A00 all four declared output schemas accept public Quiz and reject private/nested additions', async () => {
  const request = new Request('https://synthetic.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  const tools = (await (await handleMcp(request)).json()).result.tools;
  for (const [name, factory] of Object.entries(inputs)) {
    const result = await call(name, factory()), validate = new Ajv({ strict: false }).compile(tools.find(tool => tool.name === name).outputSchema);
    assert.equal(validate(result.structuredContent), true, name);
    const copy = structuredClone(result.structuredContent);
    const block = name === 'render_component' ? copy : name === 'render_document' ? copy.blocks.find(block => block.type === 'quiz') : copy.blocks[0].blocks[0];
    block.data.questions[0].correct = 'b'; assert.equal(validate(copy), false, name);
    delete block.data.questions[0].correct; block.data.questions[0].options[0].answerKey = 'b'; assert.equal(validate(copy), false, name);
  }
});

const deliveryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fixedDelivery = '11111111-1111-4111-8111-111111111111';
for (const [name, factory] of Object.entries(inputs)) test(`S01/0C ${name} actual MCP calls mint distinct bound nonsecret delivery UUIDs`, async () => {
  const first = await call(name, factory()), second = await call(name, factory());
  assert.equal(first.isError, undefined); assert.equal(second.isError, undefined);
  for (const result of [first, second]) {
    assert.match(result.structuredContent.deliveryId, deliveryIdPattern);
    assert.equal(result._meta.chatui.quizGrading.deliveryId, result.structuredContent.deliveryId);
    publicBoundary({ structuredContent: result.structuredContent, content: result.content });
    assert.equal(hydrateQuizView(result.structuredContent, result._meta).deliveryId, undefined, 'Delivery identity never enters authoring/render state');
  }
  assert.notEqual(first.structuredContent.deliveryId, second.structuredContent.deliveryId);
  assert.equal(quizViewFingerprint(first.structuredContent), quizViewFingerprint(second.structuredContent));
  assert.throws(() => hydrateQuizView(second.structuredContent, first._meta), /身份校验失败/);
});

test('S01/0C explicit trusted fixture UUID is deterministic while default projector mints new instances', () => {
  const first = projectQuizView(component(), { deliveryId: fixedDelivery });
  assert.deepEqual(projectQuizView(component(), { deliveryId: fixedDelivery }), first);
  assert.equal(first.view.deliveryId, fixedDelivery); assert.equal(first.meta.chatui.quizGrading.deliveryId, fixedDelivery);
  const random1 = projectQuizView(component()), random2 = projectQuizView(component());
  assert.notEqual(random1.view.deliveryId, random2.view.deliveryId);
  assert.equal(quizViewFingerprint(first.view), quizViewFingerprint(random1.view));
  const envelope = projectQuizResult({ structuredContent: component(), content: [{ type: 'text', text: 'Synthetic question and options.' }] }, { deliveryId: fixedDelivery });
  assert.equal(projectQuizResult(envelope, { deliveryId: createQuizDeliveryId() }), envelope, 'Already projected results preserve their original instance identity');
});

test('S01/0C UUID factory uses secure crypto APIs and fails closed when unavailable', async () => {
  assert.match(createQuizDeliveryId(), deliveryIdPattern);
  const source = (await readFile(new URL('../lib/quiz-boundary.mjs', import.meta.url), 'utf8')).split('function quizEntries')[0].replace(/^import[^\n]+$/gm, '').replaceAll('export function ', 'function ');
  const run = crypto => runInNewContext(source + '\ncreateQuizDeliveryId()', { crypto, Uint8Array });
  let calls = 0;
  assert.equal(run({ randomUUID: () => { calls++; return fixedDelivery; }, getRandomValues: () => assert.fail('randomUUID should be preferred') }), fixedDelivery);
  assert.equal(calls, 1);
  assert.match(run({ getRandomValues: bytes => { calls++; return bytes.fill(25); } }), deliveryIdPattern);
  assert.equal(calls, 2);
  assert.throws(() => run(undefined), /身份校验失败/);
  assert.throws(() => run({ randomUUID: () => 'untrusted-secret' }), /身份校验失败/);
});

for (const value of [undefined, '', 'UPPERCASE-INVALID', 1, [], {}, '11111111-1111-1111-8111-111111111111', '11111111-1111-4111-0111-111111111111']) test(`S01/0C invalid or missing delivery identity ${JSON.stringify(value)} cannot hydrate`, () => {
  const result = projectQuizView(component(), { deliveryId: fixedDelivery });
  if (value === undefined) { delete result.view.deliveryId; delete result.meta.chatui.quizGrading.deliveryId; }
  else { result.view.deliveryId = value; result.meta.chatui.quizGrading.deliveryId = value; }
  assert.throws(() => hydrateQuizView(result.view, result.meta), /身份校验失败/);
});

test('S01/0C non-Quiz outputs retain the original contract without any delivery token', () => {
  const view = { schemaVersion: 1, contentId: 'non-quiz', type: 'progress', data: { value: 1, total: 2 } };
  assert.equal(projectQuizView(view).view, view);
  const result = { structuredContent: view, content: [] }; assert.equal(projectQuizResult(result), result);
  assert.equal(hydrateQuizView(view, undefined), view); assert.equal(view.deliveryId, undefined);
});

test('S01/0C controlled UUID does not falsely reject a short-hidden-explanation matching its fixed version digit', async () => {
  const input = component(); input.data.questions[0].explanation = '4';
  const publicAuthoring = structuredClone(input); delete publicAuthoring.data.questions[0].correct; delete publicAuthoring.data.questions[0].explanation;
  assert.ok(!JSON.stringify(publicAuthoring).includes('4'), 'Author-supplied public fields contain no explanation copy');
  const result = await call('render_component', input);
  console.log(JSON.stringify({ phase: 'S01/0C short-hidden-explanation compatibility', publicAuthoringContainsMarker: false, actualIsError: result.isError === true, deliveryIdHasUuidVersionDigit: result.structuredContent?.deliveryId?.split('-')[2][0] === '4' }));
  assert.equal(result.isError, undefined, 'Controlled random UUID version bits must not be mistaken for an author-supplied grading copy');
  assert.equal(result._meta.chatui.quizGrading.quizzes[0].questions[0].explanation, '4');
  assert.match(result.structuredContent.deliveryId, deliveryIdPattern);
});
