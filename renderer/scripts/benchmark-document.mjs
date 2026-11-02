// Explicit QA command only. Timing reports never enter public preview generation.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { comparisonData } from './document-comparison-fixtures.mjs';
const measure = fn => { const times = []; for (let i = 0; i < 10; i++) fn(); for (let i = 0; i < 100; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); } times.sort((a, b) => a - b); return { p50Ms: +times[49].toFixed(3), p95Ms: +times[94].toFixed(3), repetitions: 100 }; };
const rows = comparisonData().map(row => ({ id: row.id, source: row.source, authoring: row.authoring, ratioToCompactResponse: row.ratioToCompactResponse, ratioToGranularResponse: row.ratioToGranularResponse, normalizedView: row.normalizedView, canonicalChineseCharacters: row.canonicalChineseCharacters, compile: measure(() => normalizeDocument(row.documentInput)) }));
const report = { measuredAt: new Date().toISOString(), method: 'Fixed synthetic fixtures; compile timings only. HTML is a static approximation, not equivalent interactive functionality.', tokens: null, modelInputTimeMs: null, realHostLatencyMs: null, rows };
const destination = process.argv[2] || fileURLToPath(new URL('../outputs/document-benchmark.json', import.meta.url));
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(`Benchmarked ${rows.length} synthetic fixtures; local QA report written`);
