/* Static, dependency-free MCP Apps bridge. Component data is never executable. */
(() => {
  'use strict';
  const root = document.getElementById('chatui-component');
  const documentMode = document.documentElement.dataset.renderer === 'document';
  const responseMode = documentMode || document.documentElement.dataset.renderer === 'response';
  const explanationMode = document.documentElement.dataset.renderer === 'explanation';
  const status = document.getElementById('chatui-status');
  const pending = new Map();
  const connectionPendingMessage = '尚未连接到对话渲染通道，请重新打开此组件。';
  let nextId = 1, ready = false, destroyed = false, mounted = null, standardInitialized = false;
  let mountToken = null, latestResult = null, activeTiming = null;
  // Temporary private-test diagnostics: explicit opt-in, first32 stages only.
  // Never include content, identifiers, payloads, metadata or error details.
  const startupEnabled = document.documentElement.dataset.chatuiStartup === 'v1';
  const startupAt = performance.now(), startupEvents = [];
  const startupVocabulary = new Set(['boot', 'initialize_request', 'initialize_soft_deadline', 'initialize_success', 'initialize_chain_error', 'native_result', 'native_ready', 'mcp_result', 'validation_ok', 'validation_error', 'same_result', 'mount_start', 'mount_returned', 'mount_complete', 'mount_error', 'fallback', 'teardown']);
  function startup(stage) {
    if (!startupEnabled || startupEvents.length >= 32 || !startupVocabulary.has(stage)) return;
    const entry = { seq: startupEvents.length, stage, ms: Math.max(0, Math.round(performance.now() - startupAt)), ready, hasResult: !!latestResult, hasContent: root.childElementCount > 0 };
    startupEvents.push(entry);
    try { root.setAttribute('data-chatui-startup', JSON.stringify(startupEvents)); console.info('[ChatUI startup v1]', JSON.stringify(entry)); } catch { /* Diagnostics cannot block rendering. */ }
  }
  startup('boot');
  let navigationSerial = 0, cancelHeadingNavigation;
  const stopHeadingNavigation = () => { navigationSerial++; cancelHeadingNavigation?.(); cancelHeadingNavigation = undefined; };
  const metrics = { version: '1.5.0', viewReadyAt: performance.now(), initializedAt: null, inputs: [], renders: [], interactions: [] };
  // Bounded, content-free local diagnostics; never transmitted or treated as host/model latency.
  Object.defineProperty(window, '__chatuiMetrics', { value: metrics });
  const sample = (list, value) => { list.push(value); if (list.length > 200) list.shift(); };
  let rcDiagnostics = null, restoreEvents = 0;
  // Tool metadata is component-only. Copy only the bounded diagnostic vocabulary,
  // never hidden grading or arbitrary metadata into DOM/state/telemetry.
  function diagnostics(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const strings = { version: 40, instanceId: 80 };
    const numbers = ['instanceStartedAt', 'requestNumber', 'serverReceivedAt', 'serverCompletedAt', 'documentCompileNumber', 'normalizationMs', 'mathFallbacks'];
    const clean = {};
    for (const [key, limit] of Object.entries(strings)) if (typeof value[key] === 'string' && value[key].length <= limit) clean[key] = value[key];
    for (const key of numbers) if (Number.isFinite(value[key]) && value[key] >= 0) clean[key] = value[key];
    return Object.keys(clean).length ? clean : null;
  }
  let openaiGlobals = { toolOutput: window.openai?.toolOutput, toolResponseMetadata: window.openai?.toolResponseMetadata };
  function applyOpenAIResult(globals) {
    if (destroyed) return;
    if (globals) for (const key of ['toolOutput', 'toolResponseMetadata']) if (Object.hasOwn(globals, key)) openaiGlobals[key] = globals[key];
    const output = openaiGlobals.toolOutput;
    if (output === undefined || output === null) return;
    startup('native_result');
    // A prior failed/early result must not suppress this new native delivery.
    if (!ready) initialized({}, true);
    const metadata = openaiGlobals.toolResponseMetadata;
    const envelope = metadata?.call_tool_result ?? metadata?.mcp_tool_result;
    // The canonical metadata envelope preserves the original result. Bind it to
    // this exact public toolOutput, including its nonsecret deliveryId. A complete
    // matched old output + metadata still requires trusted host ordering.
    if (envelope !== undefined) {
      let matches = false;
      try { inspect(output); inspect(envelope.structuredContent); matches = JSON.stringify(output) === JSON.stringify(envelope.structuredContent); } catch { /* Fail closed below. */ }
      if (!matches) {
        fallback(new Error('组件专用测验数据无效，无法安全评分。'), { structuredContent: output }); return;
      }
      applyResult(envelope); return;
    }
    // Non-Quiz canonical toolOutput can render alone. Quiz hydration still
    // requires its component-only metadata and fails closed inside applyResult.
    applyResult({ structuredContent: output });
  }
  function publishDiagnostics() {
    if (!rcDiagnostics && document.documentElement.dataset.chatuiDiagnostics !== 'rc3') return;
    root.setAttribute('data-chatui-rc', JSON.stringify({ version: rcDiagnostics?.version || '1.5.1-rc.3', timeOrigin: performance.timeOrigin, metrics, server: rcDiagnostics, contentId: latestResult?.structuredContent?.contentId, sourceHash: latestResult?.structuredContent?.sourceHash, legacyStateApi: typeof window.openai?.setWidgetState === 'function', legacyStateProvided: window.openai?.widgetState != null, hostCapabilities: Object.keys(hostCapabilities), restoreEvents }));
  }
  let currentSignature = '', hostContext = {}, hostCapabilities = {}, stateSnapshot;
  let sizeFrame = 0, lastSize = '', stateTimer = 0, revision = 0;
  const report = message => { status.textContent = message; status.hidden = !message; scheduleSize(); };
  const post = message => { if (!destroyed) window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*'); };
  const notify = (method, params = {}) => post({ method, params });
  function request(method, params) {
    if (destroyed || (method !== 'ui/initialize' && !ready)) return Promise.reject(new Error('宿主连接尚未就绪。'));
    const id = `chatui-${nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Initialization has one outstanding request, retained until reply or
        // teardown. Slow hosts may still finish after this advisory deadline.
        if (method === 'ui/initialize') {
          startup('initialize_soft_deadline');
          contextRelay.unavailable();
          if (!ready && !destroyed && !latestResult) report(connectionPendingMessage);
          return;
        }
        pending.delete(id); reject(new Error('宿主未确认请求。'));
      }, 15000);
      pending.set(id, { resolve, reject, timer, method });
      if (method === 'ui/initialize') startup('initialize_request');
      post({ id, method, params });
    });
  }
  function scheduleSize() {
    if (sizeFrame || destroyed) return;
    sizeFrame = requestAnimationFrame(() => {
      sizeFrame = 0; if (!ready) return;
      const height = Math.ceil(document.body.scrollHeight);
      const width = Math.ceil(document.documentElement.clientWidth);
      const key = `${width}:${height}`;
      if (key !== lastSize) { lastSize = key; notify('ui/notifications/size-changed', { width, height }); }
    });
  }
  function context(next) {
    if (!next || typeof next !== 'object') return;
    hostContext = { ...hostContext, ...next };
    if (['light', 'dark'].includes(hostContext.theme)) document.documentElement.style.colorScheme = hostContext.theme;
    const variables = next.styles?.variables;
    if (variables && typeof variables === 'object') {
      for (const key of ['--color-background-primary', '--color-text-primary', '--font-sans']) {
        const value = variables[key];
        if (typeof value === 'string' && value.length <= 300 && !/url\s*\(|@import|[;{}<>]/i.test(value)) document.documentElement.style.setProperty(key, value);
      }
    }
    const dimensions = hostContext.containerDimensions || {};
    const style = document.documentElement.style;
    style.height = Number.isFinite(dimensions.height) && dimensions.height > 0 ? '100vh' : '';
    style.maxHeight = Number.isFinite(dimensions.maxHeight) && dimensions.maxHeight > 0 ? `${dimensions.maxHeight}px` : '';
    style.maxWidth = Number.isFinite(dimensions.maxWidth) && dimensions.maxWidth > 0 ? `${dimensions.maxWidth}px` : '';
    scheduleSize();
  }
  const messageAllowed = () => ready && !destroyed && (standardInitialized
    ? !!hostCapabilities.message && typeof hostCapabilities.message === 'object' && !Array.isArray(hostCapabilities.message)
    : typeof window.openai?.sendFollowUpMessage === 'function');
  const sendFollowUpMessage = payload => {
    if (!messageAllowed()) return Promise.reject(new Error('当前宿主不能发送后续消息。'));
    return standardInitialized
      ? request('ui/message', { role: 'user', content: [{ type: 'text', text: payload.prompt }] })
      : window.openai.sendFollowUpMessage(payload);
  };
  const contextRelay = createModelContextRelay({ request, validate: inspect,
    isReady: () => ready && standardInitialized && !destroyed,
    capabilities: () => hostCapabilities });
  const host = {
    // Resolve capabilities at use time; a standard acknowledgement is authoritative.
    get sendFollowUpMessage() { return messageAllowed() ? sendFollowUpMessage : undefined; },
    get widgetState() { return stateSnapshot ?? window.openai?.widgetState; },
    updateModelContext(payload, notify) { contextRelay.enqueue(payload, notify); },
    setWidgetState(payload, { publish = true } = {}) {
      // This callback is only called by real input events in the component.
      stateSnapshot = payload;
      if (typeof window.openai?.setWidgetState === 'function') {
        try { Promise.resolve(window.openai.setWidgetState(payload)).catch(() => {}); } catch { /* Ephemeral state remains usable. */ }
      }
      if (publish) {
        const currentRevision = revision;
        contextRelay.enqueue(payload.modelContent, state => {
          if (!destroyed && revision === currentRevision && ['unsupported', 'unconfirmed', 'invalid', 'limit'].includes(state.status))
            report('当前操作已在图中生效，但未能确认同步到对话。');
        });
      }
    }
  };
  if (documentMode && typeof IntersectionObserver === 'function') host.navigateToHeading = node => {
    stopHeadingNavigation();
    if (destroyed || !root.contains(node) || !['H2', 'H3'].includes(node.tagName)) return Promise.resolve(false);
    const serial = navigationSerial, currentRevision = revision;
    return new Promise(resolve => {
      let observer, timer, done = false;
      const finish = ok => {
        if (done) return;
        done = true; observer?.disconnect(); clearTimeout(timer);
        if (serial === navigationSerial) cancelHeadingNavigation = undefined;
        resolve(ok);
      };
      cancelHeadingNavigation = () => finish(false);
      const active = () => !destroyed && serial === navigationSerial && revision === currentRevision && node.isConnected && root.contains(node);
      timer = setTimeout(() => finish(false), 1500);
      try {
        // Native scrolling operates on this iframe's own validated heading.
        // The observer accounts for ancestor clipping without reading parent DOM;
        // rootBounds may correctly be null for a cross-origin embedding.
        node.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
        observer = new IntersectionObserver(entries => {
          const entry = entries.find(entry => entry.target === node);
          if (!active()) { finish(false); return; }
          if (entry?.isIntersecting && entry.intersectionRatio === 1 && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0) finish(true);
        }, { threshold: [1] });
        observer.observe(node);
      } catch { finish(false); }
    });
  };
  function fallback(error, result = latestResult) {
    startup('fallback');
    stopHeadingNavigation();
    clearTimeout(stateTimer); contextRelay.reset(); revision++; mountToken = null;
    mounted?.destroy(); mounted = null; currentSignature = ''; root.replaceChildren(); root.removeAttribute('aria-busy'); stateSnapshot = undefined;
    const text = result?.content?.filter(item => item.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n\n');
    if (responseMode && text && text.length <= 512 * 1024) {
      const readable = document.createElement('pre'); readable.className = 'cui-render-fallback'; readable.textContent = text; root.append(readable);
      // A readable fallback must not hide a concrete document rejection (for
      // example, an unrepresentable geometry radius). Report only bounded text.
      const detail = documentMode && error instanceof Error ? error.message.slice(0, 300) : '';
      report(result.isError ? '数据校验未通过；请根据以下错误修正一次，仍失败则用文字回答。' : detail ? `文档校验或显示失败：${detail} 以下保留同源可读文本。` : '视图未能完成显示，以下保留同源可读文本。');
    } else report(error instanceof Error ? error.message : '组件数据未通过校验，请根据工具错误修正后重试。');
  }
  function applyResult(result) {
    latestResult = result;
    rcDiagnostics = null;
    if (result?.isError) { fallback(null, result); return; }
    const receivedAt = performance.now();
    let startupStep = 'validation';
    try {
      rcDiagnostics = diagnostics(result?.structuredContent?.runtimeDiagnostics || (!hasQuiz(result?.structuredContent) && result?._meta?.chatui?.rc));
      const view = hydrateQuizView(result?.structuredContent, result?._meta);
      const htmlMode = !documentMode && responseMode && view?.mode === 'html';
      const config = documentMode ? validateDocumentView(view) : htmlMode ? ChatUIHtml.validateHtmlView(view) : responseMode ? validateResponseView(view) : explanationMode ? validateExplanation(view) : validateComponent(view);
      const signature = JSON.stringify(config);
      startup('validation_ok');
      if (signature === currentSignature) { startup('same_result'); return; }
      startupStep = 'mount'; startup('mount_start');
      stopHeadingNavigation();
      const timing = { receivedAt, dataReadyAt: performance.now(), firstPaintAt: null, firstPaintMs: null, completeAt: null, keyedUpdate: false };
      clearTimeout(stateTimer); contextRelay.reset(); revision++; activeTiming = timing;
      if (responseMode && !htmlMode && mounted?.kind !== 'html' && mounted?.update?.(config)) {
        timing.keyedUpdate = true;
      } else {
        mountToken = {}; const token = mountToken;
        mounted?.destroy(); mounted = null; root.replaceChildren(); root.removeAttribute('aria-busy'); stateSnapshot = undefined;
        const scopedHost = {
          get widgetState() { return host.widgetState; },
          setWidgetState(payload, options) { if (!destroyed && mountToken === token) host.setWidgetState(payload, options); },
          updateModelContext(payload, notify) { if (!destroyed && mountToken === token) host.updateModelContext(payload, notify); },
          onRenderComplete() { if (destroyed || mountToken !== token) return; if (activeTiming) activeTiming.completeAt = performance.now(); startup('mount_complete'); publishDiagnostics(); scheduleSize(); },
          onRenderError(error) { queueMicrotask(() => { if (!destroyed && mountToken === token) { startup('mount_error'); fallback(error); } }); }
        };
        Object.defineProperty(scopedHost, 'sendFollowUpMessage', { get() {
          return mountToken === token && !destroyed && host.sendFollowUpMessage ? payload =>
            mountToken === token && !destroyed ? sendFollowUpMessage(payload) : Promise.reject(new Error('图解已更新。')) : undefined;
        } });
        if (host.navigateToHeading) scopedHost.navigateToHeading = node => mountToken === token && !destroyed ? host.navigateToHeading(node) : Promise.resolve(false);
        mounted = htmlMode ? ChatUIHtml.mountHtmlSurface(config, scopedHost, root) : responseMode || explanationMode ? mountExplanation(config, scopedHost, root) : mountChatUI(config, scopedHost, root);
      }
      currentSignature = signature; startup('mount_returned');
      if (!responseMode && !explanationMode) { timing.completeAt = performance.now(); startup('mount_complete'); }
      publishDiagnostics();
      sample(metrics.renders, timing);
      // Two animation frames include a browser paint opportunity, not just DOM construction.
      const frameRevision = revision;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (destroyed || frameRevision !== revision) return;
        timing.firstPaintAt = performance.now(); timing.firstPaintMs = timing.firstPaintAt - Math.max(metrics.viewReadyAt, receivedAt); publishDiagnostics();
      }));
      report(''); scheduleSize();
    } catch (error) { startup(startupStep === 'validation' ? 'validation_error' : 'mount_error'); fallback(error, result); }
  }
  function teardown() {
    startup('teardown');
    stopHeadingNavigation();
    revision++; mountToken = null;
    contextRelay.destroy();
    mounted?.destroy(); observer?.disconnect(); clearTimeout(stateTimer); cancelAnimationFrame(sizeFrame);
    window.removeEventListener('message', receive);
    window.removeEventListener('openai:set_globals', restoreState);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('组件已关闭。')); }
    pending.clear(); destroyed = true;
  }
  function receive(event) {
    if (event.source !== window.parent || destroyed) return;
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (Object.hasOwn(message, 'id') && !message.method && pending.has(message.id)) {
      const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
      const invalidContextAck = entry.method === 'ui/update-model-context' &&
        (message.result === null || typeof message.result !== 'object' || Array.isArray(message.result));
      if (message.error || message.result?.isError || invalidContextAck) entry.reject(new Error('宿主未接受请求。'));
      else entry.resolve(message.result); return;
    }
    switch (message.method) {
      case 'ui/notifications/tool-result': startup('mcp_result'); applyResult(message.params); break;
      case 'ui/notifications/tool-input': case 'ui/notifications/tool-input-partial':
        sample(metrics.inputs, { at: performance.now(), kind: message.method.endsWith('partial') ? 'partial' : 'complete' }); publishDiagnostics();
        // Trace only until genuine ChatGPT timing proves complete input is available. Never animate partial text.
        if (!mounted) report('正在准备内容…'); break;
      case 'ui/notifications/tool-cancelled': report('本次图解生成已取消。'); break;
      case 'ui/notifications/host-context-changed': context(message.params); break;
      case 'ui/resource-teardown':
        if (message.id !== undefined) post({ id: message.id, result: {} }); teardown(); break;
      case 'ping': if (message.id !== undefined) post({ id: message.id, result: {} }); break;
      default:
        if (message.id !== undefined && message.method) post({ id: message.id, error: { code: -32601, message: 'Method not found' } });
    }
  }
  function restoreState(event) {
    const globals = event.detail?.globals;
    if (globals && (Object.hasOwn(globals, 'toolOutput') || Object.hasOwn(globals, 'toolResponseMetadata'))) applyOpenAIResult(globals);
    mounted?.refreshHostCapabilities?.();
    const candidate = globals?.widgetState;
    if (candidate !== undefined) { restoreEvents++; publishDiagnostics(); }
    if (candidate === undefined || destroyed || !mounted || mounted.kind === 'html') return;
    try { inspect(candidate); stateSnapshot = candidate; mounted.restore?.(candidate); scheduleSize(); }
    catch { /* Malformed restoration never replaces a valid, active interaction. */ }
  }
  window.addEventListener('message', receive);
  window.addEventListener('openai:set_globals', restoreState);
  root.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    event.preventDefault();
    if (!hostCapabilities.openLinks) { report(`当前宿主不能打开来源，可复制此地址：${link.href}`); return; }
    const linkRevision = revision;
    request('ui/open-link', { url: link.href }).catch(() => {
      if (!destroyed && revision === linkRevision) report('未能确认来源已打开。');
    });
  });
  for (const eventName of ['click', 'input', 'keydown']) root.addEventListener(eventName, () => {
    const startedAt = performance.now(), eventRevision = revision;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!destroyed && eventRevision === revision) sample(metrics.interactions, { kind: eventName, feedbackMs: performance.now() - startedAt });
    }));
  }, { capture: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleSize) : null;
  observer?.observe(document.body);
  // A persisted page is suspended for history restoration, not destroyed.
  window.addEventListener('pagehide', event => { if (!event.persisted) teardown(); });
  function initialized(result, native = false) {
    if (destroyed) return;
    if (status.textContent === connectionPendingMessage) report('');
    ready = true; metrics.initializedAt = performance.now(); hostCapabilities = result?.hostCapabilities || {}; context(result?.hostContext);
    if (!native) standardInitialized = true;
    startup(native ? 'native_ready' : 'initialize_success');
    mounted?.refreshHostCapabilities?.();
    if (!native) { notify('ui/notifications/initialized'); contextRelay.refresh(); } publishDiagnostics(); scheduleSize();
  }
  if (openaiGlobals.toolOutput != null) applyOpenAIResult();
  // Native data may paint immediately; standard capability negotiation still
  // runs, so an alias delivery never silently disables the public relay.
  request('ui/initialize', {
    appInfo: { name: 'ChatUI renderer', version: '1.5.0' },
    appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] }, protocolVersion: '2026-01-26'
  }).then(result => {
    initialized(result);
    if (!destroyed && !latestResult) applyOpenAIResult();
  }).catch(() => { if (!destroyed) { startup('initialize_chain_error'); contextRelay.unavailable(); } if (!ready && !destroyed) report(connectionPendingMessage); });
})();
