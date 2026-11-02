/* Fixed-data Gallery host, with no MCP or ChatGPT APIs. */
(() => {
  'use strict';
  const node = document.getElementById('gallery-data');
  const data = JSON.parse(node.textContent); node.remove();
  const choices = data.scenarios;
  const params = new URLSearchParams(location.search);
  const status = document.getElementById('gallery-status');
  const stage = document.getElementById('gallery-stage');
  const states = new Map();
  let active = null, generation = 0;
  const diagnostics = { accepted: 0, rejectedMessages: 0, generation: 0, stateOperations: 0, clientRejections: 0, mounts: [] };
  Object.defineProperty(window, '__galleryDiagnostics', { get: () => JSON.parse(JSON.stringify(diagnostics)) });
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const safe = (value, depth = 0) => {
    if (depth > 24) return false;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return (typeof value !== 'number' || Number.isFinite(value)) && (typeof value !== 'string' || value.length <= 65536);
    if (Array.isArray(value)) return value.length <= 128 && value.every(item => safe(item, depth + 1));
    return plain(value) && Object.keys(value).length <= 128 && Object.entries(value).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && safe(item, depth + 1));
  };
  const send = (owner, op, payload = {}) => owner.frame.contentWindow.postMessage({ channel: 'chatui-offline-v1', nonce: owner.nonce, op, ...payload }, '*');
  function destroy() {
    if (!active) return;
    const owner = active; active = null;
    send(owner, 'destroy'); owner.frame.remove();
    window.removeEventListener('message', owner.receive);
    owner.requests.clear();
  }
  function select(id, restore = false) {
    destroy(); generation++; diagnostics.generation = generation;
    const scenario = choices.find(item => item.id === id) || choices[0];
    stage.replaceChildren();
    document.body.dataset.currentScene = scenario.id;
    document.body.dataset.status = 'loading';
    document.getElementById('scene-title').textContent = `${scenario.id} · ${scenario.title}`;
    for (const key of ['goal', 'instructions', 'expected', 'limitations']) document.getElementById(key).textContent = scenario[key];
    document.getElementById('actual-mode').textContent = scenario.mode;
    document.querySelectorAll('[data-scene]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === scenario.id)));
    if (scenario.checks) {
      const list = document.createElement('ul'); list.id = 'boundary-results';
      for (const check of scenario.checks) {
        const item = document.createElement('li'); item.dataset.check = check.id; item.dataset.status = check.status;
        item.textContent = `${check.label}：${check.status === 'rejected' ? '已真实拒绝' : '安全原生 fallback'} · ${check.message}`;
        list.append(item);
      }
      stage.append(list);
      if (scenario.toolFallback) {
        const fallback = document.createElement('pre'); fallback.id = 'tool-fallback'; fallback.textContent = scenario.toolFallback;
        stage.append(fallback);
      }
    }
    if (!scenario.view) {
      const pre = document.createElement('p'); pre.id = 'native-text'; pre.textContent = scenario.text;
      stage.append(pre); status.textContent = '静态原生文本参考已就绪；未调用 Document 或真实聊天宿主。';
      document.body.dataset.status = 'native';
      document.getElementById('reload').disabled = true; document.getElementById('reset').disabled = true;
      return;
    }
    document.getElementById('reload').disabled = false; document.getElementById('reset').disabled = false;
    const frame = document.createElement('iframe'); frame.id = 'gallery-frame'; frame.title = `${scenario.id} 可信离线文档`;
    frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
    const owner = { frame, nonce, scenario, generation, requests: new Set(), initialized: false, lastRequest: 0 };
    owner.receive = async event => {
      if (active !== owner || event.source !== frame.contentWindow) { diagnostics.rejectedMessages++; return; }
      const message = event.data;
      if (!plain(message) || message.channel !== 'chatui-offline-v1' || message.nonce !== nonce || !safe(message) || JSON.stringify(message).length > 70000) { diagnostics.rejectedMessages++; return; }
      const allowed = { hello: [], size: ['height'], ready: ['mountMs'], state: ['state'], copy: ['id', 'text'], navigate: ['id', 'top', 'height'], rejected: [], 'client-rejected': [] };
      const keys = Object.hasOwn(allowed, message.op) ? allowed[message.op] : null;
      if (!keys || Object.keys(message).length !== keys.length + 3 || keys.some(key => !Object.hasOwn(message, key)) || (message.op !== 'hello' && !owner.initialized)) { diagnostics.rejectedMessages++; return; }
      if (message.op === 'hello') {
        if (owner.initialized) { diagnostics.rejectedMessages++; return; }
        owner.initialized = true;
        send(owner, 'init', { view: scenario.view, text: scenario.text, theme: document.getElementById('theme').value,
          ...(scenario._meta ? { _meta: scenario._meta } : {}),
          ...(restore && !scenario.hasQuiz && states.has(scenario.id) ? { state: states.get(scenario.id) } : {}),
          ...(scenario.clientProbe ? { clientProbe: scenario.clientProbe } : {}) });
      } else if (message.op === 'size') {
        if (Number.isFinite(message.height) && message.height > 0 && message.height <= 50000) frame.style.height = `${message.height}px`;
        else diagnostics.rejectedMessages++;
      } else if (message.op === 'ready') {
        if (!Number.isFinite(message.mountMs) || message.mountMs < 0 || message.mountMs > 60000) { diagnostics.rejectedMessages++; return; }
        document.body.dataset.status = scenario.mode === 'boundary' ? 'rejection' : 'ready';
        status.textContent = scenario.mode === 'boundary' ? '安全边界已真实拒绝；下方 Quiz 是独立正常文档。' : '已就绪 · 真实可信 Renderer · 本地固定数据';
        diagnostics.mounts.push({ scene: scenario.id, mountMs: message.mountMs }); if (diagnostics.mounts.length > 100) diagnostics.mounts.shift();
      } else if (message.op === 'client-rejected') diagnostics.clientRejections++;
      else if (message.op === 'rejected') { document.body.dataset.status = 'rejection'; status.textContent = '客户端拒绝；保留安全原生 fallback。'; }
      else if (message.op === 'state') {
        if (JSON.stringify(message.state).length > 65536 || !plain(message.state)) { diagnostics.rejectedMessages++; return; }
        // Quiz grading and answers stay in the trusted frame, never in host messages/storage.
        if (!scenario.hasQuiz) states.set(scenario.id, message.state);
        diagnostics.stateOperations++;
      } else if (message.op === 'navigate') {
        // This is the Gallery's own scroll container, never a ChatGPT parent DOM.
        if (!Number.isSafeInteger(message.id) || message.id <= owner.lastRequest || message.id > 100000 ||
          !Number.isFinite(message.top) || !Number.isFinite(message.height) || message.top < 0 || message.height <= 0 ||
          message.top + message.height > frame.clientHeight + 2) { diagnostics.rejectedMessages++; return; }
        owner.lastRequest = message.id; owner.requests.add(message.id);
        window.scrollTo({ top: window.scrollY + frame.getBoundingClientRect().top + message.top - 16, behavior: 'instant' });
        // Acknowledgement reflects the actual visible position after scrolling.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (active !== owner || !owner.requests.delete(message.id)) return;
        const top = frame.getBoundingClientRect().top + message.top;
        send(owner, 'navigate-result', { id: message.id, ok: top >= -1 && top + message.height <= window.innerHeight + 1 });
      } else if (message.op === 'copy') {
        if (!Number.isSafeInteger(message.id) || message.id <= owner.lastRequest || message.id > 100000 || message.text !== scenario.text) { diagnostics.rejectedMessages++; return; }
        owner.lastRequest = message.id; owner.requests.add(message.id);
        let ok = false;
        try { if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Unavailable'); await navigator.clipboard.writeText(scenario.text); ok = true; } catch { /* Frame provides the complete manual fallback. */ }
        if (active !== owner || !owner.requests.delete(message.id)) return;
        send(owner, 'copy-result', { id: message.id, ok });
      }
      diagnostics.accepted++;
    };
    active = owner; window.addEventListener('message', owner.receive);
    frame.srcdoc = data.renderer.replace('<html ', `<html data-gallery-nonce="${nonce}" `);
    stage.append(frame); status.textContent = '正在载入可信离线文档…';
  }
  const sceneLabels = { G01: '几何', G02: '积分', G03: '物理', G04: '论证', G05: '长文', G06: '短答', G07: '降级', G08: '边界', G09: '参数', G10: '表单' };
  for (const scenario of choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.scene = scenario.id;
    button.textContent = `${scenario.id} ${sceneLabels[scenario.id] || scenario.title}`;
    button.setAttribute('aria-label', `${scenario.id} · ${scenario.title}`); button.title = scenario.title;
    button.addEventListener('click', () => select(scenario.id)); document.getElementById('scenes').append(button);
  }
  const theme = document.getElementById('theme'); theme.value = params.get('theme') === 'dark' ? 'dark' : 'light';
  const width = document.getElementById('width'); width.value = ['320', '390', '768', '1024'].includes(params.get('width')) ? params.get('width') : '768';
  const applyWidth = () => document.documentElement.style.setProperty('--gallery-width', `${width.value}px`);
  applyWidth(); width.addEventListener('change', applyWidth);
  theme.addEventListener('change', () => {
    document.documentElement.style.colorScheme = theme.value;
    // Keep the trusted live Quiz instance; no answers or grading leave the frame.
    if (active?.initialized) send(active, 'theme', { theme: theme.value });
  });
  document.documentElement.style.colorScheme = theme.value;
  document.getElementById('reload').addEventListener('click', () => select(document.body.dataset.currentScene, true));
  document.getElementById('reset').addEventListener('click', () => { states.delete(document.body.dataset.currentScene); select(document.body.dataset.currentScene); });
  window.addEventListener('pagehide', destroy, { once: true });
  select(params.get('scene') || 'G01');
})();
