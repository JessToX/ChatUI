import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { documentHtml } from '../lib/document.generated.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';

const probe = await readFile(new URL('../lib/startup-entry-probe.js', import.meta.url), 'utf8');
const secret = 'SYNTHETIC_PRIVATE_BODY_INPUT_ERROR_REASON';
const view = normalizeDocument({ contentId: 'entry-probe-local', source: '# Synthetic\n\n' + secret }).view;
const scripts = [...documentHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const original = scripts.at(-1)[1];
const enter = "document.dispatchEvent(new Event('chatui:app-script-entry'));\n";
const returned = "\ndocument.dispatchEvent(new Event('chatui:app-script-return'));";
const enabledArtifact = documentHtml.includes('data-chatui-entry-probe="v1"');

async function run(t, { fault = '', native = true, enabled = true, consoleFailure = false, flood = false } = {}) {
  let html = enabledArtifact ? documentHtml : documentHtml.replace(scripts[0][0], () => '<script data-chatui-entry-probe>' + probe + '</script><script>' + enter + original + returned + '</script>');
  if (enabled) html = html.replace('<html ', '<html data-chatui-entry-probe="v1" ');
  else html = html.replaceAll(' data-chatui-entry-probe="v1"', '');
  if (fault) {
    const injected = fault === 'syntax' ? 'const SYNTHETIC_BROKEN = ;\n' : 'throw new Error(' + JSON.stringify(secret) + ');\n';
    html = html.replace('/* Static, dependency-free MCP Apps bridge.', () => injected + '/* Static, dependency-free MCP Apps bridge.');
  }
  const info = [], outbound = [], vc = new VirtualConsole();
  vc.on('info', (...args) => info.push(args.map(String).join(' ')));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(window) {
    window.TextEncoder = TextEncoder;
    Object.defineProperty(window, 'parent', { value: { postMessage: value => outbound.push(value.method) } });
    window.openai = { toolOutput: native ? view : undefined, setWidgetState() {} };
    if (consoleFailure) window.console.info = () => { throw new Error(secret); };
  } });
  t.after(() => dom.window.close());
  const { window } = dom;
  if (window.document.readyState === 'loading') await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const root = window.document.getElementById('chatui-component');
  for (let i = 0; i < 20 && root.getAttribute('aria-busy') === 'true'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  if (flood) {
    window.dispatchEvent(Object.assign(new window.Event('unhandledrejection'), { reason: new Error(secret) }));
    for (let i = 0; i < 40; i++) window.dispatchEvent(new window.ErrorEvent('error', { error: new Error(secret), message: secret }));
  }
  const trace = JSON.parse(window.document.documentElement.getAttribute('data-chatui-entry') || '[]');
  const ownInfo = info.filter(value => value.startsWith('[ChatUI entry v1]'));
  assert.ok(!JSON.stringify({ trace, ownInfo }).includes(secret));
  trace.forEach((event, i) => {
    assert.deepEqual(Object.keys(event).sort(), ['ms', 'seq', 'stage']); assert.equal(event.seq, i);
    assert.ok(Number.isFinite(event.ms) && event.ms >= 0); assert.equal(typeof event.stage, 'string');
  });
  return { trace, stages: trace.map(e => e.stage), ownInfo, root, outbound };
}

test('entry probe remains separate from the application and Document-only when enabled by trusted build', () => {
  assert.equal(scripts.length, enabledArtifact ? 2 : 1);
  if (enabledArtifact) { assert.equal(scripts[0][1], probe); assert.ok(original.startsWith(enter)); assert.ok(original.endsWith(returned)); }
  assert.ok(!responseHtml.includes('data-chatui-entry-probe') && !responseHtml.includes('[ChatUI entry v1]'));
  assert.doesNotMatch(probe, /fetch\(|localStorage|sessionStorage|\.message\b|\.stack\b|\.reason\b|window\.openai|window\.parent/);
});
test('entry probe is silent when disabled, while the same application still renders', async t => {
  const app = await run(t, { enabled: false }); assert.equal(app.trace.length, 0); assert.equal(app.ownInfo.length, 0); assert.ok(app.root.childElementCount);
});
test('entry probe distinguishes main-script parsing from pre-bridge runtime failure', async t => {
  for (const fault of ['syntax', 'runtime']) {
    const app = await run(t, { fault }); assert.ok(app.stages.includes('entry') && app.stages.includes('script_error'));
    assert.equal(app.stages.includes('app_script_entry'), fault === 'runtime'); assert.ok(!app.stages.includes('app_script_return'));
    assert.equal(app.root.childElementCount, 0);
  }
});
test('entry probe distinguishes completed synchronous startup from waiting for initialize/data', async t => {
  const app = await run(t, { native: false }); assert.ok(app.stages.includes('entry') && app.stages.includes('app_script_return'));
  assert.ok(app.outbound.includes('ui/initialize')); assert.ok(!app.stages.includes('script_error')); assert.equal(app.root.childElementCount, 0);
});
test('entry probe never logs body or error details, caps first16, and console failure cannot block rendering', async t => {
  const app = await run(t, { flood: true }); assert.ok(app.root.childElementCount); assert.equal(app.trace.length, 16); assert.equal(app.ownInfo.length, 16);
  assert.ok(app.stages.includes('unhandled_rejection'));
  const silent = await run(t, { consoleFailure: true }); assert.ok(silent.root.childElementCount && silent.stages.includes('app_script_return'));
});
