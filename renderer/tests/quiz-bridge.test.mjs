import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { g10 } from '../examples/iteration-one.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { explanationHtml } from '../lib/explanation.generated.mjs';
import { widgetHtml } from '../lib/widget.generated.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { projectQuizResult, hydrateQuizView, quizViewFingerprint } from '../lib/quiz-boundary.mjs';

const privateMarker = 'S01_PRIVATE_EXPLANATION_SENTINEL';
const quiz = { questions: [{ id: 'q1', prompt: 'What is two plus one?', options: [{ id: 'choiceA', label: 'Three' }, { id: 'choiceB', label: 'Five' }], correct: 'choiceA', explanation: privateMarker }], followUp: 'Explain my actual result.' };
const copy = value => JSON.parse(JSON.stringify(value));
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function boundaryResult(contentId = 's01-boundary', data = quiz) {
  const compiled = normalizeDocument({ contentId, source: `Before.\n\n:::quiz ${JSON.stringify(data)}\n:::\n\nAfter.` });
  return projectQuizResult({ structuredContent: compiled.view, content: [{ type: 'text', text: compiled.text }] });
}
async function host(t, { initialGlobals, widgetState, followup = true, rejectMessage = false, holdMessage = false, deferInitialize = false, nativeFollowup, html = documentHtml } = {}) {
  const errors = [], saved = [], outbound = [], copied = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://sandbox.invalid', virtualConsole });
  const { window } = dom; window.TextEncoder = TextEncoder;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) } });
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) {
    outbound.push(copy(message)); if (message.id === undefined || holdMessage && message.method === 'ui/message' || deferInitialize && message.method === 'ui/initialize') return;
    queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, ...(rejectMessage && message.method === 'ui/message' ? { error: { code: -1, message: 'Synthetic host rejection' } } : { result: message.method === 'ui/initialize' ? { hostCapabilities: { updateModelContext: {}, ...(followup ? { message: {} } : {}) }, hostContext: { theme: 'light' } } : {} }) }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { ...initialGlobals, ...(nativeFollowup ? { sendFollowUpMessage: nativeFollowup } : {}), widgetState, setWidgetState: payload => saved.push(copy(payload)) };
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick(10);
  const root = window.document.querySelector('#chatui-component');
  const complete = async () => { for (let i = 0; i < 100 && root.getAttribute('aria-busy') === 'true'; i++) await tick(10); await tick(); };
  const deliver = async result => { send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: copy(result) }); await complete(); };
  const globals = async value => { Object.assign(window.openai, copy(value)); window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: copy(value) } })); await complete(); };
  const button = label => [...root.querySelectorAll('button')].find(node => node.textContent === label);
  const submit = () => { root.querySelector('input[value="choiceA"]').click(); button('提交答案').click(); };
  t.after(() => { send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); window.close(); });
  return { root, window, saved, outbound, copied, errors, deliver, globals, complete, send, button, submit, status: () => window.document.querySelector('#chatui-status').textContent };
}
function noPrivate(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  assert.ok(!serialized.includes(privateMarker), `${label} contains private grading explanation`);
  assert.doesNotMatch(serialized, /"(?:explanation|quizGrading)"\s*:/, label);
}
function canonicalGlobals(result, envelope = 'call_tool_result') {
  return { toolOutput: result.structuredContent, toolResponseMetadata: { status: 'success', [envelope]: result } };
}

test('S01/A00 MCP Apps hydrates component-only grading; submit/retry/copy/context preserve boundaries', async t => {
  const result = boundaryResult(), original = copy(result), app = await host(t); await app.deliver(result);
  assert.equal(app.status(), '', 'Sanitized public Quiz plus hidden grading must render');
  assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, 'pre-submit UI'); noPrivate(result.structuredContent, 'public view'); noPrivate(result.content, 'fallback');
  app.button('复制完整文档').click(); await tick(); noPrivate(app.copied, 'pre-submit full copy');
  app.root.querySelector('input[value="choiceA"]').click(); noPrivate(app.saved, 'pre-submit saved state');
  app.button('提交答案').click(); assert.match(app.root.textContent, /1 \/ 1 正确/); assert.ok(app.root.textContent.includes(privateMarker));
  app.button('复制完整文档').click(); await tick(); noPrivate(app.copied, 'post-submit full copy');
  noPrivate(app.saved, 'post-submit saved state'); await tick(150); noPrivate(app.outbound, 'model context');
  app.button('重新测试').click(); noPrivate(app.root.textContent, 'retry UI'); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  assert.deepEqual(result, original, 'Bridge never mutates model-visible input'); assert.deepEqual(app.errors, []);
});
for (const envelope of ['call_tool_result', 'mcp_tool_result']) test(`S01/A00 canonical OpenAI ${envelope} initial globals hydrate hidden grading`, async t => {
  const result = boundaryResult(), app = await host(t, { initialGlobals: canonicalGlobals(result, envelope) }); await app.complete();
  assert.equal(app.status(), ''); assert.ok(app.button('提交答案'), 'Canonical globals must mount without MCP Apps tool-result notification');
  noPrivate(app.root.textContent, 'initial globals UI'); app.submit(); assert.ok(app.root.textContent.includes(privateMarker)); noPrivate(app.saved, 'canonical state'); assert.deepEqual(app.errors, []);
});
for (const mode of ['missing', 'wrong-content', 'wrong-source', 'wrong-view', 'wrong-option', 'duplicate', 'extra', 'malformed']) test(`S01/A00 ${mode} metadata fails closed without model-visible private error text`, async t => {
  const result = boundaryResult(), grading = result._meta.chatui.quizGrading;
  if (mode === 'missing') delete result._meta;
  if (mode === 'wrong-content') grading.contentId = 'other';
  if (mode === 'wrong-source') grading.sourceHash = '0000000000000000';
  if (mode === 'wrong-view') grading.viewHash = '0000000000000000';
  if (mode === 'wrong-option') grading.quizzes[0].questions[0].correct = privateMarker;
  if (mode === 'duplicate') grading.quizzes.push(copy(grading.quizzes[0]));
  if (mode === 'extra') grading.quizzes.push({ id: 'other', questions: [] });
  if (mode === 'malformed') grading.quizzes = privateMarker;
  const app = await host(t); await app.deliver(result);
  assert.equal(app.button('提交答案'), undefined); assert.ok(app.status()); noPrivate(app.root.textContent, 'safe fallback'); noPrivate(app.status(), 'safe error'); noPrivate(app.saved, 'safe state'); noPrivate(app.outbound, 'safe outbound');
});

test('S01/A00 canonical globals updates bind each toolOutput to matching hidden metadata and reject late pairs', async t => {
  const first = boundaryResult('s01-first'), second = boundaryResult('s01-second', { ...quiz, questions: [{ ...quiz.questions[0], prompt: 'A different public question?' }] });
  const app = await host(t); await app.globals(canonicalGlobals(first)); assert.ok(app.button('提交答案')); app.submit();
  await app.globals(canonicalGlobals(second)); assert.ok(app.root.textContent.includes('A different public question?')); noPrivate(app.root.textContent, 'replacement before submit'); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  await app.globals({ toolResponseMetadata: canonicalGlobals(first).toolResponseMetadata });
  assert.equal(app.button('提交答案'), undefined); noPrivate(app.root.textContent, 'late metadata fallback'); noPrivate(app.status(), 'late metadata error');
  await app.globals(canonicalGlobals(second, 'mcp_tool_result')); assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, 'safe recovered Quiz');
  noPrivate(app.saved, 'cross-content state'); assert.deepEqual(app.errors, []);
});
for (const mode of ['direct-meta', 'failed-result', 'mismatched-output', 'missing-envelope']) test(`S01/A00 canonical ${mode} metadata cannot bypass hydration`, async t => {
  const result = boundaryResult(), globals = canonicalGlobals(result);
  if (mode === 'direct-meta') globals.toolResponseMetadata = result._meta;
  if (mode === 'failed-result') globals.toolResponseMetadata.call_tool_result.isError = true;
  if (mode === 'mismatched-output') globals.toolOutput = { ...result.structuredContent, contentId: 'other-output' };
  if (mode === 'missing-envelope') globals.toolResponseMetadata = { status: 'success' };
  const app = await host(t, { initialGlobals: globals }); await app.complete();
  assert.equal(app.button('提交答案'), undefined); noPrivate(app.status(), 'canonical fail-closed status'); noPrivate(app.root.textContent, 'canonical fail-closed UI'); noPrivate(app.saved, 'canonical fail-closed state');
});
test('S01/A00 raw authoring Quiz tool-result is rejected and component-only extras never enter diagnostics', async t => {
  const result = boundaryResult(), app = await host(t);
  result._meta.chatui.rc = { version: '1.6.0', instanceId: 'synthetic-instance', extra: privateMarker, quizGrading: result._meta.chatui.quizGrading };
  await app.deliver(result); assert.ok(app.button('提交答案'));
  noPrivate(app.root.getAttribute('data-chatui-rc') || '', 'component diagnostic DOM'); noPrivate(app.window.__chatuiMetrics, 'metrics');
  const raw = normalizeDocument({ contentId: 'raw-authoring', source: `:::quiz ${JSON.stringify(quiz)}\n:::` });
  await app.deliver({ structuredContent: raw.view, content: [{ type: 'text', text: raw.text }] });
  assert.equal(app.button('提交答案'), undefined); noPrivate(app.root.textContent, 'rejected authoring fallback'); noPrivate(app.status(), 'rejected authoring error');
});
test('S01/A00 refresh resets an unprovided state and changed Quiz rejects the prior snapshot', async t => {
  const result = boundaryResult(), first = await host(t); await first.deliver(result); first.submit(); const saved = first.saved.at(-1);
  const fresh = await host(t); await fresh.deliver(result); assert.equal(fresh.root.querySelectorAll('input:checked').length, 0); noPrivate(fresh.root.textContent, 'fresh mount');
  const changed = boundaryResult('s01-changed', { ...quiz, questions: [{ ...quiz.questions[0], prompt: 'Different question body?' }] });
  const restored = await host(t, { widgetState: saved }); await restored.deliver(changed); assert.equal(restored.root.querySelectorAll('input:checked').length, 0); noPrivate(restored.root.textContent, 'wrong identity restore');
  restored.window.dispatchEvent(new restored.window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: saved } } }));
  assert.equal(restored.root.querySelectorAll('input:checked').length, 0); noPrivate(restored.root.textContent, 'late wrong identity state');
});
for (const rejectMessage of [false, true]) test(`S01/A00 ${rejectMessage ? 'rejected' : 'unsupported'} follow-up copies actual result without private grading`, async t => {
  const app = await host(t, { followup: rejectMessage, rejectMessage }); await app.deliver(boundaryResult()); app.submit();
  app.button(rejectMessage ? '继续讨论本次结果' : '查看可复制的后续问题').click(); await tick();
  const area = app.root.querySelector('.cui-followup-copy'); assert.equal(area.hidden, false); assert.match(area.value, /Three/); assert.match(area.value, /得分：1\/1/); noPrivate(area.value, 'follow-up copy');
  noPrivate(app.outbound, 'follow-up request'); assert.deepEqual(app.errors, []);
});
test('S01/A00 switch and teardown discard stale callbacks and private input never mounts as partial data', async t => {
  const app = await host(t, { holdMessage: true }); await app.deliver(boundaryResult()); app.submit();
  app.button('继续讨论本次结果').click(); const message = app.outbound.find(item => item.method === 'ui/message');
  const staleInput = app.root.querySelector('input'), staleRetry = app.button('重新测试');
  await app.deliver(boundaryResult('s01-replacement')); const saveCount = app.saved.length;
  staleInput.click(); staleRetry.click(); await tick(150); assert.equal(app.saved.length, saveCount); noPrivate(app.root.textContent, 'replacement UI');
  app.send({ jsonrpc: '2.0', id: message.id, error: { code: -1, message: privateMarker } }); await tick(); noPrivate(app.root.textContent, 'late reply UI'); noPrivate(app.status(), 'late reply status');
  app.send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input-partial', params: quiz }); noPrivate(app.window.__chatuiMetrics, 'partial input metrics');
  app.send({ jsonrpc: '2.0', id: 'stop', method: 'ui/resource-teardown' });
  const html = app.root.outerHTML;
  await app.globals(canonicalGlobals(boundaryResult('s01-after-destroy'))); await app.deliver(boundaryResult('s01-after-destroy')); assert.equal(app.root.outerHTML, html); assert.equal(app.saved.length, saveCount);
});

test('S01/A00 grading-only changes reset live Quiz without emitting secret-derived state hashes', async t => {
  const firstResult = boundaryResult(), secondResult = boundaryResult('s01-boundary', { ...quiz, questions: [{ ...quiz.questions[0], correct: 'choiceB', explanation: 'S01_SECOND_PRIVATE_EXPLANATION' }] });
  assert.deepEqual(withoutDelivery(firstResult.structuredContent), withoutDelivery(secondResult.structuredContent), 'Public content bytes cannot be an answer-key hash oracle');
  assert.equal(quizViewFingerprint(firstResult.structuredContent), quizViewFingerprint(secondResult.structuredContent));
  assert.notEqual(firstResult.structuredContent.deliveryId, secondResult.structuredContent.deliveryId);
  const app = await host(t); await app.deliver(firstResult); app.submit(); const before = copy(app.saved.at(-1));
  const oldQuizState = Object.values(before.privateContent.chatuiResponse.blocks)[0];
  await app.deliver(secondResult); assert.equal(app.root.querySelectorAll('input:checked').length, 0); noPrivate(app.root.textContent, 'changed grading before submit'); assert.ok(!app.root.textContent.includes('S01_SECOND_PRIVATE_EXPLANATION'));
  app.window.dispatchEvent(new app.window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: before } } }));
  assert.equal(app.root.querySelector('.cui-feedback'), null); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  app.root.querySelector('input[value="choiceA"]').click(); const after = copy(app.saved.at(-1)), nextQuizState = Object.values(after.privateContent.chatuiResponse.blocks)[0];
  assert.equal(before.privateContent.chatuiResponse.identity, after.privateContent.chatuiResponse.identity);
  assert.equal(oldQuizState.identity, nextQuizState.identity, 'Public block state identity must exclude hidden grading');
  const identityPrefix = value => value.privateContent.chatui.identity.split(':').slice(0, -1).join(':');
  assert.equal(identityPrefix(oldQuizState), identityPrefix(nextQuizState), 'Public Quiz state hash must exclude hidden grading');
  assert.notEqual(oldQuizState.privateContent.chatui.identity, nextQuizState.privateContent.chatui.identity, 'Opaque mount nonce must prevent prior submission replay');
  app.button('提交答案').click(); assert.match(app.root.textContent, /0 \/ 1 正确/); assert.ok(app.root.textContent.includes('S01_SECOND_PRIVATE_EXPLANATION'));
  noPrivate(app.saved, 'grade-change saved state'); assert.ok(!JSON.stringify(app.saved).includes('S01_SECOND_PRIVATE_EXPLANATION'));
});

test('S01/A00 canonical late globals mount without an MCP Apps handshake', async t => {
  const app = await host(t, { deferInitialize: true }); await app.globals(canonicalGlobals(boundaryResult()));
  assert.equal(app.status(), ''); assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, 'late native globals'); app.submit(); assert.match(app.root.textContent, /1 \/ 1 正确/);
});
for (const [kind, html] of [['component', widgetHtml], ['response', responseHtml], ['explanation', explanationHtml]]) test(`S01/A00 ${kind} resource uses the same public/hydrated Quiz boundary`, async t => {
  const composition = { schemaVersion: 1, contentId: `s01-${kind}`, facts: {}, blocks: [{ id: 'quiz', kind: 'component', type: 'quiz', data: copy(quiz) }] };
  const raw = kind === 'component' ? { view: { schemaVersion: 1, contentId: composition.contentId, type: 'quiz', data: copy(quiz) } } : kind === 'response' ? normalizeResponse(composition) : { view: composition };
  const result = projectQuizResult({ structuredContent: raw.view, content: [{ type: 'text', text: raw.text || 'Public question and options.' }] });
  const app = await host(t, { html }); await app.deliver(result); assert.equal(app.status(), ''); assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, `${kind} pre-submit UI`); noPrivate(result.structuredContent, `${kind} public view`);
  app.submit(); assert.match(app.root.textContent, /1 \/ 1 正确/); assert.ok(app.root.textContent.includes(privateMarker)); noPrivate(app.saved, `${kind} state`); assert.deepEqual(app.errors, []);
});

for (const [label, status] of [['absent', undefined], ['host string', 'completed'], ['host object', { phase: 'done' }]]) test(`S01/A00 canonical ${label} status does not invent an undocumented enum`, async t => {
  const globals = canonicalGlobals(boundaryResult());
  if (status === undefined) delete globals.toolResponseMetadata.status; else globals.toolResponseMetadata.status = status;
  const app = await host(t, { initialGlobals: globals }); await app.complete(); assert.equal(app.status(), ''); assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, 'opaque host status'); app.submit(); assert.ok(app.root.textContent.includes(privateMarker)); noPrivate(app.saved, 'opaque status state');
});

test('S01/A00 hidden metadata cannot alias a grading explanation into diagnostics', async t => {
  const result = boundaryResult();
  result._meta.chatui.rc = { version: '1.6.0', instanceId: privateMarker, normalizationMs: 1 };
  const app = await host(t); await app.deliver(result); assert.equal(app.status(), ''); assert.ok(app.button('提交答案'));
  noPrivate(app.root.outerHTML, 'hidden metadata diagnostic alias'); noPrivate(app.window.__chatuiMetrics, 'hidden diagnostic metrics'); noPrivate(app.saved, 'hidden diagnostic state'); noPrivate(app.outbound, 'hidden diagnostic context');
});

// Phase4A-0C regression: only the hidden grading generation changes.
const oldDeliveryMarker = 'S01_0C_OLD_PRIVATE_EXPLANATION';
const currentDeliveryMarker = 'S01_0C_CURRENT_PRIVATE_EXPLANATION';
const deliveryPair = () => [
  boundaryResult('s01-delivery-same', { questions: [{ ...copy(quiz.questions[0]), correct: 'choiceA', explanation: oldDeliveryMarker }] }),
  boundaryResult('s01-delivery-same', { questions: [{ ...copy(quiz.questions[0]), correct: 'choiceB', explanation: currentDeliveryMarker }] })
];
const withoutDelivery = view => { const result = copy(view); delete result.deliveryId; return result; };

test('S01/0C old grading metadata cannot hydrate the current identical-public Quiz delivery', () => {
  const [older, current] = deliveryPair();
  assert.deepEqual(withoutDelivery(older.structuredContent), withoutDelivery(current.structuredContent));
  assert.equal(quizViewFingerprint(older.structuredContent), quizViewFingerprint(current.structuredContent));
  let accepted = false, grader;
  try { grader = hydrateQuizView(current.structuredContent, older._meta).blocks.find(block => block.type === 'quiz').data.questions[0].correct; accepted = true; } catch { /* Expected after the instance-binding repair. */ }
  console.log(JSON.stringify({ phase: 'S01/0C metadata-only hydration regression', samePublicContent: true, olderMetadataAccepted: accepted, observedGrader: grader || null }));
  assert.equal(accepted, false, 'Old grading metadata must fail closed against the current delivery');
});

for (const envelope of ['call_tool_result', 'mcp_tool_result']) test(envelope === 'call_tool_result' ? 'S01/0C canonical metadata-only late old delivery cannot produce old 0/1 scoring or explanation' : 'S01/0C canonical mcp_tool_result metadata-only late old delivery fails closed', async t => {
  const [older, current] = deliveryPair();
  const app = await host(t, { initialGlobals: canonicalGlobals(current, envelope) }); await app.complete();
  assert.ok(app.button('提交答案'));
  await app.globals({ toolResponseMetadata: canonicalGlobals(older, envelope).toolResponseMetadata });
  const hasSubmit = !!app.button('提交答案');
  if (hasSubmit) { app.root.querySelector('input[value="choiceB"]').click(); app.button('提交答案').click(); }
  const evidence = { phase: 'S01/0C metadata-only bridge regression', samePublicContent: true, olderMetadataAccepted: hasSubmit, oldZeroOfOneDisplayed: app.root.textContent.includes('0 / 1 正确'), oldExplanationDisplayed: app.root.textContent.includes(oldDeliveryMarker) };
  console.log(JSON.stringify(evidence));
  assert.equal(evidence.oldZeroOfOneDisplayed, false, 'A stale metadata-only delivery must not score current b under old a');
  assert.equal(evidence.oldExplanationDisplayed, false);
  assert.equal(app.button('提交答案'), undefined, 'Mismatched result delivery must fail closed');
  assert.ok(!JSON.stringify(app.saved).includes(oldDeliveryMarker));
  assert.ok(!JSON.stringify(app.outbound).includes(oldDeliveryMarker));
  await app.globals(canonicalGlobals(current, envelope));
  app.root.querySelector('input[value="choiceB"]').click(); app.button('提交答案').click();
  assert.match(app.root.textContent, /1 \/ 1 正确/);
  assert.ok(app.root.textContent.includes(currentDeliveryMarker)); assert.ok(!app.root.textContent.includes(oldDeliveryMarker));
});

test('S01/0C LIMITATION a complete old toolOutput plus matching metadata remains a trusted-host ordering assumption', async t => {
  const [older, current] = deliveryPair();
  const app = await host(t, { initialGlobals: canonicalGlobals(current) }); await app.complete();
  await app.globals(canonicalGlobals(older));
  app.root.querySelector('input[value="choiceB"]').click(); app.button('提交答案').click();
  assert.match(app.root.textContent, /0 \/ 1 正确/); assert.ok(app.root.textContent.includes(oldDeliveryMarker));
  console.log(JSON.stringify({ status: 'LIMITATION_OBSERVED_FULL_OLD_ENVELOPE', completeOldPairAccepted: true, oldZeroOfOneDisplayed: true, authoritativeCurrentHostOrder: 'UNKNOWN / NOT RUN', meaning: 'An internally matched complete old pair cannot prove current host generation; this is not anti-replay PASS.' }));
});

for (const mode of ['missing-public', 'missing-private', 'mismatch', 'malformed-public', 'malformed-private']) test(`S01/0C ${mode} delivery binding fails closed without grading leakage`, async t => {
  const [, result] = deliveryPair();
  if (mode === 'missing-public') delete result.structuredContent.deliveryId;
  if (mode === 'missing-private') delete result._meta.chatui.quizGrading.deliveryId;
  if (mode === 'mismatch') result._meta.chatui.quizGrading.deliveryId = '11111111-1111-4111-8111-111111111111';
  if (mode === 'malformed-public') result.structuredContent.deliveryId = { hidden: oldDeliveryMarker };
  if (mode === 'malformed-private') result._meta.chatui.quizGrading.deliveryId = oldDeliveryMarker;
  const app = await host(t); await app.deliver(result);
  assert.equal(app.button('提交答案'), undefined); assert.ok(app.status());
  for (const value of [app.root.outerHTML, app.status(), JSON.stringify(app.saved), JSON.stringify(app.outbound), JSON.stringify(app.window.__chatuiMetrics)]) { assert.ok(!value.includes(oldDeliveryMarker)); assert.ok(!value.includes(currentDeliveryMarker)); }
});

for (const html of [documentHtml, widgetHtml]) test(`S01/0C duplicate and same-grader new delivery preserve existing state semantics ${html === documentHtml ? 'document' : 'component'}`, async t => {
  const make = () => html === documentHtml ? boundaryResult('delivery-repeated') : projectQuizResult({ structuredContent: { schemaVersion: 1, contentId: 'delivery-repeated', type: 'quiz', data: copy(quiz) }, content: [] });
  const first = make(), fresh = make(), app = await host(t, { html }); await app.deliver(first); app.submit();
  assert.match(app.root.textContent, /1 \/ 1 正确/); const previousState = copy(app.saved.at(-1));
  await app.deliver(copy(first)); assert.match(app.root.textContent, /1 \/ 1 正确/); assert.equal(app.root.querySelectorAll('input:checked').length, 1);
  await app.globals(canonicalGlobals(copy(first))); assert.match(app.root.textContent, /1 \/ 1 正确/);
  await app.globals({ toolResponseMetadata: canonicalGlobals(copy(first)).toolResponseMetadata }); assert.match(app.root.textContent, /1 \/ 1 正确/);
  await app.deliver(fresh); assert.equal(app.root.querySelectorAll('input:checked').length, 1); assert.match(app.root.textContent, /1 \/ 1 正确/);
  await app.globals({ widgetState: previousState }); assert.equal(app.root.querySelectorAll('input:checked').length, 1); assert.match(app.root.textContent, /1 \/ 1 正确/);
  assert.ok(!JSON.stringify(app.saved).includes('deliveryId'), 'Per-result token is not copied into widget/model state');
});

test('S01/0C fast canonical switching discards stale metadata and recovers only the current delivery', async t => {
  const [older, current] = deliveryPair(), third = boundaryResult('s01-delivery-same', { questions: [{ ...copy(quiz.questions[0]), correct: 'choiceB', explanation: currentDeliveryMarker }] });
  const app = await host(t, { initialGlobals: canonicalGlobals(older) }); await app.complete();
  await app.globals({ toolOutput: current.structuredContent }); assert.equal(app.button('提交答案'), undefined);
  await app.globals({ toolOutput: third.structuredContent }); assert.equal(app.button('提交答案'), undefined);
  await app.globals({ toolResponseMetadata: canonicalGlobals(current).toolResponseMetadata }); assert.equal(app.button('提交答案'), undefined);
  await app.globals({ toolResponseMetadata: canonicalGlobals(third, 'mcp_tool_result').toolResponseMetadata });
  app.root.querySelector('input[value="choiceB"]').click(); app.button('提交答案').click(); assert.match(app.root.textContent, /1 \/ 1 正确/); assert.ok(!app.root.textContent.includes(oldDeliveryMarker));
  app.button('重新测试').click(); assert.equal(app.root.querySelectorAll('input:checked').length, 0); assert.ok(!app.root.textContent.includes(currentDeliveryMarker));
});

test('S01/0C cross-mount metadata mismatch and refresh do not restore an old submitted Quiz', async t => {
  const [older, current] = deliveryPair(), original = await host(t, { initialGlobals: canonicalGlobals(current) }); await original.complete();
  original.root.querySelector('input[value="choiceB"]').click(); original.button('提交答案').click(); const saved = copy(original.saved.at(-1));
  const refresh = await host(t, { initialGlobals: canonicalGlobals(current), widgetState: saved }); await refresh.complete();
  assert.equal(refresh.root.querySelectorAll('input:checked').length, 0); assert.equal(refresh.root.querySelector('.cui-feedback'), null);
  const cross = await host(t, { initialGlobals: { toolOutput: current.structuredContent, toolResponseMetadata: canonicalGlobals(older).toolResponseMetadata }, widgetState: saved }); await cross.complete();
  assert.equal(cross.button('提交答案'), undefined); assert.ok(!cross.root.textContent.includes(oldDeliveryMarker));
});

test('S01/0C multi-Quiz delivery grades current questions and copy/context omit all graders', async t => {
  const make = (correct, marker) => { const data = { questions: [{ ...copy(quiz.questions[0]), correct, explanation: marker }] }; const compiled = normalizeDocument({ contentId: 'delivery-multi', source: 'Before.\n\n:::quiz ' + JSON.stringify(data) + '\n:::\n\n:::quiz ' + JSON.stringify({ questions: [{ ...data.questions[0], id: 'q2', prompt: 'Second synthetic question?' }] }) + '\n:::\n\nAfter.' }); return projectQuizResult({ structuredContent: compiled.view, content: [{ type: 'text', text: compiled.text }] }); };
  const older = make('choiceA', oldDeliveryMarker), current = make('choiceB', currentDeliveryMarker), app = await host(t);
  await app.globals(canonicalGlobals(current)); await app.globals({ toolResponseMetadata: canonicalGlobals(older).toolResponseMetadata }); assert.equal(app.button('提交答案'), undefined);
  await app.deliver(current); assert.equal(app.root.querySelectorAll('input[value="choiceB"]').length, 2);
  for (const input of app.root.querySelectorAll('input[value="choiceB"]')) input.click();
  for (const button of [...app.root.querySelectorAll('button')].filter(button => button.textContent === '提交答案')) button.click();
  assert.equal([...app.root.querySelectorAll('.cui-count')].filter(node => node.textContent.includes('1 / 1 正确')).length, 2);
  assert.equal([...app.root.querySelectorAll('.cui-feedback')].filter(node => node.textContent.includes(currentDeliveryMarker)).length, 2);
  app.button('复制完整文档').click(); await tick(); await tick(150);
  for (const value of [JSON.stringify(app.copied), JSON.stringify(app.saved), JSON.stringify(app.outbound)]) { assert.ok(!value.includes(oldDeliveryMarker)); assert.ok(!value.includes(currentDeliveryMarker)); assert.doesNotMatch(value, /"(?:quizGrading|deliveryId|explanation)"\s*:|"correct"\s*:\s*"/); }
  assert.deepEqual(app.errors, []);
});

test('S01/0C grading-only changes remount only Quiz, preserve unrelated nodes and reject old metadata', async t => {
  const make = (correct, explanation) => {
    const raw = { schemaVersion: 1, contentId: 'delivery-keyed-grading', facts: {}, blocks: [
      { id: 'details', kind: 'collapse', summary: 'Unrelated disclosure', blocks: [{ id: 'reading', kind: 'prose', text: 'Stable public reading body.' }] },
      { id: 'question', kind: 'component', type: 'quiz', data: { questions: [{ ...copy(quiz.questions[0]), correct, explanation }] } }
    ] };
    const normalized = normalizeResponse(raw); return projectQuizResult({ structuredContent: normalized.view, content: [{ type: 'text', text: normalized.text }] });
  };
  const older = make('choiceA', oldDeliveryMarker), current = make('choiceB', currentDeliveryMarker);
  assert.deepEqual(withoutDelivery(older.structuredContent), withoutDelivery(current.structuredContent));
  const app = await host(t, { html: responseHtml }); await app.deliver(older);
  const details = app.root.querySelector('details'), reading = [...app.root.querySelectorAll('p')].find(node => node.textContent === 'Stable public reading body.'), oldInput = app.root.querySelector('input[value="choiceA"]');
  details.querySelector('summary').click(); assert.equal(details.open, true); app.submit(); const before = copy(app.saved.at(-1));
  await app.deliver(current);
  assert.equal(app.root.querySelector('details'), details); assert.equal(details.open, true);
  assert.equal([...app.root.querySelectorAll('p')].find(node => node.textContent === 'Stable public reading body.'), reading);
  assert.notEqual(app.root.querySelector('input[value="choiceA"]'), oldInput); assert.equal(app.root.querySelectorAll('input:checked').length, 0);
  assert.ok(!app.root.textContent.includes(oldDeliveryMarker)); assert.ok(!app.root.textContent.includes(currentDeliveryMarker));
  app.root.querySelector('input[value="choiceB"]').click(); const after = copy(app.saved.at(-1));
  assert.equal(before.privateContent.chatuiResponse.identity, after.privateContent.chatuiResponse.identity);
  assert.notEqual(before.privateContent.chatuiResponse.blocks.question.privateContent.chatui.identity, after.privateContent.chatuiResponse.blocks.question.privateContent.chatui.identity, 'Changed grader remounts the Quiz with a fresh nonce');
  app.button('提交答案').click(); assert.match(app.root.textContent, /1 \/ 1 正确/); assert.ok(app.root.textContent.includes(currentDeliveryMarker));
  await app.globals(canonicalGlobals(current)); await app.globals({ toolResponseMetadata: canonicalGlobals(older).toolResponseMetadata });
  assert.equal(app.button('提交答案'), undefined); assert.ok(!app.root.textContent.includes(oldDeliveryMarker));
  await app.globals(canonicalGlobals(current)); app.root.querySelector('input[value="choiceB"]').click(); app.button('提交答案').click(); assert.match(app.root.textContent, /1 \/ 1 正确/);
});


// Capability timing uses documented host messages and our own synthetic data.
function mixedCapabilityResult() {
  const form = g10();
  return projectQuizResult({ structuredContent: normalizeDocument({ ...form, contentId: 'capability-ordering', source: form.source + `\n\n:::quiz ${JSON.stringify(quiz)}\n:::` }).view });
}
async function initializeWith(app, capabilities) {
  const init = app.outbound.find(message => message.method === 'ui/initialize');
  assert.ok(init);
  app.send({ jsonrpc: '2.0', id: init.id, result: { hostCapabilities: capabilities } }); await tick();
}
const followupButton = app => [...app.root.querySelectorAll('button')].find(node => /继续讨论本次结果|查看可复制的后续问题/.test(node.textContent));

test('capabilities: late permission updates existing Quiz control without remounting form or Quiz', async t => {
  const app = await host(t, { deferInitialize: true }), result = mixedCapabilityResult();
  await app.globals(canonicalGlobals(result));
  const field = app.root.querySelector('[data-form-field="title"]');
  field.value = 'preserved draft'; field.dispatchEvent(new app.window.Event('input', { bubbles: true })); app.submit();
  const button = followupButton(app), choice = app.root.querySelector('input[value="choiceA"]'); assert.equal(button.textContent, '查看可复制的后续问题');
  const saves = app.saved.length;
  await initializeWith(app, { message: {} });
  assert.equal(followupButton(app), button); assert.equal(button.textContent, '继续讨论本次结果');
  assert.equal(app.root.querySelector('[data-form-field="title"]'), field); assert.equal(field.value, 'preserved draft');
  assert.equal(app.root.querySelector('input[value="choiceA"]'), choice); assert.equal(choice.checked, true);
  assert.equal(app.saved.length, saves, 'Capability updates are not user state changes');
  button.click(); await tick(); assert.equal(app.outbound.filter(m => m.method === 'ui/message').length, 1);
  noPrivate(app.outbound, 'late permitted follow-up');
});

for (const capabilities of [{}, { message: false }, { message: 'unsupported' }]) test(`capabilities: standard ${JSON.stringify(capabilities)} disallows stale native action`, async t => {
  const sent = [], app = await host(t, { deferInitialize: true, nativeFollowup: payload => sent.push(payload) });
  await app.globals(canonicalGlobals(boundaryResult())); app.submit();
  const button = followupButton(app); assert.equal(button.textContent, '继续讨论本次结果');
  await initializeWith(app, capabilities);
  assert.equal(followupButton(app), button); assert.equal(button.textContent, '查看可复制的后续问题');
  button.click(); await tick(); assert.equal(sent.length, 0); assert.equal(app.outbound.filter(m => m.method === 'ui/message').length, 0);
  assert.equal(app.root.querySelector('.cui-followup-copy').hidden, false); noPrivate(app.root.querySelector('.cui-followup-copy').value, 'revoked copy');
});

test('capabilities: native removal is checked at click time and refresh never sends automatically', async t => {
  const sent = [], app = await host(t, { deferInitialize: true, nativeFollowup: payload => sent.push(payload) });
  await app.globals(canonicalGlobals(boundaryResult())); app.submit(); const button = followupButton(app);
  delete app.window.openai.sendFollowUpMessage;
  button.click(); await tick(); assert.equal(sent.length, 0); assert.equal(app.outbound.filter(m => m.method === 'ui/message').length, 0);
  await app.globals({}); assert.equal(followupButton(app), button); assert.equal(button.textContent, '查看可复制的后续问题');
  assert.equal(app.root.querySelector('.cui-followup-copy').hidden, false);
});

test('capabilities: foreign reply cannot grant message, context update or link actions', async t => {
  const app = await host(t, { deferInitialize: true });
  const init = app.outbound.find(m => m.method === 'ui/initialize');
  app.window.dispatchEvent(new app.window.MessageEvent('message', { source: app.window, data: { jsonrpc: '2.0', id: init.id, result: { hostCapabilities: { message: {}, updateModelContext: {}, openLinks: {} } } } }));
  await app.globals(canonicalGlobals(boundaryResult())); app.submit(); followupButton(app).click(); await tick(150);
  assert.equal(app.outbound.filter(m => ['ui/message', 'ui/update-model-context', 'ui/open-link'].includes(m.method)).length, 0);
  assert.equal(app.root.querySelector('.cui-followup-copy').hidden, false);
});


test('startup recovery: cold missing Quiz metadata fails closed, then complete native pair recovers', async t => {
  const result = boundaryResult('cold-quiz-native-recovery'), app = await host(t, { deferInitialize: true });
  await app.deliver({ structuredContent: result.structuredContent });
  assert.equal(app.button('提交答案'), undefined); assert.ok(app.status()); noPrivate(app.root.textContent, 'cold rejected Quiz');
  await app.globals(canonicalGlobals(result));
  assert.ok(app.button('提交答案')); noPrivate(app.root.textContent, 'recovered unsubmitted Quiz');
  assert.equal(app.status(), ''); app.submit(); assert.ok(app.root.textContent.includes(privateMarker));
  noPrivate(app.saved, 'cold recovery saved state'); noPrivate(app.outbound, 'cold recovery outbound');
  assert.deepEqual(app.errors, []);
});
