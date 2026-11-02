import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { widgetHtml } from '../lib/widget.generated.mjs';
import { handleMcp } from '../lib/mcp.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = await (await handleMcp(new Request('https://synthetic.invalid/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'test-only', 'oai-authenticated-user-email': 'test@example.invalid' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'render_incline_forces', arguments: { massKg: 2, gravityMps2: 10, inclineDeg: 30, contentId: 'force-restore-regression' }
  } })
}))).json();
assert.ok(reply.result?.structuredContent);
const config = reply.result.structuredContent;
const standalone = readFileSync(new URL('../lib/vendor/component-kit.html', import.meta.url), 'utf8');

async function mount(t, surface, saved) {
  const errors = [], saves = [], rawSaves = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(surface === 'generated' ? widgetHtml : standalone, {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://synthetic.invalid/', virtualConsole
  });
  const { window } = dom;
  window.openai = { widgetState: saved === undefined ? undefined : copy(saved), setWidgetState(payload) { rawSaves.push(payload); saves.push(copy(payload)); } };
  const parent = { postMessage(message) {
    if (message.id !== undefined) queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: message.method === 'ui/initialize'
      ? { protocolVersion: '2026-01-26', hostCapabilities: {}, hostContext: { theme: 'dark' } } : {} }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  const send = message => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data: message }));
  const deliver = () => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: copy(reply.result) });
  if (surface === 'standalone') window.document.querySelector('#chatui-component-config').textContent = JSON.stringify(config);
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  await tick();
  if (surface === 'generated') { deliver(); await tick(); }
  t.after(() => { if (surface === 'generated') send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); window.close(); });
  const root = window.document.querySelector('#chatui-component');
  const toggle = key => root.querySelector(`[data-force-toggle="${key}"]`);
  const selection = root.querySelector('select');
  const view = () => ({ components: toggle('showComponents').checked, resultant: toggle('showResultant').checked, selected: selection.value });
  const restore = value => window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: value } } }));
  const activate = () => {
    toggle('showResultant').click(); toggle('showComponents').click();
    selection.value = 'normal'; selection.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(view(), { components: true, resultant: true, selected: 'normal' });
  };
  return { root, errors, saves, rawSaves, toggle, view, restore, activate, deliver };
}

const invalidCases = {
  null: () => null,
  empty: () => ({}),
  wrongIdentity: payload => { payload.privateContent.chatui.identity = 'another-component'; return payload; },
  wrongSchema: payload => { payload.privateContent.chatui.schemaVersion = 2; return payload; },
  nullValue: payload => { payload.privateContent.chatui.value = null; return payload; },
  arrayValue: payload => { payload.privateContent.chatui.value = []; return payload; },
  missingBoolean: payload => { delete payload.privateContent.chatui.value.showComponents; return payload; },
  stringBoolean: payload => { payload.privateContent.chatui.value.showResultant = 'true'; return payload; },
  unknownForce: payload => { payload.privateContent.chatui.value.selected = 'not-a-real-force'; return payload; }
};

for (const surface of ['generated', 'standalone']) {
  for (const [name, invalid] of Object.entries(invalidCases)) {
    test(`${surface}: invalid ${name} restoration preserves active force controls and diagram`, async t => {
      const app = await mount(t, surface); app.activate();
      const before = app.view(), diagram = app.root.querySelector('svg').outerHTML, count = app.saves.length;
      app.toggle('showComponents').focus();
      app.restore(invalid(copy(app.saves.at(-1)))); await tick();
      assert.deepEqual(app.view(), before);
      assert.equal(app.root.querySelector('svg').outerHTML, diagram);
      assert.equal(app.root.querySelector('[data-force-sum]').hidden, false);
      assert.equal(app.root.querySelectorAll('[data-real-force-row]').length, 2);
      assert.equal(app.saves.length, count, 'Restoration must not publish an unsolicited state');
      assert.equal(app.toggle('showComponents').ownerDocument.activeElement, app.toggle('showComponents'));
      assert.deepEqual(app.errors, []);
    });
  }
  test(`${surface}: matching state restores initially and during interaction, then user can toggle`, async t => {
    const first = await mount(t, surface); first.activate();
    const valid = copy(first.saves.at(-1));
    const app = await mount(t, surface, valid);
    assert.deepEqual(app.view(), { components: true, resultant: true, selected: 'normal' });
    app.toggle('showComponents').click(); app.toggle('showResultant').click();
    assert.deepEqual(app.view(), { components: false, resultant: false, selected: 'normal' });
    first.toggle('showResultant').click(); first.toggle('showResultant').click();
    app.restore(copy(first.saves.at(-1))); await tick();
    assert.deepEqual(app.view(), { components: true, resultant: true, selected: 'normal' });
    if (surface === 'generated') { app.deliver(); await tick(); assert.deepEqual(app.view(), { components: true, resultant: true, selected: 'normal' }); }
    app.toggle('showResultant').click();
    assert.equal(app.view().resultant, false);
    assert.equal(app.saves.at(-1).privateContent.chatui.value.showResultant, false);
    assert.deepEqual(app.errors, []);
  });
  test(`${surface}: delayed same-mount state cannot overwrite a later user change`, async t => {
    const app = await mount(t, surface); app.activate();
    app.toggle('showResultant').click(); const older = copy(app.saves.at(-1));
    app.toggle('showResultant').click(); assert.equal(app.view().resultant, true);
    app.restore(older); await tick(); assert.equal(app.view().resultant, true);
  });
}

for (const surface of ['generated', 'standalone']) {
  test(`${surface}: malformed and future own revisions fail closed without publishing`, async t => {
    const app = await mount(t, surface); app.activate();
    const latest = copy(app.saves.at(-1)), before = app.view(), count = app.saves.length;
    assert.ok(latest.privateContent.chatui.value.restoreOrder);
    for (const order of [null, {}, {session:['a'.repeat(32)],revision:1}, {session:{value:'a'.repeat(32)},revision:1}, {session:'bad',revision:1}, {session:latest.privateContent.chatui.value.restoreOrder.session,revision:Number.MAX_SAFE_INTEGER}]) {
      const bad=copy(latest); bad.privateContent.chatui.value.showResultant=false; bad.privateContent.chatui.value.restoreOrder=order;
      app.restore(bad); await tick(); assert.deepEqual(app.view(),before);
    }
    assert.equal(app.saves.length,count);
  });
  test(`${surface}: saves are immutable and legacy matching restores remain compatible`, async t => {
    const app=await mount(t,surface); app.activate();
    const latest=copy(app.saves.at(-1)); delete latest.privateContent.chatui.value.restoreOrder;
    latest.privateContent.chatui.value.showResultant=false; app.restore(latest); await tick();
    assert.equal(app.view().resultant,false);
  });
}

for (const surface of ['generated','standalone']) test(`${surface}: own echoes cannot undo external restore and published objects stay unchanged`, async t => {
 const app=await mount(t,surface); app.activate();
 const own=copy(app.saves.at(-1)), raw=app.rawSaves.at(-1), serialized=JSON.stringify(raw);
 app.toggle('showResultant').click(); assert.equal(JSON.stringify(raw),serialized);
 const external=copy(own); delete external.privateContent.chatui.value.restoreOrder;
 external.privateContent.chatui.value.selected='gravity'; app.restore(external); await tick();
 const before=app.view(), count=app.saves.length;
 app.restore(app.saves.at(-1)); await tick(); assert.deepEqual(app.view(),before);
 app.restore(own); await tick(); assert.deepEqual(app.view(),before); assert.equal(app.saves.length,count);
});

for (const surface of ['generated', 'standalone']) {
  test(`${surface}: foreign older and repeated snapshots cannot roll back accepted state or local edits`, async t => {
    const source = await mount(t, surface); source.activate();
    source.toggle('showResultant').click(); const older = copy(source.saves.at(-1));
    source.toggle('showResultant').click(); const newer = copy(source.saves.at(-1));
    const app = await mount(t, surface, newer);
    app.restore(older); await tick(); assert.equal(app.view().resultant, true);
    app.toggle('showComponents').click(); const edited = app.view();
    app.restore(newer); await tick(); assert.deepEqual(app.view(), edited);
    const conflict = copy(newer); conflict.privateContent.chatui.value.selected = 'gravity';
    app.restore(conflict); await tick(); assert.deepEqual(app.view(), edited);
    source.toggle('showResultant').click(); app.restore(copy(source.saves.at(-1))); await tick();
    assert.equal(app.view().resultant, false, 'A genuinely newer same-source revision remains restorable');
    assert.equal(app.view().components, true);
    if (surface === 'generated') { app.deliver(); await tick(); assert.equal(app.view().resultant, false); }
  });
  test(`${surface}: invalid foreign revision cannot poison ordering and different source counters are incomparable`, async t => {
    const source = await mount(t, surface); source.activate();
    const valid = copy(source.saves.at(-1)); const app = await mount(t, surface, valid);
    const invalid = copy(valid); invalid.privateContent.chatui.value.restoreOrder.revision = 100;
    invalid.privateContent.chatui.value.showResultant = 'false'; app.restore(invalid); await tick();
    source.toggle('showResultant').click(); app.restore(copy(source.saves.at(-1))); await tick();
    assert.equal(app.view().resultant, false);
    const foreign = copy(valid); foreign.privateContent.chatui.value.restoreOrder = { session: 'f'.repeat(32), revision: 1 };
    app.restore(foreign); await tick(); assert.equal(app.view().resultant, true);
    const remount = await mount(t, surface, foreign); assert.equal(remount.view().resultant, true);
  });
}

for (const surface of ['generated', 'standalone']) {
  test(`${surface}: invalid initial ordering is ignored and cannot seed the source`, async t => {
    const source = await mount(t, surface); source.activate(); const valid = copy(source.saves.at(-1));
    for (const order of [null, {}, {session:'a'.repeat(32),revision:'2'}, {session:'a'.repeat(32),revision:0}, {session:'a'.repeat(32),revision:Number.MAX_SAFE_INTEGER+1}]) {
      const bad = copy(valid); bad.privateContent.chatui.value.restoreOrder = order;
      const app = await mount(t, surface, bad);
      assert.equal(app.view().resultant, false); assert.equal(app.view().components, false);
      app.restore(valid); await tick(); assert.equal(app.view().resultant, true);
    }
  });
  test(`${surface}: source capacity retains known ordering, blocks only unknown ordered sources, and preserves legacy recovery`, async t => {
    const source = await mount(t, surface); source.activate(); const payload = copy(source.saves.at(-1));
    const app = await mount(t, surface);
    for (let i=1;i<=32;i++) {
      const next = copy(payload); next.privateContent.chatui.value.restoreOrder = {session:i.toString(16).padStart(32,'0'),revision:2};
      app.restore(next); await tick();
    }
    app.toggle('showResultant').click(); assert.equal(app.view().resultant,false);
    const unknown = copy(payload); unknown.privateContent.chatui.value.restoreOrder = {session:'e'.repeat(32),revision:1};
    app.restore(unknown); await tick(); assert.equal(app.view().resultant,false);
    const known = copy(payload); known.privateContent.chatui.value.restoreOrder = {session:'1'.padStart(32,'0'),revision:1};
    app.restore(known); await tick(); assert.equal(app.view().resultant,false);
    known.privateContent.chatui.value.restoreOrder.revision=3; app.restore(known); await tick(); assert.equal(app.view().resultant,true);
    const legacy=copy(payload); delete legacy.privateContent.chatui.value.restoreOrder; legacy.privateContent.chatui.value.showResultant=false;
    app.restore(legacy); await tick(); assert.equal(app.view().resultant,false);
    app.restore(known); await tick(); assert.equal(app.view().resultant,false,'Legacy restoration must not erase known high-water marks');
    assert.equal(app.saves.length,1,'External restoration never republishes state');
  });
}
