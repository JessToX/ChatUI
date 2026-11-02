import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleMcp } from '../lib/mcp.mjs';
import { DOCUMENT_ROUTING_INSTRUCTIONS, documentRoutingCases } from '../lib/document-routing.mjs';
const rpc = async (method, testRouting) => (await handleMcp(new Request('https://test.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }) }), { documentRouting: testRouting })).json();
test('checkpoint 4: test routing changes only explicitly enabled discovery, preserves every input contract', async () => {
  const legacy = (await rpc('tools/list', false)).result.tools;
  const staging = (await rpc('tools/list', true)).result.tools;
  assert.deepEqual(staging.map(t => t.name), legacy.map(t => t.name));
  staging.forEach((tool, index) => { assert.deepEqual(tool.inputSchema, legacy[index].inputSchema); assert.deepEqual(tool._meta, legacy[index]._meta); });
  assert.match(legacy[0].description, /Compatibility entry for explicit safe semantic HTML/);
  assert.match(legacy.find(tool => tool.name === 'render_response').description, /Default UI authoring entry/);
  for (const tool of staging) assert.doesNotMatch(tool.description, /ordinary explanations.*use render_html|Ordinary explanations.*use render_html|ordinary answers use render_html|Ordinary responses use render_html/);
  assert.equal((await rpc('initialize', true)).result.instructions, DOCUMENT_ROUTING_INSTRUCTIONS);
  assert.match(DOCUMENT_ROUTING_INSTRUCTIONS, /do not publish a substantial native explanation before/);
  assert.match(DOCUMENT_ROUTING_INSTRUCTIONS, /After success, native output contains only/);
  const normalInstructions = (await rpc('initialize', false)).result.instructions;
  assert.match(normalInstructions, /continuous, self-contained native prose/);
  assert.match(normalInstructions, /Call render_response only when a local visual or interaction materially improves understanding/);
  assert.notEqual(normalInstructions, DOCUMENT_ROUTING_INSTRUCTIONS);
});
test('routing prompt fixture records all ten required expectations without pretending to execute a model', () => {
  assert.equal(documentRoutingCases.length, 10);
  const skill = readFileSync(new URL('./fixtures/document-routing-skill.md', import.meta.url), 'utf8');
  assert.match(skill, /逐字翻译/); assert.match(skill, /只用纯 Markdown/); assert.match(skill, /优先一次 `render_document`/);
  assert.equal(documentRoutingCases.filter(c => c.expected === 'native').length, 3);
  assert.ok(documentRoutingCases.every(c => c.prompt && c.expected));
});
