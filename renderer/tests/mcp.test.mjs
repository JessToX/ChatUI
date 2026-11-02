import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handleMcp, RESPONSE_RESOURCE_URI, RESOURCE_URI, EXPLANATION_RESOURCE_URI, DOCUMENT_RESOURCE_URI, TOOL, MAX_BYTES } from '../lib/mcp.mjs';
import { validateComponent, TYPES } from '../lib/component-validation.mjs';
import { hydrateQuizView } from '../lib/quiz-boundary.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../lib/vendor/component-examples.json', import.meta.url)));
const copy = value => JSON.parse(JSON.stringify(value));
function request(method, params = {}, { signed = false, raw, headers = {}, verb = 'POST' } = {}) {
  return new Request('https://renderer.test/mcp', { method: verb, headers: { 'content-type': 'application/json', ...(signed ? { 'oai-authenticated-user-id': 'synthetic-test-user', 'oai-authenticated-user-email': 'test@example.invalid' } : {}), ...headers }, ...(verb === 'POST' ? { body: raw ?? JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) } : {}) });
}
const call = async (method, params, options) => (await handleMcp(request(method, params, options))).json();

test('initialization, discovery and public static resource expose actual inline MCP Apps metadata', async () => {
  const init = await call('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const tool = (await call('tools/list')).result.tools[0];
  assert.equal(tool.name, 'render_html'); assert.equal(tool._meta.ui.resourceUri, RESPONSE_RESOURCE_URI);
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  const resource = (await call('resources/read', { uri: RESOURCE_URI })).result.contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.match(resource.text, /ui\/initialize/); assert.match(resource.text, /ui\/notifications\/tool-result/);
  assert.doesNotMatch(resource.text, /synthetic-test-user|<script[^>]+src=|fetch\(|localStorage|sessionStorage/);
  assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
  assert.equal((await call('resources/list')).result.resources.length, 4);
});

test('all 17 real fixture types pass the remote tool, return identical validated data and no fake rendered claim', async () => {
  for (const type of TYPES) {
    const config = copy(fixtures[type]);
    if (type === 'media-panel') config.data.items.forEach(item => delete item.imageUrl);
    const reply = await call('tools/call', { name: TOOL.name, arguments: config }, { signed: true });
    assert.equal(reply.result.isError, undefined, `${type}: ${JSON.stringify(reply)}`);
    assert.deepEqual(hydrateQuizView(reply.result.structuredContent, reply.result._meta), config);
    assert.match(reply.result.content[0].text, /实际显示由客户端完成/);
  }
});

test('new bridge resource revisions are defaults while all previous URIs remain readable aliases', async () => {
  const currentUri = 'ui://chatui/renderer-v5.html';
  assert.equal(RESOURCE_URI, currentUri);
  assert.equal(EXPLANATION_RESOURCE_URI, 'ui://chatui/explanation-v4.html');
  assert.equal((await call('initialize')).result.serverInfo.version, '1.6.1-iteration.1');
  const tools = (await call('tools/list')).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['render_html', 'render_response', 'render_component', 'render_incline_forces', 'render_explanation', 'render_document']);
  for (const tool of tools) {
    const expectedUri = tool.name === 'render_document' ? DOCUMENT_RESOURCE_URI : ['render_html', 'render_response'].includes(tool.name) ? RESPONSE_RESOURCE_URI : tool.name === 'render_explanation' ? EXPLANATION_RESOURCE_URI : currentUri;
    assert.equal(tool._meta.ui.resourceUri, expectedUri);
    assert.equal(tool._meta['openai/outputTemplate'], expectedUri);
  }
  assert.deepEqual((await call('resources/list')).result.resources.map(resource => resource.uri), [DOCUMENT_RESOURCE_URI, RESPONSE_RESOURCE_URI, currentUri, EXPLANATION_RESOURCE_URI]);
  const current = (await call('resources/read', { uri: currentUri })).result.contents[0];
  assert.equal(current.uri, currentUri);
  for (const legacyUri of ['ui://chatui/renderer-v1.html', 'ui://chatui/renderer-v2.html', 'ui://chatui/renderer-v3.html', 'ui://chatui/renderer-v4.html']) {
    const legacy = (await call('resources/read', { uri: legacyUri })).result.contents[0];
    assert.equal(legacy.uri, legacyUri); assert.equal(legacy.text, current.text);
    assert.equal(legacy.mimeType, current.mimeType); assert.deepEqual(legacy._meta, current._meta);
  }
  const explanation = (await call('resources/read', { uri: EXPLANATION_RESOURCE_URI })).result.contents[0];
  const legacyExplanation = (await call('resources/read', { uri: 'ui://chatui/explanation-v1.html' })).result.contents[0];
  assert.equal(legacyExplanation.uri, 'ui://chatui/explanation-v1.html');
  assert.equal(legacyExplanation.text, explanation.text); assert.equal(legacyExplanation.mimeType, explanation.mimeType);
  assert.deepEqual(legacyExplanation._meta, explanation._meta);
  assert.notEqual(explanation.text, current.text);
  assert.equal((await call('resources/read', { uri: 'ui://chatui/unknown.html' })).error.code, -32002);
});

test('all twenty current and legacy URI reads preserve aliases while discovery advertises only four current resources', async () => {
  const aliases = {
    'ui://chatui/response-v7.html': ['ui://chatui/response-v7.html', 'ui://chatui/response-v6.html', 'ui://chatui/response-v5.html', 'ui://chatui/response-v4.html', 'ui://chatui/response-v3.html', 'ui://chatui/response-v2.html', 'ui://chatui/response-v1.html'],
    'ui://chatui/renderer-v5.html': ['ui://chatui/renderer-v5.html', 'ui://chatui/renderer-v4.html', 'ui://chatui/renderer-v3.html', 'ui://chatui/renderer-v2.html', 'ui://chatui/renderer-v1.html'],
    'ui://chatui/explanation-v4.html': ['ui://chatui/explanation-v4.html', 'ui://chatui/explanation-v3.html', 'ui://chatui/explanation-v2.html', 'ui://chatui/explanation-v1.html'],
    'ui://chatui/document-v4.html': ['ui://chatui/document-v4.html', 'ui://chatui/document-v3.html', 'ui://chatui/document-v2.html', 'ui://chatui/document-v1.html']
  };
  const discovered = (await call('resources/list')).result.resources.map(resource => resource.uri);
  assert.deepEqual([...discovered].sort(), Object.keys(aliases).sort());
  assert.deepEqual((await call('resources/templates/list')).result.resourceTemplates, []);
  let reads = 0;
  for (const [uri, group] of Object.entries(aliases)) {
    const current = (await call('resources/read', { uri })).result.contents[0];
    for (const alias of group) {
      const reply = await call('resources/read', { uri: alias });
      assert.equal(reply.error, undefined, alias);
      const resource = reply.result.contents[0];
      assert.equal(resource.uri, alias);
      assert.equal(resource.text, current.text);
      assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
      assert.deepEqual(resource._meta, current._meta);
      assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
      if (alias !== uri) assert.equal(discovered.includes(alias), false, `${alias} is a read alias, not discovery`);
      reads++;
    }
  }
  assert.equal(reads, 20);
});

test('input-form and generated scene are additive; all previous S01 authoring and Quiz contracts stay frozen', async () => {
  // Input hashes captured independently from the original e8a6a07d baseline.
  // Four output hashes describe the closed public Quiz and result-instance ID.
  const inputs = {
    render_html: 'c6d1920eec26bc77abaa56d378cd86c79f74ff56d2f8fcf7bf9e46a1d582c7f4',
    render_response: 'abc0a9367e23a24cafcc7a00009569f82634f28479739ab0a55a5630000f229c',
    render_component: '037b8050c72d87600c223d8cf0f48f381e2157ff96e3ef5b09a5cb1a53645b6f',
    render_incline_forces: '8e9aa0389f21fd49a548259a1541c6edf77cb0d26392ddd2f0712ce43860d407',
    render_explanation: 'e04e7a297625fd1a00e64915423957561edfa651e78d6356c6ac9e567a7330b2',
    render_document: '5530398bf596ea97457986dfcaf2ef591883dae33325be978f1cd7c0d90b595a'
  };
  const schemas = {
    render_html: 'cd6ad80f01746b81bb7874a08ab95b5909f87cd9653b44fd3ae3ff0c0b198362',
    render_response: 'f8ea2542084246c3b45ac57a6bd397c9566d69ef8bd1c5541039c18eba022b69',
    render_component: '9a0b4c5044b2aea26ff3dbd52ebe1f7c776b5b2a41f0610d703641fe2686147a',
    render_incline_forces: 'ec4e9565f3ed7badc1002a01784d2ebcb708e02c81f058d2fe231db15be1e852',
    render_explanation: '14cdb135d1d7a68fea7e130f5e6a56a200a959efba79e28b4655daf3bb2c4ec2',
    render_document: '5fb50d6f5e0c24b161fa670740bc577aa31a803cec2636ac3e43dc47dcb61c23'
  };
  const tools = (await call('tools/list')).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), Object.keys(schemas));
  // Project out exactly the reviewed additive vocabulary, then require the
  // original independent hashes. Quiz isolation and every old schema stay frozen.
  const legacySchema = value => {
    if (Array.isArray(value)) return value.filter(item => item !== 'input-form' && item?.$ref !== '#/$defs/scene').map(legacySchema);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'scene' && !key.startsWith('scene')).map(([key, child]) => [key, legacySchema(child)]));
    if (typeof value === 'string') return value.replace(/input-form:\{fields:.*?No passwords, files, actions, URLs or executable validation\. /, '').replace(/input-form:\{fields:.*?local snapshot only, total input capacity <=1000 chars, at most 8 fields and 500 characters per text field\. /, '');
    return value;
  };
  for (const tool of tools) {
    assert.equal(createHash('sha256').update(JSON.stringify(legacySchema(tool.inputSchema))).digest('hex'), inputs[tool.name], `${tool.name} unchanged legacy authoring schema`);
    const hash = createHash('sha256').update(JSON.stringify(legacySchema({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }))).digest('hex');
    assert.equal(hash, schemas[tool.name], `${tool.name} input/output schema contract`);
  }
  for (const protocolVersion of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']) {
    const initialized = (await call('initialize', { protocolVersion })).result;
    assert.equal(initialized.protocolVersion, protocolVersion);
    assert.deepEqual(initialized.serverInfo, { name: 'chatui-renderer', version: '1.6.1-iteration.1' });
    assert.match(initialized.instructions, /^Use continuous, self-contained native prose/);
    assert.match(initialized.instructions, /Interpret why, reasons and principles using topic and referent/);
    assert.match(initialized.instructions, /never force them to mean the most recently changed parameter/);
    assert.match(initialized.instructions, /Do not send messages, regenerate answers or call tools automatically/);
    assert.doesNotMatch(initialized.instructions, /Use render_document.*default/);
  }
  const document = (await call('tools/call', {
    name: 'render_document', arguments: { contentId: 'phase3-v1-contract', source: '# Contract\n\nBODY-END' }
  }, { signed: true })).result;
  assert.equal(document.isError, undefined);
  assert.equal(document.structuredContent.documentVersion, 1);
  assert.equal(document._meta.chatui.documentVersion, 1);
  assert.match(document.content[0].text, /BODY-END/);
  assert.equal(DOCUMENT_RESOURCE_URI, 'ui://chatui/document-v4.html');
});

test('tool data calls fail closed without both platform identity headers', async () => {
  for (const headers of [{}, { 'oai-authenticated-user-id': 'id-only' }, { 'oai-authenticated-user-email': 'email-only' }]) {
    const reply = await handleMcp(request('tools/call', { name: TOOL.name, arguments: fixtures.progress }, { headers }));
    assert.equal(reply.status, 401); assert.equal((await reply.json()).error.code, -32001);
  }
});

test('foreign and opaque origins fail while same-origin and server-to-server discovery work', async () => {
  for (const origin of ['https://untrusted.invalid', 'null', 'https://renderer.test.evil.invalid']) {
    const response = await handleMcp(request('tools/list', {}, { headers: { origin } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await handleMcp(request('tools/list', {}, { headers: { origin: 'https://renderer.test' } }))).status, 200);
  assert.equal((await handleMcp(request('resources/read', { uri: RESOURCE_URI }))).status, 200);
});

test('malformed JSON, arrays, unknown methods and notifications follow explicit protocol errors', async () => {
  assert.equal((await handleMcp(request('', {}, { raw: '{' }))).status, 400);
  assert.equal((await call('', {}, { raw: '[]' })).error.code, -32600);
  assert.equal((await call('imaginary')).error.code, -32601);
  assert.equal((await call('resources/read', { uri: 'ui://unknown' })).error.code, -32002);
  assert.equal((await handleMcp(request('', {}, { raw: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }))).status, 202);
  assert.equal((await handleMcp(request('', {}, { verb: 'GET' }))).status, 405);
  assert.equal((await handleMcp(request('', {}, { headers: { 'content-type': 'text/plain' } }))).status, 415);
});

test('oversized body and deeply nested inputs are rejected before rendering', async () => {
  const response = await handleMcp(request('', {}, { raw: 'x'.repeat(MAX_BYTES + 1) }));
  assert.equal(response.status, 413);
  let value = {}; for (let i = 0; i < 25; i++) value = { more: value };
  assert.throws(() => validateComponent({ ...fixtures.progress, data: value }), /过深/);
});

test('unknown force magnitudes, mixed angle/numeric modes and pseudo-forces are rejected', async () => {
  const base = { schemaVersion: 1, contentId: 'known-g-10', type: 'force-diagram', data: { body: '物块', unit: 'N', forces: [{ id: 'weight', label: '重力', fx: 0, fy: -20 }] } };
  for (const bad of [{ ...base.data.forces[0], fy: null }, { ...base.data.forces[0], fy: 'unknown' }, { ...base.data.forces[0], angle: -90 }, { ...base.data.forces[0], kind: 'component' }]) {
    const response = await call('tools/call', { name: TOOL.name, arguments: { ...base, data: { ...base.data, forces: [bad] } } }, { signed: true });
    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent, undefined);
  }
  assert.deepEqual(validateComponent(base).data.forces[0], { id: 'weight', label: '重力', fx: 0, fy: -20 });
});

test('prototype payloads, script MathML, outbound images and invalid quizzes fail safely', () => {
  assert.throws(() => validateComponent(JSON.parse('{"schemaVersion":1,"contentId":"x","type":"profile","data":{"name":"x","__proto__":{"polluted":true}}}')), /属性/);
  assert.throws(() => validateComponent({ ...fixtures.answer, data: { title: 'x', math: { tag: 'script', text: 'alert(1)' } } }), /MathML/);
  const media = copy(fixtures['media-panel']); media.data.items[0].imageUrl = 'https://third-party.invalid/pixel';
  assert.throws(() => validateComponent(media), /不自动请求/);
  const quiz = copy(fixtures.quiz); quiz.data.questions[0].correct = 'not-an-option';
  assert.throws(() => validateComponent(quiz), /正确答案/);
  assert.equal({}.polluted, undefined);
});


test('resource revisions use the reviewed bridge, exact MIME and closed URI allowlist', async () => {
  for (const { uri } of (await call('resources/list')).result.resources) {
    const resource = (await call('resources/read', { uri })).result.contents[0];
    assert.match(resource.text, /const connectionPendingMessage/);
    assert.match(resource.text, /standardInitialized/);
    assert.match(resource.text, /!event\.persisted/);
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  }
  for (const uri of ['ui://chatui/document-v99.html', 'ui://chatui/document-v2.html?cache=1', 'https://untrusted.invalid/document-v2.html']) {
    assert.equal((await call('resources/read', { uri })).error.code, -32002);
  }
});

test('startup resource transport uses JSON while embedded UI declares the MCP Apps MIME', async () => {
  const resources = (await call('resources/list')).result.resources;
  for (const { uri } of resources) {
    const response = await handleMcp(request('resources/read', { uri }));
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^application\/json\b/);
    const resource = (await response.json()).result.contents[0];
    assert.equal(resource.uri, uri); assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.equal(resource._meta.ui.prefersBorder, false);
    assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
    assert.match(resource.text, /id="chatui-status" role="status">[^<]+<\/p>/);
  }
});
