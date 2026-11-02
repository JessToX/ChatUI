import { mkdir, copyFile, writeFile, access, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleFactories, learningExample, writingExample, progressExample } from '../examples/explanations.mjs';
import { validateExplanation } from '../lib/explanation-validation.mjs';
import { projectQuizResult } from '../lib/quiz-boundary.mjs';
import { trustedFixtureDeliveryId } from './quiz-fixture-delivery.mjs';

const resultFor = (view, text, instanceLabel) => projectQuizResult({ structuredContent: view, content: [{ type: 'text', text }] }, { deliveryId: trustedFixtureDeliveryId(instanceLabel) });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'public/examples'), { recursive: true });
for (const [id, build] of Object.entries(exampleFactories)) {
  await writeFile(resolve(root, `public/examples/${id}.json`), `${JSON.stringify(validateExplanation(build()), null, 2)}\n`);
}
for (const config of [learningExample({ gravity: 9.81 }), writingExample({ focus: 'waiting' }), progressExample({ total: 12, drafted: 8, reviewed: 4 })]) validateExplanation(config);
for (const [source, target] of [['preview/index.html', 'public/preview.html'], ['preview/host.js', 'public/preview-host.js'], ['preview/host.css', 'public/preview.css'], ['examples/explanations.mjs', 'public/preview-examples.mjs']]) await copyFile(resolve(root, source), resolve(root, target));
console.log('Generated 3 complete interactive examples, a causal diagram, and a real MCP Apps preview host');

// Normalization happens at build time, exactly as it does in the MCP tool.
const { responseFactories, referenceIndex } = await import('../examples/responses.mjs');
const { normalizeResponse } = await import('../lib/response-normalization.mjs');
const pluginReferences = resolve(root, '../plugins/chatui/skills/chatui/references');
const inMonorepo = await access(pluginReferences).then(() => true, () => false);
if (inMonorepo) await mkdir(resolve(pluginReferences, 'examples'), { recursive: true });
for (const item of referenceIndex) {
  const input = responseFactories[item.id](); const normalized = normalizeResponse(input);
  // The Skill examples and development fixtures are derived from one source.
  if (inMonorepo) await writeFile(resolve(pluginReferences, `examples/response-${item.id}.json`), `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(resolve(root, `public/examples/response-${item.id}.json`), JSON.stringify(resultFor(normalized.view, normalized.text, `preview:response:${item.id}`)));
  if (['progress', 'chart'].includes(item.id)) {
    const next = normalizeResponse(responseFactories[item.id](true));
    await writeFile(resolve(root, `public/examples/response-${item.id}-changed.json`), JSON.stringify(resultFor(next.view, next.text, `preview:response:${item.id}:changed`)));
  }
}
await writeFile(resolve(root, 'public/examples/response-index.json'), JSON.stringify(referenceIndex));
console.log('Generated ten screenshot-aligned response fixtures + changed-condition snapshots (no model calls)');

// Direct HTML uses the very same server normalization as render_html.
const { htmlFactories, htmlReferenceIndex } = await import('../examples/html.mjs');
const { normalizeHtml } = await import('../lib/html-normalization.mjs');
for (const item of htmlReferenceIndex) {
  const input = htmlFactories[item.id](); const { view, text } = normalizeHtml(input);
  await writeFile(resolve(root, `public/examples/${item.id}.json`), JSON.stringify(resultFor(view, text, `preview:html:${item.id}`)));
  if (inMonorepo) await writeFile(resolve(pluginReferences, `examples/${item.id}.json`), `${JSON.stringify(input, null, 2)}\n`);
}
await writeFile(resolve(root, 'public/examples/response-index.json'), JSON.stringify([...htmlReferenceIndex, ...referenceIndex]));
console.log('Generated three doubly-sanitized HTML fixtures (no model calls)');

const { documentFactories, documentReferenceIndex } = await import('../examples/documents.mjs');
const { intellectualFactories, intellectualReferenceIndex, nativeControl } = await import('../examples/intellectual.mjs');
const { normalizeDocument } = await import('../lib/document-normalization.mjs');
for (const [id, factory] of Object.entries(documentFactories)) {
  const { view, text } = normalizeDocument(factory());
  await writeFile(resolve(root, `public/examples/document-${id}.json`), JSON.stringify(resultFor(view, text, `preview:document:${id}`)));
}
for (const [id, factory] of Object.entries(intellectualFactories)) {
  const { view, text } = normalizeDocument(factory());
  await writeFile(resolve(root, `public/examples/document-${id}.json`), JSON.stringify(resultFor(view, text, `preview:intellectual:${id}`)));
}
// The native control intentionally has no compiled View and never mounts a widget.
await writeFile(resolve(root, 'public/examples/native-g06.json'), JSON.stringify(nativeControl));
const comparisonIndex = Object.keys(documentFactories).flatMap(id => ['structured', 'html'].map(mode => ({ id: `benchmark-${id}-${mode}`, title: `Matched ${id} · ${mode}` })));
await writeFile(resolve(root, 'public/examples/response-index.json'), JSON.stringify([...documentReferenceIndex, ...intellectualReferenceIndex, { id: nativeControl.id, title: nativeControl.title }, ...htmlReferenceIndex, ...referenceIndex, ...comparisonIndex]));
await import('./generate-document-comparisons.mjs');
await copyFile(resolve(root, 'preview/document-comparison.html'), resolve(root, 'public/document-comparison.html'));
console.log('Generated five Rich Document references from the server compiler');
console.log('Generated Phase 2A: three compiled Intellectual UX slices and one native text control');

// The standalone private preview embeds the same trusted resource. An opaque
// child does not need a second authenticated page navigation to initialize.
const { responseHtml: generatedSceneRenderer } = await import('../lib/response.generated.mjs');
const sceneJson = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const sceneTemplate = await readFile(resolve(root, 'preview/generative-view.html'), 'utf8');
const sceneCases = JSON.parse(await readFile(resolve(root, 'public/generative-view-cases.json'), 'utf8'));
const { verticalExperience, verticalExperienceText } = await import('../examples/vertical-experience.mjs');
const vertical = normalizeResponse(verticalExperience());
sceneCases.cases = [...sceneCases.cases.filter(item => item.id !== 'vertical'), { ...verticalExperienceText,
  result: { structuredContent: vertical.view, content: [{ type: 'text', text: vertical.text }] } }];
await writeFile(resolve(root, 'public/generative-view-cases.json'), JSON.stringify(sceneCases, null, 2) + '\n');
const scenePreview = sceneTemplate.replace("frame-src 'self'; connect-src 'self'", "frame-src about:; connect-src 'none'")
  .replace("frame.src = '/chatui-response.html';", () => `frame.srcdoc = ${sceneJson(generatedSceneRenderer)};`)
  .replace("fetch('/generative-view-cases.json').then(r => { if (!r.ok) throw new Error('数据未准备好'); return r.json(); })", () => `Promise.resolve(${sceneJson(sceneCases)})`);
await writeFile(resolve(root, 'public/generative-view.html'), scenePreview);
console.log('Generated standalone opaque-frame scene preview; trusted resource and synthetic data only');
