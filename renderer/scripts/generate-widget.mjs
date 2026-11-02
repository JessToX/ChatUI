import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Trusted build opt-in for one private diagnostic candidate; no runtime URL switch.
const startupDiagnostics = process.env.CHATUI_STARTUP_DIAGNOSTICS === '1';
const entryDiagnostics = process.env.CHATUI_ENTRY_PROBE === '1';
const entryFor = mode => entryDiagnostics && mode === 'document';
const entryProbe = await readFile(resolve(directory, 'lib/startup-entry-probe.js'), 'utf8');
const packageVersion = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')).version;
await writeFile(resolve(directory, 'lib/version.generated.mjs'), `// Generated from package.json; do not edit.\nexport const rendererVersion = ${JSON.stringify(packageVersion)};\n`);
// Pass the canonical kit to refresh the vendored legacy renderer and examples.
// In the monorepo the canonical kit wins; a deployed standalone checkout uses
// its vendored copy. Both routes generate the same renderer, never two sources.
const canonical = resolve(directory, '../plugins/chatui/skills/chatui/assets/component-kit.html');
const canonicalExists = await access(canonical).then(() => true, () => false);
const sourceArg = process.argv[2] || (canonicalExists ? canonical : undefined);
const vendor = resolve(directory, 'lib/vendor/component-kit.html');
if (sourceArg) {
  await mkdir(dirname(vendor), { recursive: true });
  await copyFile(resolve(sourceArg), vendor);
  await copyFile(resolve(dirname(sourceArg), 'component-examples.json'), resolve(directory, 'lib/vendor/component-examples.json'));
}
const source = await readFile(vendor, 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1]?.replaceAll('#chatui-component', '.chatui-root');
let script = source.match(/<script>\s*([\s\S]*?)<\/script>\s*$/)?.[1];
if (!css || !script) throw new Error('Expected canonical ChatUI style and renderer script');
function replaceOnce(before, after) {
  if (!script.includes(before) || script.indexOf(before) !== script.lastIndexOf(before)) throw new Error(`Renderer contract changed: ${before.slice(0, 90)}`);
  script = script.replace(before, after);
}
replaceOnce("(() => {\n  'use strict';", "function mountChatUI(config, host, root) {\n  'use strict';\n  root = root || document.getElementById('chatui-component');");
replaceOnce("  const root = document.getElementById('chatui-component');\n", '');
replaceOnce("  const configNode = document.getElementById('chatui-component-config');\n  if (!root || !configNode) return;", "  if (!root) throw new Error('Missing component root');");
replaceOnce('  let config;\n', '');
replaceOnce('    config = JSON.parse(configNode.textContent);\n', '');
replaceOnce("    window.addEventListener('openai:set_globals', event => {\n      activeHostRefresh?.();\n      const candidate = event.detail?.globals?.widgetState;\n      if (candidate === undefined || !activeRestore) return;\n      const saved = stateEnvelope(candidate);\n      if (saved !== null) activeRestore(saved);\n    });", '');
replaceOnce('})();', `  return {
    destroy() { disposed = true; if (resizeObserver) resizeObserver.disconnect(); activeRestore = activeHostRefresh = null; },
    refreshHostCapabilities() { if (!disposed) activeHostRefresh?.(); },
    restore(candidate) { if (!activeRestore) return; let saved = null; try { if (candidate !== undefined) { inspect(candidate); saved = stateEnvelope(candidate); } } catch {} activeRestore(saved); }
  };
}`);
script = script.replaceAll('window.openai', 'host');
replaceOnce("message.setAttribute('role', 'alert'); root.append(message);", "message.setAttribute('role', 'alert'); root.append(message); throw error;");
const formPolicy = (await readFile(resolve(directory, 'lib/input-form-policy.mjs'), 'utf8')).replace(/^export /gm, '');
const validation = formPolicy + '\n' + (await readFile(resolve(directory, 'lib/component-validation.mjs'), 'utf8')).replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const quizBoundary = (await readFile(resolve(directory, 'lib/quiz-boundary.mjs'), 'utf8')).split('// Input schemas remain authoring contracts.')[0].replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const explanationValidation = (await readFile(resolve(directory, 'lib/explanation-validation.mjs'), 'utf8')).split('export const EXPLANATION_SCHEMA')[0].replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const bridge = await readFile(resolve(directory, 'lib/widget-bridge.js'), 'utf8');
const contextRelay = (await readFile(resolve(directory, 'lib/model-context-relay.mjs'), 'utf8')).replace(/^export /gm, '');
const responseValidation = (await readFile(resolve(directory, 'lib/response-validation.mjs'), 'utf8')).split('export const RESPONSE_SCHEMA')[0].replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const documentValidation = (await readFile(resolve(directory, 'lib/document-validation.mjs'), 'utf8')).split('export const DOCUMENT_INPUT_SCHEMA')[0].replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const responseText = (await readFile(resolve(directory, 'lib/response-text.mjs'), 'utf8')).replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const sceneRuntime = (await readFile(resolve(directory, 'lib/scene-runtime.mjs'), 'utf8')).replace(/^export /gm, '');
const sceneSurface = await readFile(resolve(directory, 'lib/scene-surface.js'), 'utf8');
const sceneCss = await readFile(resolve(directory, 'lib/scene.css'), 'utf8');
const documentCss = await readFile(resolve(directory, 'lib/document.css'), 'utf8');
const compositor = await readFile(resolve(directory, 'lib/explanation-renderer.js'), 'utf8');
const explanationCss = await readFile(resolve(directory, 'lib/explanation.css'), 'utf8');
const htmlCss = await readFile(resolve(directory, 'lib/html-theme.css'), 'utf8');
// Compile the trusted sanitizer and surface once. No CDN, eval or model code.
const htmlBuild = await build({ entryPoints: [resolve(directory, 'lib/html-surface.js')], bundle: true,
  write: false, format: 'iife', globalName: 'ChatUIHtml', platform: 'browser', target: ['es2022'],
  minify: true, legalComments: 'inline' });
const htmlRuntime = htmlBuild.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = mode => `<!doctype html><html lang="zh-CN" data-renderer="${mode}"${startupDiagnostics ? ' data-chatui-startup="v1"' : ''}${entryFor(mode) ? ' data-chatui-entry-probe="v1"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatUI ${mode === 'response' ? '统一回答' : mode === 'explanation' ? '组合讲解' : '交互图解'}</title><style>
:root {color-scheme:light dark;--foreground:var(--color-text-primary,light-dark(#222,#f2f2f2));--background:var(--color-background-primary,light-dark(#fff,#181818));font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
*{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;min-width:0}body{padding:4px;color:var(--foreground);background:transparent;overflow:auto}#chatui-status{font-size:14px;line-height:1.6;margin:8px;color:var(--foreground)}[hidden]{display:none!important}
${css}${mode !== 'component' ? explanationCss + sceneCss : ''}${mode === 'response' ? htmlCss : ''}${mode === 'document' ? documentCss : ''}</style></head><body><p id="chatui-status" role="status">正在连接图解…</p><div id="chatui-component" class="chatui-root" lang="zh-CN"></div>${entryFor(mode) ? `<script data-chatui-entry-probe>${entryProbe}</script>` : ''}<script>${entryFor(mode) ? "document.dispatchEvent(new Event('chatui:app-script-entry'));\n" : ''}${mode === 'response' ? htmlRuntime + '\n' : ''}${validation}\n${quizBoundary}\n${mode !== 'component' ? sceneRuntime + '\n' + sceneSurface + '\n' + explanationValidation + '\n' + responseValidation + '\n' + (mode === 'document' ? documentValidation + '\n' + responseText + '\n' : '') + compositor : ''}\n${script}\n${contextRelay}\n${bridge}${entryFor(mode) ? "\ndocument.dispatchEvent(new Event('chatui:app-script-return'));" : ''}</script></body></html>`;
const widgetHtml = html('component'), explanationHtml = html('explanation'), responseHtml = html('response'), documentHtml = html('document');
for (const [name, content] of Object.entries({ widgetHtml, explanationHtml, responseHtml, documentHtml })) {
  if (/<script[^>]+src=|eval\(|new Function\(/i.test(content)) throw new Error('Unexpected remote or dynamic executable source');
  await writeFile(resolve(directory, `lib/${name === 'widgetHtml' ? 'widget' : name === 'responseHtml' ? 'response' : name === 'documentHtml' ? 'document' : 'explanation'}.generated.mjs`), `// Generated by scripts/generate-widget.mjs; edit the source adapter instead.\nexport const ${name} = ${JSON.stringify(content)};\n`);
}
// The public preview exercises these exact resource bytes through a real postMessage host.
await mkdir(resolve(directory, 'public'), { recursive: true });
await writeFile(resolve(directory, 'public/chatui-explanation.html'), explanationHtml);
await writeFile(resolve(directory, 'public/chatui-component.html'), widgetHtml);
await writeFile(resolve(directory, 'public/chatui-response.html'), responseHtml);
console.log(`Generated response (${Buffer.byteLength(responseHtml)} bytes), component (${Buffer.byteLength(widgetHtml)} bytes; 17 types) and explanation (${Buffer.byteLength(explanationHtml)} bytes) MCP resources`);

await writeFile(resolve(directory, 'public/chatui-document.html'), documentHtml);
