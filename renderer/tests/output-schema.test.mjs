import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { HTML_TOOL, RESPONSE_TOOL } from '../lib/mcp.mjs';
import { normalizeHtml } from '../lib/html-normalization.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';
import { RESPONSE_SCHEMA } from '../lib/response-validation.mjs';
import { htmlFactories } from '../examples/html.mjs';
import { responseFactories } from '../examples/responses.mjs';
import { projectQuizView } from '../lib/quiz-boundary.mjs';
const ajv = new Ajv({ strict: false, allErrors: true });
const validHtml = ajv.compile(HTML_TOOL.outputSchema);
const validResponse = ajv.compile(RESPONSE_TOOL.outputSchema);

test('declared HTML output schema accepts every normalized HTML reference', () => {
  for (const factory of Object.values(htmlFactories)) {
    const { view } = normalizeHtml(factory());
    assert.equal(validHtml(view), true, JSON.stringify(validHtml.errors));
    assert.equal(validHtml({ ...view, fallbackText: 'not view data' }), false);
  }
});
test('structured output schema describes normalized views without changing the old input schema', () => {
  assert.deepEqual(RESPONSE_TOOL.inputSchema, RESPONSE_SCHEMA);
  for (const factory of Object.values(responseFactories)) {
    for (const options of [{}, { changed: true }]) {
      const { view } = normalizeResponse(factory(options));
      assert.equal(validResponse(projectQuizView(view).view), true, JSON.stringify(validResponse.errors));
      const unversioned = { ...view }; delete unversioned.viewVersion;
      assert.equal(validResponse(unversioned), false);
    }
  }
});
test('output schema accepts compiled matrices, rich inline math, nested controls and empty math tokens', () => {
  const { view } = normalizeResponse({ schemaVersion: 1, contentId: 'schema-matrix', facts: {}, blocks: [
    { id: 'formula', kind: 'math', tex: String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}` },
    { id: 'text', kind: 'prose', text: 'Inline $x^2$ and **strong**, _em_, ~~del~~.\n\n> Quote\n\n| A | B |\n|---|---|\n| 1 | 2 |' },
    { id: 'fold', kind: 'collapse', summary: 'More', blocks: [{ id: 'blankmath', kind: 'math', math: { tag: 'mi', text: '' } }] }
  ] });
  assert.equal(validResponse(view), true, JSON.stringify(validResponse.errors));
  assert.equal(validResponse({ ...view, mode: 'html' }), false);
});
