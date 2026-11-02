import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { validateDocumentView } from '../lib/document-validation.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { createGalleryScenarios } from '../examples/gallery.mjs';
import { projectQuizView, hydrateQuizView } from '../lib/quiz-boundary.mjs';
import { trustedFixtureDeliveryId } from './quiz-fixture-delivery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
export function compileGalleryScenarios(inputs) {
  return inputs.map((input, index) => {
    const { input: documentInput, quizInput, checks, clientRejection, toolFallback, ...metadata } = input;
    const compiled = documentInput || quizInput ? normalizeDocument(documentInput || quizInput) : null;
    const projected = compiled ? projectQuizView(compiled.view, { deliveryId: trustedFixtureDeliveryId(`gallery:${index}:${metadata.id}`) }) : null;
    const scenario = { ...metadata, ...(compiled ? { view: projected.view, text: compiled.text, ...(projected.meta?.chatui ? { _meta: projected.meta } : {}) } : {}), ...(projected?.meta?.chatui?.quizGrading ? { hasQuiz: true } : {}) };
    if (checks) {
      scenario.checks = checks.map(check => {
        let rejected = false;
        try { normalizeDocument(check.input); } catch { rejected = true; }
        if (!rejected) throw new Error(`Expected compiler rejection: ${check.id}`);
        return { id: check.id, label: check.label, status: 'rejected', message: '此固定非法输入已被真实编译器拒绝；危险原文不进入展示。' };
      });
    }
    if (clientRejection) {
      scenario.clientProbe = structuredClone(normalizeDocument(clientRejection.input).view);
      if (clientRejection.mutation !== 'invalid-callouts') throw new Error('Unsupported fixed client probe');
      scenario.clientProbe.callouts = { invalid: 'untrusted-tone' };
      let rejected = false;
      try { validateDocumentView(scenario.clientProbe); } catch { rejected = true; }
      if (!rejected) throw new Error('Expected client rejection');
      scenario.checks.push({ id: 'client-view', label: '客户端 View 校验', status: 'rejected', message: 'build 检查与浏览器客户端独立拒绝；不挂载该 View。' });
    }
    if (toolFallback) {
      scenario.toolFallback = normalizeDocument(toolFallback.input).text;
      scenario.checks.push({ id: 'tool-unavailable', label: toolFallback.label, status: 'fallback', message: '本地模拟工具不可用；以下是同一固定输入的完整安全原生文本。' });
    }
    return scenario;
  });
}
export async function generateGallery(scenarios) {
  const bridge = await readFile(resolve(root, 'lib/widget-bridge.js'), 'utf8');
  const adapter = await readFile(resolve(root, 'gallery/frame.js'), 'utf8');
  if (documentHtml.split(bridge).length !== 2) throw new Error('Trusted bridge replacement must be unique');
  // Same generated validation, compositor and canonical component bytes; only local host adapter changes.
  const renderer = documentHtml.replace(bridge, adapter).replace('<meta name="viewport"', '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport"');
  for (const scenario of scenarios) {
    if (scenario.view) validateDocumentView(hydrateQuizView(scenario.view, scenario._meta));
  }
  const data = { version: 1, renderer, scenarios };
  const template = await readFile(resolve(root, 'gallery/index.html'), 'utf8');
  const host = await readFile(resolve(root, 'gallery/host.js'), 'utf8');
  const css = await readFile(resolve(root, 'gallery/host.css'), 'utf8');
  const index = template.replace('__GALLERY_STYLE__', () => css).replace('__GALLERY_DATA__', () => safeJson(data)).replace('__GALLERY_HOST__', () => host.replace(/<\/script/gi, '<\\/script'));
  const output = resolve(root, 'public/gallery'); await mkdir(output, { recursive: true });
  const readme = `# ChatUI Offline Final Edition Candidate Gallery\n\nUnzip this whole directory. Open index.html directly (file://), or run:\n\n\`\`\`sh\npython3 -m http.server 4173 --bind 127.0.0.1 --directory .\n\`\`\`\n\nThen open http://127.0.0.1:4173/index.html. No install, model, server API, CDN or network fetch is required. The HTTP server only serves these local files.\n\nUse G01–G10 buttons, theme and reading width. Tab focuses controls; arrows/Home/End adjust native sliders and tabs; Enter/Space operates buttons and disclosures. Escape closes manual copy and returns focus. Copy uses the complete same-input safe fallback including closed sections and inactive tabs, with quiz grading omitted. Clipboard failure provides selected readonly full text. Geometry/motion/form state can be restored within this page; Quiz is reset on reload/scene switch. Theme changes preserve live Quiz selections and scores inside the frame, without persisting them. Local chapter buttons confirm scrolling before focusing the heading; environments without verified scrolling retain a static outline. No chat history is stored.\n\nChromium is the automated acceptance target. Safari, Firefox, manual VoiceOver and real ChatGPT host support have only the status recorded in the separate review evidence; do not infer a PASS here. G06 is a static native-text reference, G08 displays real compiler/client rejection and a separately valid quiz.\n\nindex.html embeds validated fixtures and the existing trusted Renderer in a scripts-only opaque-origin sandbox. fixtures.json and renderer.html are auditable byte copies, not runtime network dependencies. Quiz grading is separated into component-only _meta; public fixture views, readable fallback and complete copy omit the grading keys and explanations. Fixed grading still ships in the downloaded fixtures and can be inspected in browser DevTools or source. The hidden bootstrap DOM is removed after initialization; this does not make downloaded grading confidential. This local simulated host has no model connection and cannot prove real ChatGPT model visibility.\n\nVerify listed files with SHA256SUMS. Review ZIP contains evidence and is not this runnable Gallery.\n`;
  const notices = await readFile(resolve(root, 'gallery/THIRD_PARTY_NOTICES.md'), 'utf8');
  const files = { 'index.html': index, 'fixtures.json': safeJson({ version: 1, scenarios }) + '\n', 'renderer.html': renderer, 'README.md': readme, 'THIRD_PARTY_NOTICES.md': notices };
  const entries = [];
  for (const [path, content] of Object.entries(files)) { await writeFile(resolve(output, path), content); entries.push({ path, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }); }
  const manifest = JSON.stringify({ format: 'chatui-offline-gallery-v1', rendererResourceSHA256: createHash('sha256').update(renderer).digest('hex'), fixtureHash: createHash('sha256').update(files['fixtures.json']).digest('hex'), files: entries }, null, 2) + '\n';
  await writeFile(resolve(output, 'manifest.json'), manifest);
  await writeFile(resolve(output, 'SHA256SUMS'), [...entries, { path: 'manifest.json', sha256: createHash('sha256').update(manifest).digest('hex') }].map(entry => `${entry.sha256}  ${entry.path}`).join('\n') + '\n');
  console.log(JSON.stringify({ galleryFiles: 7, indexBytes: Buffer.byteLength(index), rendererResourceSHA256: createHash('sha256').update(renderer).digest('hex') }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateGallery(compileGalleryScenarios(createGalleryScenarios()));
}
