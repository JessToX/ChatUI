import { mkdir, writeFile } from 'node:fs/promises';
import { comparisonData } from './document-comparison-fixtures.mjs';
import { projectQuizResult } from '../lib/quiz-boundary.mjs';
import { trustedFixtureDeliveryId } from './quiz-fixture-delivery.mjs';
const output = new URL('../public/examples/', import.meta.url);
await mkdir(output, { recursive: true });
for (const { id, payloads, results } of comparisonData()) {
  for (const [name, payload] of Object.entries(payloads)) await writeFile(new URL(`benchmark-${id}-${name}.input.json`, output), payload + '\n');
  for (const [name, result] of Object.entries(results)) await writeFile(new URL(`benchmark-${id}-${name}.json`, output), JSON.stringify(projectQuizResult({ structuredContent: result.view, content: [{ type: 'text', text: result.text }] }, { deliveryId: trustedFixtureDeliveryId(`comparison:${id}:${name}`) })));
}
console.log('Generated deterministic matched comparison fixtures; no timing or clock data');
