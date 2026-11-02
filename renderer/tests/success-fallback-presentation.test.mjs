import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { handleMcp } from '../lib/mcp.mjs';
import { responseHtml } from '../lib/response.generated.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
const stimuli = JSON.parse(readFileSync(new URL('../../docs/feature-completeness/continuation-stimuli.json', import.meta.url), 'utf8'));

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function actualResult(name, args) {
  const response = await handleMcp(new Request('https://local-synthetic.invalid/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic', 'oai-authenticated-user-email': 'synthetic@example.invalid' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  }));
  const { result } = await response.json();
  assert.equal(result.isError, undefined);
  return result;
}
async function host(t, html) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://local-widget.invalid', virtualConsole: vc });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) {
    if (message.method === 'ui/initialize') queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: { hostCapabilities: {}, hostContext: { theme: 'light' } } }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick();
  t.after(() => { send({ jsonrpc: '2.0', id: 'teardown', method: 'ui/resource-teardown' }); window.close(); });
  const root = window.document.querySelector('#chatui-component');
  return { root, errors, async deliver(result) {
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
    for (let attempt = 0; attempt < 100 && root.getAttribute('aria-busy') === 'true'; attempt++) await tick();
    await tick();
  } };
}
for (const route of ['render_html', 'render_document']) {
  test(route + ' four synthetic snapshots render once; complete MCP text remains available on rejection', async t => {
    const app = await host(t, route === 'render_html' ? responseHtml : documentHtml);
    let result, marker;
    const previousMarkers = [];
    for (const turn of stimuli.turns) {
      const contentId = 'fallback-presentation-' + route + '-' + turn.id;
      marker = 'SYNTHETIC_' + turn.id.toUpperCase() + '_BODY';
      const args = route === 'render_html'
        ? { contentId, html: `<p>${marker} ${turn.body}</p><details><summary>Detail</summary>${turn.tail}</details>` }
        : { contentId, source: `${marker} ${turn.body}\n\n:::collapse {"summary":"Detail"}\n${turn.tail}\n:::` };
      result = await actualResult(route, args);
      assert.ok(result.content[0].text.includes(marker));
      assert.ok(result.content[0].text.includes(turn.tail));
      await app.deliver(result);
      assert.equal(app.root.textContent.split(marker).length - 1, 1);
      assert.equal(app.root.querySelector('.cui-render-fallback'), null);
      previousMarkers.forEach(previous => assert.ok(!app.root.textContent.includes(previous)));
      previousMarkers.push(marker);
    }
    const broken = structuredClone(result);
    if (route === 'render_html') broken.structuredContent.theme = 'invalid';
    else broken.structuredContent.sourceHash = 'invalid';
    await app.deliver(broken);
    assert.equal(app.root.querySelector('.cui-render-fallback').textContent, result.content[0].text);
    assert.equal(app.root.textContent.split(marker).length - 1, 1);
    assert.deepEqual(app.errors, []);
  });
}
