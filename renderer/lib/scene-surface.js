// Trusted view interpreter. Generated strings only enter textContent/validated attributes.
// Bounded rectangle placement; real glyph/geometry boxes are supplied by SVG.
function sceneLabelPlacement(box, obstacles, width, height, gap) {
  const overlaps = (a, b) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  const fits = b => b.x >= gap && b.y >= gap && b.x + b.width <= width - gap && b.y + b.height <= height - gap;
  const positions = [{ x: box.x, y: box.y }];
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  positions.push({ x: clamp(box.x, gap, width - gap - box.width), y: clamp(box.y, gap, height - gap - box.height) });
  for (const o of obstacles) {
    positions.push({ x: o.x - gap - box.width, y: box.y }, { x: o.x + o.width + gap, y: box.y },
      { x: box.x, y: o.y - gap - box.height }, { x: box.x, y: o.y + o.height + gap });
  }
  // A distant leader can imply the wrong referent. Use the full HTML legend
  // rather than moving a label more than 64 CSS px from its authored anchor.
  return positions.filter(p => fits({ ...box, ...p }) && Math.hypot(p.x - box.x, p.y - box.y) <= gap * 8)
    .sort((a, b) => (a.x - box.x) ** 2 + (a.y - box.y) ** 2 - (b.x - box.x) ** 2 - (b.y - box.y) ** 2)
    .slice(0, 32).map(p => ({ ...box, ...p })).find(p => !obstacles.some(o => overlaps(p, o))) || null;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Included by the resource generator.
function mountScene(scene, root, host = {}) {
  const doc = root.ownerDocument, ns = 'http://www.w3.org/2000/svg';
  const create = (tag, cls, text, namespace) => {
    const node = namespace ? doc.createElementNS(namespace, tag) : doc.createElement(tag);
    if (cls) node.setAttribute('class', cls);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const prefix = `${root.id || 'scene'}-${scene.id}`;
  const section = create('section', 'cui-scene'); section.tabIndex = -1;
  section.setAttribute('aria-label', scene.title || scene.description);
  if (scene.title) section.append(create('h2', 'cui-scene-heading', scene.title));
  section.append(create('p', 'cui-scene-description', scene.description));
  const content = create('div'), status = create('p', 'cui-scene-status');
  status.id = `${prefix}-status`; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const syncStatus = create('p', 'cui-scene-sync-status', '尚无新的探索条件。'); syncStatus.setAttribute('role', 'status');
  const copy = create('button', 'cui-button', '复制当前条件'); copy.type = 'button';
  const copyText = create('textarea', 'cui-scene-copy'); copyText.readOnly = true; copyText.hidden = true; copyText.setAttribute('aria-label', '可复制的当前探索条件');
  section.append(content, status, syncStatus, copy, copyText);
  const records = new Map(); let destroyed = false, snapshot = projectScene(scene), interactionRevision = 0, dragSession = null;
  let publicSignature = null, copyAttempt = 0;
  try { publicSignature = JSON.stringify(sceneExploration(scene, snapshot.state, 0).parameters); } catch { /* Context budgets must not prevent local rendering. */ }
  const syncMessages = { pending: '本图已更新；对话同步尚未确认。', sending: '正在同步当前探索条件。', received: '宿主已接收当前条件；下次回答是否采用仍需核对。' };
  const setSync = value => { if (!destroyed) syncStatus.textContent = syncMessages[value.status] || '本图已更新，但未同步到对话。可复制条件附在下一条消息中。'; };
  copy.addEventListener('click', async () => {
    const attempt = ++copyAttempt, revision = interactionRevision;
    const active = () => !destroyed && attempt === copyAttempt && revision === interactionRevision;
    copyText.hidden = true;
    syncStatus.textContent = '正在复制当前探索条件…';
    const text = JSON.stringify({ snapshotId: host.snapshotId || scene.id, blockId: scene.id, interactionRevision,
      parameters: Object.fromEntries(Object.entries(scene.state).filter(([, spec]) => spec.role !== 'presentation').map(([id]) => [id, snapshot.state[id]])) }, null, 2);
    try { await doc.defaultView.navigator.clipboard.writeText(text); if (active()) syncStatus.textContent = '已复制当前探索条件。'; }
    catch { if (active()) { syncStatus.textContent = '自动复制未完成，请手动复制下方条件。'; copyText.value = text; copyText.hidden = false; copyText.focus(); copyText.select(); } }
  });
  copyText.addEventListener('keydown', event => { if (event.key === 'Escape') { copyText.hidden = true; copy.focus(); } });
  const tone = name => `var(--cui-${name && name !== 'neutral' ? name : 'muted'})`;
  function build(n, parent) {
    let el, value, marks, svg, labels, legend, drags;
    if (n.kind === 'layout') {
      el = create('div', `cui-scene-layout cui-scene-${n.direction} cui-scene-gap-${n.gap || 'medium'}`);
      el.style.alignItems = n.align === 'start' ? 'start' : n.align === 'center' ? 'center' : 'stretch';
      if (n.direction === 'grid') el.style.setProperty('--scene-columns', String(n.columns || 2));
      n.children.forEach(child => build(child, el));
    } else if (n.kind === 'text') el = create(n.style === 'heading' ? 'h3' : 'p', `cui-scene-text cui-scene-${n.style || 'body'}`);
    else if (n.kind === 'formula') {
      el = create('div', 'cui-scene-formula'); el.tabIndex = 0; el.setAttribute('aria-label', '公式，可横向滚动');
      const math = create('math', '', undefined, 'http://www.w3.org/1998/Math/MathML'); math.setAttribute('display', 'block');
      value = create('mtext', '', undefined, 'http://www.w3.org/1998/Math/MathML'); math.append(value); el.append(math);
    } else if (n.kind === 'control') {
      el = create('div', 'cui-scene-control');
      const label = create('label', '', n.label), spec = scene.state[n.state];
      value = create(n.control === 'select' ? 'select' : 'input'); value.id = `${prefix}-${n.id}`; label.htmlFor = value.id;
      if (n.control === 'select') for (const option of spec.options) { const o = create('option', '', option); o.value = option; value.append(o); }
      else value.type = n.control === 'toggle' ? 'checkbox' : n.control;
      if (spec.type === 'number') { value.min = String(spec.min); value.max = String(spec.max); value.step = String(spec.step ?? (n.control === 'range' ? (spec.max - spec.min) / 100 : 'any')); }
      const readout = create('output', 'cui-scene-readout'); readout.setAttribute('for', value.id); readout.setAttribute('aria-live', 'off');
      value.addEventListener(n.control === 'select' || n.control === 'toggle' ? 'change' : 'input', () => {
        const next = spec.type === 'boolean' ? value.checked : spec.type === 'number' ? value.value.trim() ? Number(value.value) : NaN : value.value;
        cancelDrag(); apply({ ...snapshot.state, [n.state]: next }, value);
      });
      el.append(label, value, readout); records.set(n.id, { el, value, readout, step: value.step });
    } else if (n.kind === 'button') {
      el = create('button', 'cui-button', n.label); el.type = 'button';
      el.addEventListener('click', () => {
        if (destroyed) return;
        cancelDrag();
        try {
          const next = n.action.type === 'reset' ? undefined : { ...snapshot.state, [n.action.state]: sceneEvaluate(n.action.value, id => snapshot.values[id]) };
          apply(next, el);
        } catch (error) { fail(error, el); }
      });
    } else if (n.kind === 'drawing') {
      el = create('figure', 'cui-scene-drawing'); svg = create('svg', '', undefined, ns); labels = [];
      svg.setAttribute('viewBox', `0 0 ${n.viewBox.width} ${n.viewBox.height}`); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-labelledby', `${prefix}-${n.id}-desc`);
      const description = create('desc', '', n.description, ns); description.id = `${prefix}-${n.id}-desc`; svg.append(description);
      const defs = create('defs', '', undefined, ns), annotations = create('g', 'cui-scene-annotations', undefined, ns);
      svg.append(defs); marks = new Map(); drags = [];
      const dragLayer = create('g', 'cui-scene-drag-layer', undefined, ns), alternatives = create('div', 'cui-scene-drag-alternatives');
      legend = create('ol', 'cui-scene-labels'); legend.setAttribute('aria-label', '图中标注'); legend.hidden = true;
      for (const m of n.marks) {
        const shape = create(m.kind === 'arrow' ? 'line' : m.kind, '', undefined, ns); shape.dataset.markId = m.id;
        if (m.kind === 'arrow') {
          const marker = create('marker', '', undefined, ns); marker.id = `${prefix}-${m.id}-arrow`;
          for (const [k, v] of Object.entries({ viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' })) marker.setAttribute(k, String(v));
          const tip = create('path', '', undefined, ns); tip.setAttribute('d', 'M 1 1 L 9 5 L 1 9 Z'); tip.setAttribute('fill', tone(m.tone)); marker.append(tip); defs.append(marker);
          shape.setAttribute('marker-end', `url(#${marker.id})`);
        }
        shape.setAttribute('stroke', m.kind === 'text' ? 'none' : tone(m.tone));
        shape.setAttribute('fill', m.kind === 'text' || m.fill === 'solid' ? tone(m.tone) : m.fill === 'soft' ? tone(m.tone) : 'none');
        if (m.fill === 'soft') shape.setAttribute('fill-opacity', '.12');
        if (m.kind !== 'text') shape.setAttribute('stroke-width', String(m.strokeWidth || 2));
        if (m.dashed) shape.setAttribute('stroke-dasharray', '6 5');
        if (m.kind === 'text') {
          shape.setAttribute('font-size', String(m.fontSize || 18)); shape.setAttribute('text-anchor', m.anchor || 'start');
          const leader = create('line', 'cui-scene-label-leader', undefined, ns), item = create('li');
          leader.setAttribute('stroke', tone(m.tone)); leader.setAttribute('aria-hidden', 'true'); leader.style.display = 'none';
          item.id = `${prefix}-${n.id}-${m.id}-label`; item.value = labels.length + 1; item.hidden = true; legend.append(item);
          annotations.append(leader, shape); labels.push({ shape, leader, item, base: m.fontSize || 18, anchor: m.anchor || 'start', text: '' });
        } else svg.append(shape);
        marks.set(m.id, shape);
        if (m.drag) {
          svg.setAttribute('role', 'group');
          const d = m.drag, spec = scene.state[d.state], handle = create('circle', 'cui-scene-drag-handle', undefined, ns);
          handle.dataset.dragState = d.state; handle.setAttribute('role', 'slider'); handle.setAttribute('tabindex', '0');
          handle.setAttribute('aria-label', d.label); handle.setAttribute('aria-orientation', d.axis === 'x' ? 'horizontal' : 'vertical');
          handle.setAttribute('aria-valuemin', String(spec.min)); handle.setAttribute('aria-valuemax', String(spec.max));
          const row = create('div', 'cui-scene-drag-controls'), label = create('label', '', d.label);
          const number = create('input'); number.type = 'number'; number.min = String(spec.min); number.max = String(spec.max); number.step = 'any';
          number.id = `${prefix}-${m.id}-number`; label.htmlFor = number.id; number.dataset.dragAlternative = d.state;
          const step = spec.step ?? (spec.max - spec.min) / 100;
          const change = delta => { cancelDrag(); apply({ ...snapshot.state, [d.state]: Math.max(spec.min, Math.min(spec.max, snapshot.state[d.state] + delta)) }, handle); };
          const less = create('button', 'cui-button', '减小'), more = create('button', 'cui-button', '增大'); less.type = more.type = 'button';
          less.setAttribute('aria-label', `${d.label}：减小`); more.setAttribute('aria-label', `${d.label}：增大`);
          less.addEventListener('click', () => change(-step)); more.addEventListener('click', () => change(step));
          number.addEventListener('input', () => { cancelDrag(); apply({ ...snapshot.state, [d.state]: number.value.trim() ? Number(number.value) : NaN }, number); });
          handle.addEventListener('keydown', event => {
            if (event.key === 'Escape') { cancelDrag(); return; }
            if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); cancelDrag();
            if (event.key === 'Home' || event.key === 'End') apply({ ...snapshot.state, [d.state]: event.key === 'Home' ? spec.min : spec.max }, handle);
            else change((['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1) * step);
          });
          const entry = { handle, number, markId: m.id, definition: d, spec, svg, width: n.viewBox.width, height: n.viewBox.height };
          handle.addEventListener('pointerdown', event => beginDrag(event, entry));
          handle.addEventListener('lostpointercapture', () => { if (dragSession?.entry === entry) cancelDrag(); });
          row.append(label, less, number, more); alternatives.append(row); dragLayer.append(handle); drags.push(entry);
        }
      }
      svg.append(annotations, dragLayer); el.append(svg, legend, create('figcaption', '', n.description), alternatives);
    }
    el.dataset.sceneNode = n.id;
    if (!records.has(n.id)) records.set(n.id, { el, value, marks, svg, labels, legend, drags, boxWidth: n.viewBox?.width, boxHeight: n.viewBox?.height });
    parent.append(el);
  }
  function render(n) {
    const r = records.get(n.id); r.el.hidden = !n.visible;
    if (n.kind === 'text') r.el.textContent = n.text;
    if (n.kind === 'formula') r.value.textContent = n.text;
    if (n.kind === 'control') {
      if (typeof n.value === 'number') r.value.step = r.step;
      if (n.control === 'toggle') r.value.checked = n.value;
      else if (r.value.value !== String(n.value)) r.value.value = String(n.value);
      // Native range sanitization rounds off-grid values. Preserve the exact
      // validated state; restore the authored step whenever it can represent it.
      if (typeof n.value === 'number' && (r.value.valueAsNumber !== n.value || r.value.validity.stepMismatch)) {
        r.value.step = 'any'; r.value.value = String(n.value);
      }
      r.readout.textContent = typeof n.value === 'number' ? String(Number(n.value.toFixed(6))) : typeof n.value === 'boolean' ? n.value ? '开启' : '关闭' : n.value;
      r.value.removeAttribute('aria-invalid'); r.value.removeAttribute('aria-describedby');
    }
    if (n.kind === 'drawing') for (const m of n.marks) {
      const mark = r.marks.get(m.id);
      for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'width', 'height']) if (typeof m[k] === 'number') mark.setAttribute(k, String(m[k]));
      if (m.kind === 'text') { mark.textContent = m.text; r.labels.find(label => label.shape === mark).text = m.text; }
      if (m.commands) mark.setAttribute('d', m.commands.map(c => c.op + ['x1', 'y1', 'x2', 'y2', 'x', 'y'].filter(k => Object.hasOwn(c, k)).map(k => c[k]).join(' ')).join(' '));
      if (m.drag) {
        const drag = r.drags.find(entry => entry.markId === m.id), current = snapshot.state[m.drag.state];
        for (const key of ['cx', 'cy']) drag.handle.setAttribute(key, String(m[key]));
        drag.handle.setAttribute('aria-valuenow', String(current)); drag.handle.setAttribute('aria-valuetext', `${current}${drag.spec.unit ? ' ' + drag.spec.unit : ''}`);
        drag.number.value = String(current); drag.number.removeAttribute('aria-invalid'); drag.number.removeAttribute('aria-describedby');
      }
    }
    if (n.children) n.children.forEach(render);
  }
  function fail(error, input) {
    if (destroyed) return;
    status.textContent = `输入未应用，图文保留上一次有效值。${error.message}`;
    if (input?.matches('input,select')) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', status.id); }
  }
  function apply(next, input, publish = true) {
    if (destroyed) return false;
    try {
      const projected = projectScene(scene, next); // Entire projection succeeds before any visible update.
      snapshot = projected; render(projected.root); layoutLabels(); status.textContent = next === undefined ? '已重置为初始值。' : '已更新当前探索值。';
      if (publish) publishState();
      if (doc.activeElement?.closest('[hidden]') && section.contains(doc.activeElement)) section.focus();
      return true;
    } catch (error) { fail(error, input); return false; }
  }
  function publishState() {
    try {
      const exported = sceneExploration(scene, snapshot.state, interactionRevision + 1), signature = JSON.stringify(exported.parameters);
      if (signature === publicSignature) return;
      publicSignature = signature; interactionRevision++; copyText.hidden = true;
      if (typeof host.publish !== 'function') { setSync({ status: 'unsupported' }); return; }
      const revision = interactionRevision;
      host.publish(exported, state => { if (!destroyed && interactionRevision === revision) setSync(state); }, { ...snapshot.state });
    } catch { setSync({ status: 'invalid' }); }
  }
  function pointerValue(event, entry) {
    const rect = entry.svg.getBoundingClientRect(), scale = Math.min(rect.width / entry.width, rect.height / entry.height);
    if (!(scale > 0) || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return NaN;
    const offset = entry.definition.axis === 'x' ? event.clientX - rect.left - (rect.width - entry.width * scale) / 2
      : event.clientY - rect.top - (rect.height - entry.height * scale) / 2;
    return offset / scale;
  }
  function beginDrag(event, entry) {
    if (destroyed || event.button !== 0 || event.isPrimary === false) return;
    cancelDrag(); const coordinate = pointerValue(event, entry); if (!Number.isFinite(coordinate)) return;
    event.preventDefault(); entry.handle.focus();
    dragSession = { entry, pointerId: event.pointerId, start: { ...snapshot.state }, valid: true,
      offset: coordinate - (entry.definition.origin + entry.definition.scale * snapshot.state[entry.definition.state]) };
    try { entry.handle.setPointerCapture(event.pointerId); } catch { /* Window listeners retain cancellation outside the SVG. */ }
    const win = doc.defaultView;
    win.addEventListener('pointermove', moveDrag); win.addEventListener('pointerup', endDrag); win.addEventListener('pointercancel', cancelPointer); win.addEventListener('keydown', escapeDrag);
    status.textContent = '拖动预览；松开应用，Escape 取消。';
  }
  function moveDrag(event) {
    if (!dragSession || event.pointerId !== dragSession.pointerId) return;
    const { entry, offset } = dragSession, d = entry.definition;
    const value = Math.max(entry.spec.min, Math.min(entry.spec.max, (pointerValue(event, entry) - offset - d.origin) / d.scale));
    dragSession.valid = apply({ ...snapshot.state, [d.state]: value }, entry.handle, false);
    if (dragSession.valid) status.textContent = '拖动预览；松开应用，Escape 取消。';
  }
  function releaseDrag() {
    const previous = dragSession; dragSession = null;
    const win = doc.defaultView;
    win.removeEventListener('pointermove', moveDrag); win.removeEventListener('pointerup', endDrag); win.removeEventListener('pointercancel', cancelPointer); win.removeEventListener('keydown', escapeDrag);
    try { previous?.entry.handle.releasePointerCapture(previous.pointerId); } catch { /* Capture may already have been released. */ }
    return previous;
  }
  function cancelDrag() {
    if (!dragSession) return;
    const previous = releaseDrag(); apply(previous.start, previous.entry.handle, false); status.textContent = '拖动已取消，保留原条件。';
  }
  function cancelPointer(event) { if (event.pointerId === dragSession?.pointerId) cancelDrag(); }
  function escapeDrag(event) { if (event.key === 'Escape') { event.preventDefault(); cancelDrag(); } }
  function endDrag(event) {
    if (!dragSession || event.pointerId !== dragSession.pointerId) return;
    moveDrag(event); const previous = releaseDrag();
    if (!previous.valid) { apply(previous.start, previous.entry.handle, false); status.textContent = '拖动未应用，保留原条件。'; }
    else { publishState(); status.textContent = '已应用当前探索条件。'; }
  }
  function layoutLabels() {
    if (destroyed) return;
    const boxOf = el => {
      try { const b = el.getBBox(); return [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width >= 0 && b.height >= 0 ? { x: b.x, y: b.y, width: b.width, height: b.height } : null; } catch { return null; }
    };
    for (const r of records.values()) if (r.svg && !r.el.closest('[hidden]')) {
      const screen = r.svg.getBoundingClientRect(), scale = screen.width / r.boxWidth;
      const unit = scale > 0 ? 1 / scale : 1, gap = 8 * unit;
      for (const drag of r.drags) drag.handle.setAttribute('r', String(22 * unit));
      // Write typography first, then measure the whole drawing, then place.
      for (const label of r.labels) {
        label.shape.textContent = label.text; label.shape.removeAttribute('transform');
        label.shape.setAttribute('text-anchor', label.anchor); label.shape.setAttribute('font-size', String(label.base * unit));
        label.shape.removeAttribute('aria-describedby'); label.shape.classList.remove('cui-scene-label-ref');
        label.item.hidden = true; label.leader.style.display = 'none';
      }
      const obstacles = [], measurements = r.labels.map(label => boxOf(label.shape)); let measurable = scale > 0;
      for (const shape of r.marks.values()) if (shape.tagName.toLowerCase() !== 'text') {
        const box = boxOf(shape); if (!box) { measurable = false; continue; }
        const stroke = Number(shape.getAttribute('stroke-width') || 2) / 2;
        obstacles.push({ x: box.x - stroke, y: box.y - stroke, width: box.width + stroke * 2, height: box.height + stroke * 2 });
      }
      for (const drag of r.drags) { const box = boxOf(drag.handle); if (box) obstacles.push(box); }
      let hasLegend = false;
      r.labels.forEach((label, index) => {
        const box = measurements[index];
        const placed = measurable && box && sceneLabelPlacement(box, obstacles, r.boxWidth, r.boxHeight, gap);
        if (placed) {
          const dx = placed.x - box.x, dy = placed.y - box.y;
          label.shape.setAttribute('transform', `translate(${dx} ${dy})`); label.shape.dataset.labelLayout = dx || dy ? 'moved' : 'authored';
          obstacles.push(placed);
          if (dx || dy) {
            const x = Number(label.shape.getAttribute('x')), y = Number(label.shape.getAttribute('y'));
            for (const [k, v] of Object.entries({ x1: x, y1: y, x2: Math.max(placed.x, Math.min(x, placed.x + placed.width)), y2: Math.max(placed.y, Math.min(y, placed.y + placed.height)) })) label.leader.setAttribute(k, String(v));
            label.leader.style.display = '';
          }
        } else {
          // Full content reflows in HTML; a small numbered reference retains
          // the authored point. No text is truncated or scaled below legibility.
          hasLegend = true; label.item.textContent = label.text; label.item.hidden = false;
          label.shape.textContent = String(index + 1); label.shape.classList.add('cui-scene-label-ref');
          label.shape.setAttribute('aria-describedby', label.item.id); label.shape.setAttribute('text-anchor', 'middle');
          const x = Number(label.shape.getAttribute('x')), y = Number(label.shape.getAttribute('y'));
          label.shape.setAttribute('transform', `translate(${Math.max(gap, Math.min(x, r.boxWidth - gap)) - x} ${Math.max(label.base * unit, Math.min(y, r.boxHeight - gap)) - y})`);
          label.shape.dataset.labelLayout = 'legend';
        }
      });
      r.legend.hidden = !hasLegend;
    }
  }
  build(snapshot.root, content); render(snapshot.root); root.append(section); layoutLabels();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(layoutLabels) : null;
  for (const r of records.values()) if (r.svg) observer?.observe(r.svg);
  doc.fonts?.addEventListener?.('loadingdone', layoutLabels);
  doc.fonts?.ready?.then(layoutLabels);
  return { destroy() { releaseDrag(); destroyed = true; observer?.disconnect(); doc.fonts?.removeEventListener?.('loadingdone', layoutLabels); section.remove(); } };
}
