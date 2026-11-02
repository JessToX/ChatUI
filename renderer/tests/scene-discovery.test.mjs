import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { handleMcp } from '../lib/mcp.mjs';
import { projectScene } from '../lib/scene-runtime.mjs';

const rpc = async (method, params = {}, signed = false) => {
  const response = await handleMcp(new Request('https://renderer.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signed ? {
      'oai-authenticated-user-id': 'synthetic-metadata-test',
      'oai-authenticated-user-email': 'metadata@example.invalid'
    } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }));
  return response.json();
};

// Exercise the model-visible description without reading local fixtures/schema
// definitions to construct the input. This is a synthetic metadata check only.
async function publishedExample() {
  const tool = (await rpc('tools/list')).result.tools.find(t => t.name === 'render_response');
  const examples = tool.description.split('\n').filter(line => line.startsWith('{"schemaVersion":'));
  assert.equal(examples.length, 1, 'one directly usable generic example in the descriptor');
  return { tool, input: JSON.parse(examples[0]) };
}

test('public descriptor alone supplies a scene example accepted by schema and the real tool handler', async () => {
  const { tool, input } = await publishedExample();
  const check = new Ajv({ strict: false }).compile(tool.inputSchema);
  assert.equal(check(input), true, JSON.stringify(check.errors));
  const { result } = await rpc('tools/call', { name: tool.name, arguments: input }, true);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.blocks[0].kind, 'scene');
  assert.match(result.content[0].text, /2 × 10 = 20/);
  assert.match(result.content[0].text, /Parameter/);
  // The published sample cannot become an alternate arbitrary-source path.
  const invalid = structuredClone(input);
  invalid.blocks[0].root.children[0].oninput = 'fetch("https://example.invalid")';
  assert.equal((await rpc('tools/call', { name: tool.name, arguments: invalid }, true)).result.isError, true);
});

test('descriptor binding example stays valid across its advertised range and shares independently checked readings and coordinates', async () => {
  const { input } = await publishedExample();
  const scene = input.blocks[0];
  for (const [amount, expected] of [[1, 10], [3.5, 35], [5, 50]]) {
    const view = projectScene(scene, { amount });
    assert.equal(view.root.children[1].text, `${amount} × 10 = ${expected}`);
    assert.equal(view.root.children[2].marks[0].x2, expected);
  }
  assert.throws(() => projectScene(scene, { amount: 6 }));
  assert.throws(() => projectScene(scene, { amount: '3.5' }));
});
