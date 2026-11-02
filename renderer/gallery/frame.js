/* Trusted offline adapter. Gallery protocol is separate from the production bridge. */
(() => {
  'use strict';
  const nonce = document.documentElement.dataset.galleryNonce;
  const root = document.getElementById('chatui-component');
  const status = document.getElementById('chatui-status');
  let mounted, destroyed = false, initialized = false, hasQuiz = false, sequence = 0, sizeFrame = 0;
  const pending = new Map();
  const send = (op, payload = {}) => {
    if (!destroyed) parent.postMessage({ channel: 'chatui-offline-v1', nonce, op, ...payload }, '*');
  };
  const size = () => {
    if (destroyed || sizeFrame) return;
    sizeFrame = setTimeout(() => {
      sizeFrame = 0;
      send('size', { height: Math.ceil(document.body.scrollHeight) });
    }, 0);
  };
  const host = {
    widgetState: undefined,
    scheduleBatch(callback) { return setTimeout(callback, 0); },
    setWidgetState(state) { if (!hasQuiz) send('state', { state }); },
    copyText(text) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('复制未完成')); }, 3000);
        pending.set(id, { kind: 'copy', resolve, reject, timer });
        send('copy', { id, text });
      });
    },
    navigateToHeading(node) {
      if (destroyed || !root.contains(node)) return Promise.resolve(false);
      const rect = node.getBoundingClientRect(), id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('章节定位未确认')); }, 3000);
        pending.set(id, { kind: 'navigate', resolve, reject, timer });
        send('navigate', { id, top: rect.top, height: rect.height });
      });
    },
    onRenderComplete() { size(); send('ready', { mountMs: performance.now() - started }); },
    onRenderError() { status.hidden = false; status.textContent = '文档显示失败；请使用完整安全文本。'; send('rejected'); }
  };
  let started = 0;
  function stop() {
    if (destroyed) return;
    destroyed = true; mounted?.destroy(); observer?.disconnect(); clearTimeout(sizeFrame);
    window.removeEventListener('message', receive);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('视图已关闭')); }
    pending.clear();
  }
  function receive(event) {
    if (destroyed || event.source !== parent) return;
    const message = event.data;
    if (!message || message.channel !== 'chatui-offline-v1' || message.nonce !== nonce) return;
    if (message.op === 'destroy' && Object.keys(message).length === 3) { stop(); return; }
    if (message.op === 'theme' && initialized && Object.keys(message).length === 4 && ['light', 'dark'].includes(message.theme)) {
      document.documentElement.style.colorScheme = message.theme;
      size(); return;
    }
    if (['copy-result', 'navigate-result'].includes(message.op) && Number.isSafeInteger(message.id) && typeof message.ok === 'boolean' && Object.keys(message).length === 5) {
      const request = pending.get(message.id);
      if (!request || `${request.kind}-result` !== message.op) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (request.kind === 'navigate') request.resolve(message.ok);
      else if (message.ok) request.resolve(); else request.reject(new Error('Clipboard unavailable'));
      return;
    }
    if (message.op !== 'init' || initialized || Object.keys(message).some(key => !['channel', 'nonce', 'op', 'view', 'text', 'state', 'theme', 'clientProbe', '_meta'].includes(key))) return;
    initialized = true;
    document.documentElement.style.colorScheme = message.theme === 'dark' ? 'dark' : 'light';
    try {
      const view = validateDocumentView(hydrateQuizView(message.view, message._meta));
      hasQuiz = JSON.stringify(view.blocks).includes('"type":"quiz"');
      if (responseText(message.view) !== message.text) throw new Error('Fallback mismatch');
      if (message.state !== undefined) { inspect(message.state); host.widgetState = message.state; }
      if (message.clientProbe) {
        let rejected = false;
        try { validateDocumentView(message.clientProbe); } catch { rejected = true; }
        if (!rejected) throw new Error('Client rejection failed');
        send('client-rejected');
      }
      started = performance.now();
      status.hidden = true; status.textContent = '';
      mounted = mountExplanation(view, host, root);
      size();
    } catch {
      mounted?.destroy(); root.replaceChildren();
      status.hidden = false; status.textContent = '客户端拒绝无效 View；以下保留安全文本。';
      const fallback = document.createElement('pre'); fallback.className = 'cui-render-fallback';
      fallback.textContent = typeof message.text === 'string' && message.text.length <= 65536 ? message.text : '此内容不可显示。';
      root.append(fallback); send('rejected'); size();
    }
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  observer?.observe(document.body);
  root.addEventListener('click', event => { if (event.target.closest?.('a[href]')) event.preventDefault(); });
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', stop, { once: true });
  send('hello');
})();
