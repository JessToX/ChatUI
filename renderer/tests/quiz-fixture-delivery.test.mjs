import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { trustedFixtureDeliveryId } from '../scripts/quiz-fixture-delivery.mjs';
import { compileGalleryScenarios } from '../scripts/generate-gallery.mjs';
import { createGalleryScenarios } from '../examples/gallery.mjs';
import { handleMcp } from '../lib/mcp.mjs';
import { projectQuizView, quizViewFingerprint } from '../lib/quiz-boundary.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const dataFor = correct => ({ questions: [{ id: 'q1', prompt: 'A fixed public question?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct, explanation: `Synthetic private explanation ${correct}` }] });
const componentFor = correct => ({ schemaVersion: 1, contentId: 'fixture-delivery-call', type: 'quiz', data: dataFor(correct) });
const compositionFor = correct => ({ schemaVersion: 1, contentId: 'fixture-delivery-call', facts: {}, blocks: [{ id: 'quiz', kind: 'component', type: 'quiz', data: dataFor(correct) }] });
const withoutDelivery = view => { const copy = structuredClone(view); delete copy.deliveryId; return copy; };
async function call(name, correct) {
  const args = name === 'render_component' ? componentFor(correct) : name === 'render_document' ? { contentId: 'fixture-delivery-call', source: `:::quiz ${JSON.stringify(dataFor(correct))}\n:::` } : compositionFor(correct);
  const request = new Request('https://synthetic.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic', 'oai-authenticated-user-email': 'synthetic@example.invalid' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return (await (await handleMcp(request)).json()).result;
}

test('explicit trusted build instance identities are stable and independent of hidden grading', () => {
  const label = 'test:fixed-build-instance';
  const deliveryId = trustedFixtureDeliveryId(label);
  assert.match(deliveryId, uuid);
  assert.equal(trustedFixtureDeliveryId(label), deliveryId);
  assert.notEqual(trustedFixtureDeliveryId('test:another-build-instance'), deliveryId);
  for (const invalid of ['', ' ', null, {}, 'x'.repeat(301)]) assert.throws(() => trustedFixtureDeliveryId(invalid));
  const old = projectQuizView(componentFor('a'), { deliveryId });
  const current = projectQuizView(componentFor('b'), { deliveryId });
  assert.deepEqual(old.view, current.view, 'Static fixture ID cannot fingerprint the grader');
  assert.equal(old.meta.chatui.quizGrading.deliveryId, deliveryId);
  assert.equal(current.meta.chatui.quizGrading.deliveryId, deliveryId);
  assert.notDeepEqual(old.meta, current.meta);
});

test('all four real MCP Quiz routes mint fresh identities even with identical authoring input', async () => {
  const ids = new Set();
  for (const name of ['render_component', 'render_explanation', 'render_response', 'render_document']) {
    const results = [await call(name, 'a'), await call(name, 'a'), await call(name, 'b')];
    for (const result of results) {
      assert.equal(result.isError, undefined, name);
      const id = result.structuredContent.deliveryId;
      assert.match(id, uuid, name);
      assert.equal(result._meta.chatui.quizGrading.deliveryId, id, name);
      assert.equal(ids.has(id), false, 'A real call must not reuse a fixed build token');
      ids.add(id);
      assert.equal(result.content.some(item => item.text?.includes('Synthetic private explanation')), false);
    }
    assert.deepEqual(withoutDelivery(results[0].structuredContent), withoutDelivery(results[1].structuredContent));
    assert.deepEqual(withoutDelivery(results[0].structuredContent), withoutDelivery(results[2].structuredContent));
    assert.equal(quizViewFingerprint(results[0].structuredContent), quizViewFingerprint(results[2].structuredContent));
  }
  assert.equal(ids.size, 12);
});

test('Gallery fixture instance identities survive repeated compilation and stay out of non-Quiz views', () => {
  const first = compileGalleryScenarios(createGalleryScenarios());
  const second = compileGalleryScenarios(createGalleryScenarios());
  assert.deepEqual(first, second, 'Trusted fixed fixture instances must be byte repeatable');
  for (const scene of first) {
    if (scene.hasQuiz) {
      assert.match(scene.view.deliveryId, uuid);
      assert.equal(scene.view.deliveryId, scene._meta.chatui.quizGrading.deliveryId);
    } else assert.equal(scene.view?.deliveryId, undefined);
  }
});

test('generated public Quiz fixtures carry explicit build identities rather than random request tokens', () => {
  for (const [name, label] of [['response-quiz', 'preview:response:quiz'], ['document-quiz', 'preview:document:quiz'], ['benchmark-quiz-structured', 'comparison:quiz:structured']]) {
    const result = JSON.parse(readFileSync(new URL(`../public/examples/${name}.json`, import.meta.url)));
    const expected = trustedFixtureDeliveryId(label);
    assert.equal(result.structuredContent.deliveryId, expected, name);
    assert.equal(result._meta.chatui.quizGrading.deliveryId, expected, name);
  }
  const source = readFileSync(new URL('../lib/mcp.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /trustedFixtureDeliveryId|quiz-fixture-delivery/);
});
