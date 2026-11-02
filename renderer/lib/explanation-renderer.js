/* One document compositor for legacy explanations and normalized responses.
 * All DOM comes from validated data. No HTML strings, scripts or remote assets. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Referenced by the bundled MCP bridge.
function mountExplanation(config, host, root) {
  'use strict';
  const responseMode = config.viewVersion === 1;
  const documentMode = config.mode === 'document';
  const validate = documentMode ? validateDocumentView : responseMode ? validateResponseView : validateExplanation;
  validate(config);
  let resolved = responseMode ? config : resolveExplanation(config);
  const create = (tag, cls, text, ns) => {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (cls) node.setAttribute('class', cls);
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const fingerprint = value => {
    const serialized = JSON.stringify(value); let h1 = 2166136261, h2 = 5381;
    for (let i = 0; i < serialized.length; i++) { h1 = Math.imul(h1 ^ serialized.charCodeAt(i), 16777619); h2 = Math.imul(h2, 33) ^ serialized.charCodeAt(i); }
    return `${serialized.length}:${h1 >>> 0}:${h2 >>> 0}`;
  };
  // Only public Quiz fields may contribute to emitted restoration identities.
  // Graded fingerprints remain internal to live record reconciliation below.
  const publicStateValue = value => {
    if (Array.isArray(value)) return value.map(publicStateValue);
    if (!value || typeof value !== 'object') return value;
    if (value.type === 'quiz' && value.data?.questions) {
      const data = { questions: value.data.questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options.map(o => ({ id: o.id, label: o.label })) })) };
      for (const key of ['followUp', 'followUpLabel', 'note']) if (value.data[key] !== undefined) data[key] = value.data[key];
      return { ...value, data };
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, publicStateValue(child)]));
  };
  const snapshotIdentity = value => `${value.contentId}:${fingerprint(responseMode ? value.facts : publicStateValue(value))}`;
  const identity = snapshotIdentity(config), stateName = responseMode ? 'chatuiResponse' : 'chatuiExplanation';
  const mounts = new Map(), stateful = new Map(), modelStates = new Map(), records = new Map(), activeTokens = new Map();
  const restoreKinds = new Map(), blockKeys = new Map();
  const stateKey = block => fingerprint(block.kind === 'collapse' ? { ...block, blocks: [] } : block.kind === 'tabs' ? { ...block, items: block.items.map(item => ({ ...item, blocks: [] })) } : publicStateValue(block));
  const collect = blocks => blocks.forEach(block => {
    blockKeys.set(block.id, stateKey(block));
    if (block.kind === 'group' || block.kind === 'collapse') { if (block.kind === 'collapse') restoreKinds.set(block.id, 'collapse'); collect(block.blocks); }
    else if (block.kind === 'tabs') { restoreKinds.set(block.id, 'tabs'); block.items.forEach(item => collect(item.blocks)); }
    else if (block.kind === 'component') restoreKinds.set(block.id, 'chatui');
    else if (block.kind === 'diagram' && block.states) restoreKinds.set(block.id, 'diagram');
  });
  collect(resolved.blocks);
  let destroyed = false, instanceSerial = 0, batchFrame = 0, batchTimer = 0, renderSerial = 0, copySerial = 0;
  let readingTools = null, outline = null, outlineSummary = null, outlineList = null, outlineNote = null, navigationStatus = null, copyButton = null, copyStatus = null, copyFallback = null, copyText = null;
  let outlineNavigation = typeof host.navigateToHeading === 'function', navigationSerial = 0;
  const visibleInDocument = node => {
    for (let ancestor = node; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' || ancestor.tagName === 'DETAILS' && !ancestor.open) return false;
    }
    return true;
  };
  function refreshOutline() {
    if (!documentMode || destroyed || !outline) return;
    // Tabs can refresh the outline while the rest of an async document is
    // mounting. Do not expose chapter actions that that mount will invalidate.
    if (root.getAttribute('aria-busy') === 'true') { outline.hidden = true; return; }
    navigationSerial++;
    navigationStatus.textContent = '';
    // These headings were created from the validated view. Component internals
    // and author text resembling HTML/anchors never become chapter entries.
    const headings = [...root.querySelectorAll('.cui-document h2, .cui-document h3, .cui-ex-heading')];
    const counters = new Map(), visible = [];
    for (const node of headings) {
      const blockId = node.closest('[data-block-id]').dataset.blockId;
      const index = counters.get(blockId) || 0; counters.set(blockId, index + 1);
      node.id = `${root.id}-document-heading-${blockId}-${index}`;
      if (visibleInDocument(node)) visible.push(node);
    }
    outline.hidden = visible.length < 6;
    outlineSummary.textContent = `章节概览 · ${visible.length} 节`;
    outlineNote.textContent = outlineNavigation ? '选择章节可跳转；定位确认后焦点移到标题。' : '当前环境未提供可靠章节定位；以下仅为静态概览。';
    outlineList.replaceChildren();
    if (outline.hidden) { outline.open = false; return; }
    for (const node of visible) {
      const item = create('li', 'cui-document-outline-item');
      if (outlineNavigation) {
        const button = create('button', 'cui-document-chapter', node.textContent); button.type = 'button';
        button.addEventListener('click', async () => {
          const attempt = ++navigationSerial, serial = renderSerial;
          const active = () => !destroyed && attempt === navigationSerial && serial === renderSerial && root.contains(node) && visibleInDocument(node);
          button.disabled = true; navigationStatus.textContent = '正在定位章节…';
          try {
            const located = await host.navigateToHeading(node);
            if (!active()) return;
            if (located !== true) throw new Error('Navigation unconfirmed');
            node.tabIndex = -1; node.focus({ preventScroll: true });
            if (document.activeElement !== node) throw new Error('Focus unconfirmed');
            navigationStatus.textContent = `已定位：${node.textContent}`;
          } catch {
            if (!active()) return;
            const returnFocus = document.hasFocus() && document.activeElement === button;
            outlineNavigation = false; refreshOutline();
            navigationStatus.textContent = '章节定位未确认，已保留静态概览。请手动滚动阅读。';
            if (returnFocus) outlineSummary.focus({ preventScroll: true });
          } finally { if (!destroyed && button.isConnected) button.disabled = false; }
        });
        item.append(button);
      } else item.textContent = node.textContent;
      item.dataset.level = node.tagName.slice(1); outlineList.append(item);
    }
  }
  // One bounded observer serves the document's own scroll regions. Content
  // changes are already known to the compositor; no subtree observer is needed.
  const scrollRegions = new Map();
  let scrollFrame = 0;
  function refreshScrollRegions() {
    scrollFrame = 0;
    if (destroyed) return;
    for (const [node, record] of scrollRegions) {
      if (!root.contains(node)) {
        scrollObserver?.unobserve(node); if (record.content) scrollObserver?.unobserve(record.content); scrollRegions.delete(node); continue;
      }
      const overflow = visibleInDocument(node) && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1;
      record.hint.hidden = !overflow;
      node.classList.toggle('cui-document-overflow', overflow);
      if (overflow) {
        node.tabIndex = 0; node.setAttribute('role', 'region');
        node.setAttribute('aria-label', record.label); node.setAttribute('aria-describedby', record.hint.id);
      } else {
        node.removeAttribute('tabindex'); node.removeAttribute('role');
        node.removeAttribute('aria-label'); node.removeAttribute('aria-describedby');
      }
    }
  }
  function scheduleScrollRegions() {
    if (documentMode && !destroyed && !scrollFrame) scrollFrame = requestAnimationFrame(refreshScrollRegions);
  }
  const scrollObserver = documentMode && typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleScrollRegions) : null;
  const themeObserver = documentMode && typeof MutationObserver === 'function' ? new MutationObserver(scheduleScrollRegions) : null;
  function readableScroll(node, label) {
    if (!documentMode) return node;
    const wrapper = create('div', 'cui-document-scroll-block');
    const hint = create('p', 'cui-document-scroll-hint', `横向滚动查看完整${label}`);
    hint.id = `${root.id}-document-scroll-${instanceSerial++}`; hint.hidden = true;
    node.removeAttribute('tabindex'); node.removeAttribute('role'); node.removeAttribute('aria-label');
    wrapper.append(node, hint);
    const content = node.firstElementChild;
    scrollRegions.set(node, { hint, label: `${label}，可横向滚动`, content });
    scrollObserver?.observe(node); if (content) scrollObserver?.observe(content);
    return wrapper;
  }
  function destroyReadingObservers() {
    cancelAnimationFrame(scrollFrame); scrollObserver?.disconnect(); themeObserver?.disconnect(); scrollRegions.clear();
    window.removeEventListener('resize', scheduleScrollRegions);
    document.fonts?.removeEventListener('loadingdone', scheduleScrollRegions);
  }
  function resetCopy() {
    copySerial++;
    if (!readingTools) return;
    copyButton.disabled = false; copyButton.removeAttribute('aria-busy');
    copyStatus.textContent = ''; copyFallback.hidden = true; copyText.value = '';
  }
  function createReadingTools() {
    readingTools = create('div', 'cui-document-tools');
    outline = create('details', 'cui-document-outline'); outline.hidden = true;
    outlineSummary = create('summary', 'cui-document-outline-title');
    outlineList = create('ul', 'cui-document-outline-list');
    // A verified adapter or the native observer path may confirm positioning.
    // Other environments retain static entries without parent DOM access.
    outlineNote = create('p', 'cui-document-outline-note');
    navigationStatus = create('p', 'cui-document-navigation-status'); navigationStatus.setAttribute('role', 'status'); navigationStatus.setAttribute('aria-live', 'polite');
    outline.append(outlineSummary, outlineNote, outlineList, navigationStatus);
    const actions = create('div', 'cui-document-copy-actions');
    copyButton = create('button', 'cui-button cui-document-copy', '复制完整文档'); copyButton.type = 'button';
    copyStatus = create('p', 'cui-document-copy-status'); copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
    actions.append(copyButton, copyStatus);
    copyFallback = create('div', 'cui-document-copy-fallback'); copyFallback.hidden = true;
    const label = create('label', '', '完整文档文本（只读，可手动选择复制）');
    copyText = create('textarea', 'cui-document-copy-text'); copyText.id = `${root.id}-document-copy-text`; copyText.readOnly = true; copyText.rows = 10; label.htmlFor = copyText.id;
    const close = create('button', 'cui-button cui-document-copy-close', '关闭手动复制'); close.type = 'button';
    const closeCopy = () => { if (destroyed) return; resetCopy(); copyButton.focus(); };
    close.addEventListener('click', closeCopy);
    copyFallback.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeCopy(); } });
    copyFallback.append(label, copyText, close); readingTools.append(outline, actions, copyFallback);
    copyButton.addEventListener('click', async () => {
      if (destroyed) return;
      resetCopy(); const attempt = copySerial, serial = renderSerial;
      // Derive from this validated snapshot using the server's exact fallback
      // serializer, including all disclosures and tabs, with quiz keys omitted.
      const text = responseText(config);
      const active = () => !destroyed && serial === renderSerial && attempt === copySerial;
      copyButton.disabled = true; copyButton.setAttribute('aria-busy', 'true');
      try {
        if (typeof host.copyText === 'function') await host.copyText(text);
        else {
          if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(text);
        }
        if (active()) copyStatus.textContent = '已复制完整文档。';
      } catch {
        if (!active()) return;
        copyStatus.textContent = '自动复制未完成。请在下方选中文本后手动复制。';
        copyText.value = text; copyFallback.hidden = false; copyText.focus(); copyText.select();
      } finally {
        if (active()) { copyButton.disabled = false; copyButton.removeAttribute('aria-busy'); }
      }
    });
  }
  const envelope = candidate => {
    try {
      if (candidate === undefined) return null;
      inspect(candidate);
      const state = candidate?.privateContent?.[stateName];
      if (state?.schemaVersion !== 1 || state.identity !== identity || !eobject(state.blocks)) return null;
      return Object.fromEntries([...restoreKinds].flatMap(([id, kind]) => {
        const entry = state.blocks[id];
        if (responseMode && entry?.identity !== blockKeys.get(id)) return [];
        const value = entry?.privateContent?.[kind];
        return eobject(value) ? [[id, { ...(responseMode ? { identity: blockKeys.get(id) } : {}), privateContent: { [kind]: value } }]] : [];
      }));
    } catch { return null; }
  };
  let states = { ...envelope(host.widgetState) };
  const sceneCallbacks = new Map(); let interactionRevision = 0;
  const contextSnapshot = () => ({ type: responseMode ? 'response' : 'explanation', contentId: config.contentId,
    snapshotId: identity, interactionRevision: ++interactionRevision,
    blocks: [...modelStates].filter(([id]) => activeTokens.has(id)).map(([id, value]) => ({ ...value, id })) });
  function sendContext(snapshot) {
    const callbacks = [...sceneCallbacks].map(([id, entry]) => ({ id, ...entry }));
    const notify = state => {
      for (const entry of callbacks) if (!destroyed && activeTokens.get(entry.id) === entry.token && modelStates.get(entry.id)?.interactionRevision === entry.revision) entry.notify(state);
    };
    if (JSON.stringify(snapshot).length > 16000 || !host.updateModelContext) { notify({ status: 'unsupported' }); return; }
    host.updateModelContext(snapshot, notify);
  }
  function publishScene(block, payload, token, notify, candidate) {
    if (destroyed || activeTokens.get(block.id) !== token) return;
    try {
      // Revalidate the exact state against this immutable authored block.
      const clean = sceneExploration(block, candidate, payload.interactionRevision);
      if (JSON.stringify(clean) !== JSON.stringify(payload)) throw new Error('Invalid exploration projection');
      modelStates.set(block.id, { ...clean, sceneIdentity: blockKeys.get(block.id) });
      sceneCallbacks.set(block.id, { token, revision: clean.interactionRevision, notify });
      sendContext(contextSnapshot());
    } catch { notify({ status: 'invalid' }); }
  }
  function save(id, payload, token) {
    if (destroyed || !stateful.has(id) || activeTokens.get(id) !== token) return;
    try { inspect(payload); } catch { return; }
    if (!eobject(payload?.privateContent) || !eobject(payload?.modelContent)) return;
    states[id] = { ...(responseMode ? { identity: blockKeys.get(id) } : {}), privateContent: payload.privateContent };
    // Authored diagram states carry semantic labels (for example motion
    // stages); preserve their established context summaries. Disclosure and
    // tab navigation remain presentation-only.
    const publish = !['collapse', 'tabs'].includes(payload.modelContent.type);
    if (publish) modelStates.set(id, payload.modelContent);
    const snapshot = {
      // Scene relay never falls back to widgetState's modelContent channel.
      modelContent: { type: responseMode ? 'response' : 'explanation', contentId: config.contentId,
        blocks: [...modelStates].filter(([key, value]) => stateful.has(key) && value.type !== 'scene-exploration').map(([key, value]) => ({ ...value, id: key })) },
      privateContent: { [stateName]: { schemaVersion: 1, identity, blocks: states } }
    };
    if (JSON.stringify(snapshot).length <= 60000) {
      try { Promise.resolve(host.setWidgetState?.(snapshot, { publish: false })).catch(() => {}); } catch { /* Persistence is optional. */ }
      if (publish) sendContext(contextSnapshot());
    }
  }
  const heading = (block, parent) => { if (block.title) parent.append(create('h2', 'cui-ex-heading', block.title)); };
  const math = spec => {
    if (typeof spec === 'string') return create('mtext', '', spec, 'http://www.w3.org/1998/Math/MathML');
    const node = create(spec.tag, '', spec.text, 'http://www.w3.org/1998/Math/MathML');
    for (const [name, value] of Object.entries(spec.attrs || {})) node.setAttribute(name, value);
    spec.children?.forEach(child => node.append(math(child)));
    return node;
  };
  const formula = (spec, display = true, label) => {
    const node = create('math', '', undefined, 'http://www.w3.org/1998/Math/MathML'); node.setAttribute('display', display ? 'block' : 'inline');
    if (label) node.setAttribute('aria-label', label);
    node.append(math(spec)); return node;
  };
  function richNodes(nodes, parent) {
    for (const spec of nodes) {
      if (spec.type === 'text') { parent.append(document.createTextNode(spec.text)); continue; }
      if (spec.type === 'math') {
        const container = create(spec.display ? 'div' : 'span', spec.display ? 'cui-math cui-ex-math-scroll' : 'cui-inline-math');
        if (spec.display) { container.tabIndex = 0; container.setAttribute('role', 'region'); container.setAttribute('aria-label', '公式，可横向滚动'); }
        container.append(formula(spec.math, spec.display, spec.tex)); parent.append(spec.display ? readableScroll(container, '公式') : container); continue;
      }
      const tags = { paragraph: 'p', strong: 'strong', em: 'em', del: 'del', code: 'code', codeblock: 'pre', blockquote: 'blockquote', item: 'li', table: 'table', row: 'tr', break: 'br', rule: 'hr', link: 'a' };
      const tag = spec.type === 'heading' ? `h${spec.level}` : spec.type === 'list' ? spec.ordered ? 'ol' : 'ul' : spec.type === 'cell' ? spec.header ? 'th' : 'td' : tags[spec.type];
      const node = create(tag, '', spec.text);
      if (spec.type === 'codeblock') { node.textContent = ''; node.tabIndex = 0; node.setAttribute('aria-label', spec.language ? `${spec.language} 代码` : '代码'); node.append(create('code', '', spec.text)); }
      if (spec.type === 'list' && spec.ordered) node.start = spec.start;
      if (spec.type === 'link') { node.href = spec.href; node.rel = 'noreferrer noopener'; }
      if (spec.type === 'cell' && spec.header) node.scope = 'col';
      if (spec.children) richNodes(spec.children, node);
      if (spec.type === 'table') { const scroll = create('div', 'cui-document-table'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '表格，可横向滚动'); scroll.append(node); parent.append(readableScroll(scroll, '表格')); }
      else if (spec.type === 'codeblock') parent.append(readableScroll(node, spec.language ? `${spec.language} 代码` : '代码'));
      else parent.append(node);
    }
  }
  function diagram(block, parent, token) {
    const ns = 'http://www.w3.org/2000/svg';
    const figure = create('figure', 'cui-panel cui-stack cui-diagram');
    // User IDs contain hyphens, so concatenating block/state IDs can alias
    // another block's accessibility IDs. Namespace each actual mount instead.
    const base = `${root.id}-ex-diagram-${instanceSerial++}`;
    if (block.title) figure.append(create('h3', 'cui-title', block.title));
    const description = create('p', 'cui-muted', block.description);
    figure.append(description);
    const options = block.states || [];
    const initial = block.initialState || options[0]?.id;
    const clean = payload => options.some(state => state.id === payload?.privateContent?.diagram?.stateId) ? payload.privateContent.diagram.stateId : initial;
    let selected = clean(states[block.id]);
    const controls = create('div', 'cui-diagram-switch');
    controls.setAttribute('role', 'tablist'); controls.setAttribute('aria-label', `${block.title || '图解'}：切换观察状态`);
    const panel = create('div', 'cui-diagram-canvas'); panel.id = `${base}-panel`;
    const svg = create('svg', 'cui-ex-svg', undefined, ns);
    svg.setAttribute('viewBox', `0 0 ${block.viewBox.width} ${block.viewBox.height}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-labelledby', `${base}-title ${base}-desc`);
    const caption = create('figcaption', 'cui-diagram-caption'); caption.setAttribute('aria-live', 'polite');
    const color = tone => `var(--cui-${tone === 'neutral' || !tone ? 'muted' : tone})`;
    const drawPrimitive = (element, target) => {
      const kind = { point: 'circle', line: 'line', arrow: 'line', circle: 'circle', rect: 'rect', path: 'path', text: 'text' }[element.kind];
      const node = create(kind, '', undefined, ns);
      node.dataset.primitiveId = element.id;
      const attributes = {
        point: { cx: element.x, cy: element.y, r: element.r ?? 5 },
        line: { x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2 },
        arrow: { x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2, 'marker-end': `url(#${base}-${element.tone || 'neutral'}-arrow)` },
        circle: { cx: element.cx, cy: element.cy, r: element.r },
        rect: { x: element.x, y: element.y, width: element.width, height: element.height, rx: element.radius ?? 10 },
        path: { d: element.commands?.map(command => `${command.op} ${command.values.join(' ')}`).join(' ') },
        text: { x: element.x, y: element.y, 'text-anchor': element.anchor || 'middle', 'dominant-baseline': 'middle' }
      }[element.kind];
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      const fill = element.fill || (element.kind === 'point' || element.kind === 'text' ? 'solid' : 'none');
      node.setAttribute('stroke', element.kind === 'text' ? 'none' : color(element.tone));
      node.setAttribute('stroke-width', String(element.strokeWidth ?? 2));
      node.setAttribute('vector-effect', 'non-scaling-stroke');
      node.setAttribute('fill', fill === 'none' ? 'none' : color(element.tone));
      if (fill === 'soft') node.setAttribute('fill-opacity', '.09');
      if (element.dashed) node.setAttribute('stroke-dasharray', '6 6');
      if (element.kind === 'text') {
        node.textContent = element.text;
        node.dataset.fontSize = String(element.fontSize ?? 22);
      }
      target.append(node);
      if (element.label) {
        const label = create('text', 'cui-diagram-label', element.label, ns);
        const positions = {
          point: [element.x, element.y - (element.r || 5) - 18],
          circle: [element.cx, element.cy], rect: [element.x + element.width / 2, element.y + element.height / 2],
          line: [(element.x1 + element.x2) / 2, (element.y1 + element.y2) / 2 - 18],
          arrow: [(element.x1 + element.x2) / 2, (element.y1 + element.y2) / 2 - 18],
          path: [block.viewBox.width / 2, 25], text: [element.x, element.y + 24]
        }[element.kind];
        label.setAttribute('x', String(element.labelX ?? positions[0])); label.setAttribute('y', String(element.labelY ?? positions[1]));
        label.setAttribute('text-anchor', 'middle'); label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', color(element.tone)); label.dataset.fontSize = '22'; target.append(label);
      }
    };
    function sizeLabels() {
      const width = svg.getBoundingClientRect().width || block.viewBox.width;
      const minimum = 14 * block.viewBox.width / width;
      for (const text of svg.querySelectorAll('text')) text.setAttribute('font-size', String(Math.max(Number(text.dataset.fontSize), minimum)));
    }
    function draw() {
      svg.replaceChildren();
      const state = options.find(value => value.id === selected);
      const title = create('title', '', block.title || '关系图解', ns); title.id = `${base}-title`;
      const desc = create('desc', '', `${block.description}${state ? ` ${state.label}：${state.description || ''}` : ''}`, ns); desc.id = `${base}-desc`;
      svg.append(title, desc);
      const defs = create('defs', '', undefined, ns);
      for (const tone of ['blue', 'green', 'orange', 'neutral']) {
        const marker = create('marker', '', undefined, ns); marker.id = `${base}-${tone}-arrow`;
        for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' })) marker.setAttribute(key, String(value));
        const path = create('path', '', undefined, ns); path.setAttribute('d', 'M 1 1 L 9 5 L 1 9 Z'); path.setAttribute('fill', color(tone)); marker.append(path); defs.append(marker);
      }
      svg.append(defs);
      [...(block.elements || []), ...(state?.elements || [])].forEach(element => drawPrimitive(element, svg));
      for (const button of controls.children) {
        const active = button.dataset.stateId === selected;
        button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      }
      if (state) { panel.setAttribute('aria-labelledby', `${base}-tab-${state.id}`); caption.textContent = state.description || state.label; }
      else caption.textContent = '';
      sizeLabels();
    }
    function select(id, genuine) {
      if (id === selected) return;
      selected = id; draw();
      if (genuine) save(block.id, { modelContent: { type: 'diagram', stateId: selected, label: options.find(state => state.id === selected).label }, privateContent: { diagram: { stateId: selected } } }, token);
    }
    options.forEach((state, index) => {
      const button = create('button', 'cui-button', state.label); button.type = 'button'; button.id = `${base}-tab-${state.id}`;
      button.dataset.stateId = state.id; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
      button.addEventListener('click', () => select(state.id, true));
      button.addEventListener('keydown', event => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        select(options[next].id, true); controls.children[next].focus();
      });
      controls.append(button);
    });
    if (options.length) { panel.setAttribute('role', 'tabpanel'); figure.append(controls); }
    panel.append(svg); figure.append(panel, caption); parent.append(figure); draw();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeLabels) : null;
    observer?.observe(svg);
    const instance = { destroy() { observer?.disconnect(); }, restore(payload) { selected = clean(payload); draw(); } };
    mounts.set(block.id, instance);
    if (options.length) stateful.set(block.id, instance);
  }

  function dispose(id, clearState = true) {
    mounts.get(id)?.destroy(); mounts.delete(id); stateful.delete(id); activeTokens.delete(id);
    sceneCallbacks.delete(id);
    if (clearState) { delete states[id]; modelStates.delete(id); }
  }
  function leaf(block, node, token) {
    if (block.kind === 'prose') {
      if (block.eyebrow) node.append(create('p', 'cui-ex-eyebrow', block.eyebrow));
      heading(block, node);
      if (responseMode) { node.classList.add('cui-document'); richNodes(block.nodes, node); }
      else for (const paragraph of block.text.split(/\n\s*\n/)) node.append(create('p', 'cui-ex-prose', paragraph));
    } else if (block.kind === 'math') {
      const panel = create('div', 'cui-panel cui-stack cui-ex-formula'); panel.style.setProperty('--cui-tone', `var(--cui-${!block.tone || block.tone === 'neutral' ? 'muted' : block.tone})`);
      if (block.tone && block.tone !== 'neutral') panel.classList.add('cui-ex-formula-colored');
      if (block.label) panel.append(create('span', 'cui-badge', block.label));
      if (block.title) panel.append(create('h3', 'cui-title', block.title));
      const container = create('div', 'cui-math cui-ex-math-scroll'); container.tabIndex = 0; container.setAttribute('aria-label', '公式，可横向滚动');
      container.append(formula(block.math, true, block.tex)); panel.append(readableScroll(container, '公式'));
      if (block.detail) panel.append(create('p', '', block.detail)); node.append(panel);
    } else if (block.kind === 'component') {
      const childRoot = create('div', 'chatui-root'); childRoot.id = `${root.id}-ex-component-${instanceSerial++}`; node.append(childRoot);
      const adapter = { get widgetState() { return states[block.id]; }, setWidgetState(payload) { save(block.id, payload, token); } };
      Object.defineProperty(adapter, 'sendFollowUpMessage', { get() {
        return !destroyed && activeTokens.get(block.id) === token && host.sendFollowUpMessage ? payload =>
          destroyed || activeTokens.get(block.id) !== token || !host.sendFollowUpMessage
            ? Promise.reject(new Error('图解已更新或宿主不能发送后续消息。')) : host.sendFollowUpMessage(payload) : undefined;
      } });
      const instance = mountChatUI({ schemaVersion: 1, contentId: `${config.contentId.slice(0, 110)}/${block.id}`, type: block.type, ...(block.title ? { title: block.title } : {}), data: block.data }, adapter, childRoot);
      mounts.set(block.id, instance); stateful.set(block.id, instance);
    } else if (block.kind === 'diagram') diagram(block, node, token);
    else if (block.kind === 'scene') mounts.set(block.id, mountScene(block, node, {
      snapshotId: identity, publish(payload, notify, candidate) { publishScene(block, payload, token, notify, candidate); }
    }));
  }
  function container(block, record, token) {
    const { node } = record; heading(block, node);
    if (block.kind === 'group') {
      if (documentMode && config.callouts[block.id]) {
        node.classList.add('cui-document-callout', `cui-callout-${config.callouts[block.id]}`);
        node.setAttribute('role', 'note');
      }
      record.content = create('div', `cui-ex-group cui-ex-${block.layout}`); node.append(record.content);
    } else if (block.kind === 'collapse') {
      const details = create('details', 'cui-collapse'), summary = create('summary', '', block.summary);
      details.append(summary); record.content = create('div', 'cui-ex-group cui-ex-stack'); details.append(record.content); node.append(details);
      const clean = payload => typeof payload?.privateContent?.collapse?.open === 'boolean' ? payload.privateContent.collapse.open : !!block.open;
      details.open = clean(states[block.id]); let expectedOpen = details.open;
      details.addEventListener('toggle', () => {
        refreshOutline(); scheduleScrollRegions();
        if (details.open === expectedOpen) return;
        expectedOpen = details.open; save(block.id, { modelContent: { type: 'collapse', open: details.open }, privateContent: { collapse: { open: details.open } } }, token);
      });
      const instance = { destroy() {}, restore(payload) { expectedOpen = clean(payload); details.open = expectedOpen; } };
      mounts.set(block.id, instance); stateful.set(block.id, instance);
    } else if (block.kind === 'tabs') {
      const nav = create('div', 'cui-diagram-switch'), panes = new Map(); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', block.title || '内容切换'); node.append(nav);
      const clean = payload => block.items.some(item => item.id === payload?.privateContent?.tabs?.selected) ? payload.privateContent.tabs.selected : block.initialTab || block.items[0].id;
      let selected = clean(states[block.id]); const base = `${root.id}-tabs-${instanceSerial++}`;
      const select = (id, genuine = false) => {
        selected = id;
        for (const [key, pane] of panes) { pane.hidden = key !== selected; const button = nav.querySelector(`[data-tab-id="${key}"]`); button.setAttribute('aria-selected', String(key === selected)); button.tabIndex = key === selected ? 0 : -1; }
        refreshOutline(); scheduleScrollRegions();
        if (genuine) save(block.id, { modelContent: { type: 'tabs', selected }, privateContent: { tabs: { selected } } }, token);
      };
      block.items.forEach((item, i) => {
        const button = create('button', 'cui-button', item.label); button.type = 'button'; button.id = `${base}-${i}-tab`; button.dataset.tabId = item.id; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${base}-${i}-panel`);
        const pane = create('div', 'cui-ex-group cui-ex-stack'); pane.id = `${base}-${i}-panel`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', button.id); pane.tabIndex = 0;
        button.addEventListener('click', () => select(item.id, true));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? block.items.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + block.items.length) % block.items.length;
          select(block.items[next].id, true); nav.children[next].focus();
        });
        panes.set(item.id, pane); nav.append(button); node.append(pane);
      });
      record.panes = panes; select(selected);
      const instance = { destroy() {}, restore(payload) { select(clean(payload)); } }; mounts.set(block.id, instance); stateful.set(block.id, instance);
    }
  }
  function renderDocument() {
    cancelAnimationFrame(batchFrame); clearTimeout(batchTimer); const serial = ++renderSerial;
    resetCopy();
    if (outline) outline.open = false;
    const wanted = new Set(), jobs = [];
    let title = root.querySelector(':scope > .cui-ex-title');
    if (resolved.title) { if (!title) { title = create('h1', 'cui-ex-title'); root.prepend(title); } title.textContent = resolved.title; }
    else title?.remove();
    if (readingTools) root.insertBefore(readingTools, title ? title.nextSibling : root.firstChild);
    const reconcile = (blocks, parent) => {
      let previous = parent === root ? readingTools || title : null;
      for (const block of blocks) {
        wanted.add(block.id); const signature = fingerprint(block), structural = ['group', 'collapse', 'tabs'].includes(block.kind);
        let record = records.get(block.id);
        const shellKey = structural ? stateKey(block) : signature;
        // Group shells depend on layout/title, not child content.
        const actualShell = block.kind === 'group' ? fingerprint({ ...block, blocks: [] }) : shellKey;
        if (record && record.shellKey !== actualShell) { dispose(block.id); record.node.remove(); records.delete(block.id); record = null; }
        if (!record) {
          const node = create(block.kind === 'prose' ? 'section' : 'div', `cui-ex-block cui-ex-${block.kind}`); node.dataset.blockId = block.id;
          record = { node, signature, shellKey: actualShell, token: instanceSerial++, mounted: false }; records.set(block.id, record); activeTokens.set(block.id, record.token);
          if (structural) container(block, record, record.token);
          else node.classList.add('cui-pending-block');
        }
        if (!structural && !record.mounted) jobs.push(() => {
          if (activeTokens.get(block.id) !== record.token || record.mounted) return;
          leaf(block, record.node, record.token); record.mounted = true; record.node.classList.remove('cui-pending-block');
        });
        const position = previous ? previous.nextSibling : parent.firstChild;
        if (record.node !== position) parent.insertBefore(record.node, position);
        previous = record.node; record.signature = signature;
        if (block.kind === 'group' || block.kind === 'collapse') reconcile(block.blocks, record.content);
        if (block.kind === 'tabs') block.items.forEach(item => reconcile(item.blocks, record.panes.get(item.id)));
      }
    };
    reconcile(resolved.blocks, root);
    for (const [id, record] of records) if (!wanted.has(id)) { dispose(id); record.node.remove(); records.delete(id); }
    root.setAttribute('aria-busy', String(jobs.length > 0));
    const flush = () => {
      if (destroyed || serial !== renderSerial) return;
      const start = performance.now(); let count = 0;
      try {
        while (jobs.length && (!responseMode || count < 4 && performance.now() - start < 8 || count === 0)) { jobs.shift()(); count++; }
      } catch (error) {
        if (!responseMode) throw error;
        jobs.length = 0; root.setAttribute('aria-busy', 'false'); host.onRenderError?.(error); return;
      }
      if (jobs.length) {
        // Trusted offline hosts can progress while browsers suspend offscreen
        // opaque-frame RAF. The production bridge retains its original path.
        if (typeof host.scheduleBatch === 'function') batchTimer = host.scheduleBatch(flush);
        else batchFrame = requestAnimationFrame(() => { batchTimer = setTimeout(flush, 0); });
      }
      else { root.setAttribute('aria-busy', 'false'); refreshOutline(); scheduleScrollRegions(); host.onRenderComplete?.(); }
    };
    flush();
  }
  root.classList.add('chatui-root', 'cui-explanation'); if (responseMode) root.classList.add('cui-response');
  if (documentMode) {
    root.classList.add('cui-rich-document'); createReadingTools();
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', scheduleScrollRegions);
    document.fonts?.addEventListener('loadingdone', scheduleScrollRegions);
  }
  try { renderDocument(); } catch (error) { destroyReadingObservers(); mounts.forEach(instance => instance.destroy()); root.replaceChildren(); throw error; }
  return {
    destroy() { destroyed = true; renderSerial++; copySerial++; cancelAnimationFrame(batchFrame); clearTimeout(batchTimer); destroyReadingObservers(); mounts.forEach(instance => instance.destroy()); mounts.clear(); stateful.clear(); modelStates.clear(); sceneCallbacks.clear(); activeTokens.clear(); records.clear(); },
    update(next) {
      if (!responseMode || destroyed || snapshotIdentity(next) !== identity) return false;
      validate(next); config = next; resolved = next;
      restoreKinds.clear(); blockKeys.clear(); collect(resolved.blocks);
      renderDocument(); return true;
    },
    refreshHostCapabilities() { if (!destroyed) mounts.forEach(instance => instance.refreshHostCapabilities?.()); },
    restore(candidate) {
      const accepted = envelope(candidate); if (destroyed || accepted === null) return;
      // Do not accept modelContent as evidence of a genuine user action.
      for (const id of modelStates.keys()) if (JSON.stringify(accepted[id]?.privateContent) !== JSON.stringify(states[id]?.privateContent)) modelStates.delete(id);
      states = { ...accepted }; mounts.forEach((instance, id) => instance.restore?.(states[id]));
      refreshOutline(); scheduleScrollRegions();
    }
  };
}
