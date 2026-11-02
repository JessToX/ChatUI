import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { comparisonData } from '../scripts/document-comparison-fixtures.mjs';
import { fixtures } from '../examples/rc-fixtures.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { rendererVersion } from '../lib/version.generated.mjs';

test('ordinary matched fixture generation is deterministic and carries no timing data', () => {
  const first = comparisonData(), second = comparisonData();
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  for (const row of first) {
    assert.equal(Object.hasOwn(row, 'compile'), false);
    assert.equal(Object.hasOwn(row, 'measuredAt'), false);
    for (const result of Object.values(row.results)) assert.ok(result.text.length > 30);
  }
  const generator = readFileSync(new URL('../scripts/generate-preview.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(generator, /benchmark-document/);
});

test('formal RC fixtures retain complete body and bounded math fallback without experiment imports', () => {
  assert.equal(Object.keys(fixtures).length, 6);
  for (const [name, input] of Object.entries(fixtures)) {
    const result = normalizeDocument(input);
    assert.equal(result.mathDiagnostics.length, name === 'broken' ? 2 : 0);
    if (name === 'broken') assert.ok(result.text.includes('RC-END'));
    if (name === 'long') assert.ok(result.text.includes('RC-LONG-END'));
  }
  for (const file of ['generate-rc-fixtures.mjs', 'rc-cold-warm.mjs']) {
    assert.doesNotMatch(readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8'), /experiments\/rc-hardening/);
  }
});

test('renderer version metadata derives from package and agrees with lockfile', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.equal(rendererVersion, pkg.version); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
});
