import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { normalizeResponse } from '../lib/response-normalization.mjs';

const directive = (type, data) => `:::${type} ${JSON.stringify(data)}\n:::`;
test('complete fallback keeps successful formula content when its label is descriptive', () => {
  for (const type of ['answer', 'comparison', 'steps', 'timeline', 'reveal-steps']) {
    const record = { title: 'FORMULA_TITLE', detail: 'FORMULA_DETAIL', mathLabel: 'Energy relationship', tex: 'E=mc^2' };
    const data = type === 'answer' ? record : { items: [{ ...record, ...(type === 'comparison' ? { label: 'Case' } : {}) }] };
    const { text } = normalizeDocument({ contentId: 'fallback-formula', source: directive(type, data) });
    assert.ok(text.includes('Energy relationship'), type);
    assert.match(text, /E=mc/, type);
    assert.ok(text.includes('FORMULA_DETAIL'), type);
  }
});
test('complete fallback retains media caption, attribution and configured observation time', () => {
  const media = { items: [{ title: 'Source', body: 'Body', alt: 'Text alternative', sourceLabel: 'Example', sourceUrl: 'https://example.com/source', caption: 'CAPTION_MARKER', credit: 'CREDIT_MARKER' }] };
  const motion = { initialVelocity: 2, acceleration: 3, duration: 4, time: 1, unit: 'SI' };
  const source = directive('media-panel', media) + '\n\n' + directive('motion-lab', motion);
  const { text } = normalizeDocument({ contentId: 'fallback-metadata', source });
  for (const marker of ['CAPTION_MARKER', 'CREDIT_MARKER', '初始观察时间 t=1 s']) assert.ok(text.includes(marker), marker);
});
test('structured fallback also preserves labeled MathML and keeps Quiz grading private', () => {
  const { text } = normalizeResponse({ schemaVersion: 1, contentId: 'fallback-structured', facts: {}, blocks: [
    { id: 'a', kind: 'component', type: 'answer', data: { title: 'Result', mathLabel: 'Meaningful label', math: { tag: 'mi', text: 'FORMULA_SYMBOL' } } },
    { id: 'q', kind: 'component', type: 'quiz', data: { questions: [{ id: 'one', prompt: 'Public prompt', options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }], correct: 'b', explanation: 'PRIVATE_EXPLANATION' }] } }
  ] });
  assert.ok(text.includes('Meaningful label'));
  assert.ok(text.includes('FORMULA_SYMBOL'));
  assert.ok(text.includes('Public prompt'));
  assert.doesNotMatch(text, /PRIVATE_EXPLANATION|"correct"|"explanation"/);
});
