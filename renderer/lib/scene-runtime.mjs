// Data-only generated views. Shared by server validation and the trusted browser.
const sceneCheck = (ok, message) => { if (!ok) throw new Error(`生成视图：${message}`); };
const sceneObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sceneId = v => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v) && !['constructor', 'prototype', '__proto__'].includes(v);
const sceneFinite = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12;
const sceneString = (v, max = 4000) => typeof v === 'string' && v.length <= max;
const sceneKeys = (v, keys) => sceneCheck(sceneObject(v) && Object.keys(v).every(k => keys.includes(k)), '包含未知字段。');
const sceneScalar = v => sceneFinite(v) || typeof v === 'boolean' || sceneString(v);
const sceneOps = Object.freeze({ add: [2, 8], sub: [2, 2], mul: [2, 8], div: [2, 2], pow: [2, 2], min: [2, 8], max: [2, 8], abs: [1, 1], sqrt: [1, 1], sin: [1, 1], cos: [1, 1], round: [1, 1], eq: [2, 2], lt: [2, 2], lte: [2, 2], gt: [2, 2], gte: [2, 2], and: [2, 8], or: [2, 8], not: [1, 1], if: [3, 3] });
function inspectScene(value, depth = 0, budget = { n: 0 }) {
  sceneCheck(++budget.n <= 16000 && depth <= 32, '结构超过预算。');
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) sceneCheck(!['__proto__', 'constructor', 'prototype'].includes(key), '禁止原型字段。');
    Object.values(value).forEach(v => inspectScene(v, depth + 1, budget));
  } else sceneCheck(value === null || sceneScalar(value), '只接受有限、类型化数据。');
}
function sceneStateValue(spec, value) {
  sceneCheck(typeof value === spec.type && sceneScalar(value), '状态类型无效。');
  if (spec.type === 'number') sceneCheck(value >= spec.min && value <= spec.max, '数值超出允许范围。');
  if (spec.type === 'string') sceneCheck(spec.options.includes(value), '选项不在允许列表中。');
  return value;
}
function sceneContract(scene) {
  inspectScene(scene);
  sceneKeys(scene, ['kind', 'id', 'title', 'description', 'givens', 'state', 'derived', 'root']);
  sceneCheck(scene.kind === 'scene' && sceneId(scene.id) && sceneString(scene.description, 2000) && scene.description.trim(), '需要稳定 id 和文字替代说明。');
  sceneCheck(scene.title === undefined || sceneString(scene.title, 200), '标题无效。');
  const types = new Map(), ids = new Set(), refs = new Map();
  for (const [name, max] of [['givens', 32], ['state', 16], ['derived', 32]]) {
    sceneCheck(sceneObject(scene[name]) && Object.keys(scene[name]).length <= max, `${name} 超过数量限制。`);
    for (const [id, spec] of Object.entries(scene[name])) {
      sceneCheck(sceneId(id) && !types.has(id), '数据标识必须唯一。');
      if (name === 'givens') { sceneCheck(sceneScalar(spec), '题设必须为标量。'); types.set(id, typeof spec); }
      else {
        sceneCheck(sceneObject(spec) && ['number', 'boolean', 'string'].includes(spec.type), '需要明确的数据类型。');
        if (name === 'state') {
          sceneKeys(spec, ['type', 'value', 'role', 'label', 'unit', ...(spec.type === 'number' ? ['min', 'max', 'step'] : spec.type === 'string' ? ['options'] : [])]);
          sceneCheck(spec.role === undefined || ['exploration', 'presentation'].includes(spec.role), '状态用途无效。');
          sceneCheck((spec.label === undefined || sceneString(spec.label, 160)) && (spec.unit === undefined || spec.type === 'number' && sceneString(spec.unit, 40)), '状态名称或单位无效。');
          if (spec.type === 'number') sceneCheck(sceneFinite(spec.min) && sceneFinite(spec.max) && spec.min < spec.max && (spec.step === undefined || sceneFinite(spec.step) && spec.step > 0 && spec.step <= spec.max - spec.min), '数值状态需要有效范围与步长。');
          if (spec.type === 'string') sceneCheck(Array.isArray(spec.options) && spec.options.length >= 2 && spec.options.length <= 16 && new Set(spec.options).size === spec.options.length && spec.options.every(v => sceneString(v, 160) && v.length), '选项状态无效。');
          sceneStateValue(spec, spec.value);
        } else sceneKeys(spec, ['type', 'expr']);
        types.set(id, spec.type);
      }
    }
  }
  let expressionNodes = 0, nodeCount = 0, markCount = 0;
  const expr = (value, expected, dependencies = new Set(), depth = 0) => {
    sceneCheck(++expressionNodes <= 4000 && depth <= 12, '表达式超过预算。');
    let type;
    if (sceneScalar(value)) type = typeof value;
    else {
      sceneCheck(sceneObject(value), '表达式应为标量、引用或运算树。');
      if (Object.hasOwn(value, 'ref')) {
        sceneKeys(value, ['ref']); sceneCheck(sceneId(value.ref) && types.has(value.ref), '引用不存在。'); dependencies.add(value.ref); type = types.get(value.ref);
      } else {
        sceneKeys(value, ['op', 'args']); const arity = sceneOps[value.op];
        sceneCheck(arity && Array.isArray(value.args) && value.args.length >= arity[0] && value.args.length <= arity[1], '运算或参数数量无效。');
        const ts = value.args.map(v => expr(v, undefined, dependencies, depth + 1));
        if (value.op === 'if') { sceneCheck(ts[0] === 'boolean' && ts[1] === ts[2], '条件及分支类型不一致。'); type = ts[1]; }
        else if (['and', 'or', 'not'].includes(value.op)) { sceneCheck(ts.every(t => t === 'boolean'), '逻辑运算需要布尔值。'); type = 'boolean'; }
        else if (value.op === 'eq') { sceneCheck(ts[0] === ts[1], '比较值类型不同。'); type = 'boolean'; }
        else { sceneCheck(ts.every(t => t === 'number'), '算术需要数值。'); type = ['lt', 'lte', 'gt', 'gte'].includes(value.op) ? 'boolean' : 'number'; }
      }
    }
    sceneCheck(expected === undefined || type === expected, '表达式类型不符。'); return type;
  };
  for (const [id, spec] of Object.entries(scene.derived)) { const dependencies = new Set(); expr(spec.expr, spec.type, dependencies); refs.set(id, dependencies); }
  const visited = new Set(), visiting = new Set();
  const visit = id => { if (visited.has(id) || !refs.has(id)) return; sceneCheck(!visiting.has(id), '派生值存在循环。'); visiting.add(id); refs.get(id).forEach(visit); visiting.delete(id); visited.add(id); };
  refs.forEach((_, id) => visit(id));
  const parts = values => {
    sceneCheck(Array.isArray(values) && values.length >= 1 && values.length <= 32, '文字片段应为 1–32 项。');
    values.forEach(v => {
      if (typeof v === 'string') sceneCheck(sceneString(v), '文字片段过长。');
      else { sceneKeys(v, ['ref', 'precision']); sceneCheck(types.has(v.ref) && (v.precision === undefined || types.get(v.ref) === 'number' && Number.isInteger(v.precision) && v.precision >= 0 && v.precision <= 6), '显示绑定无效。'); }
    });
  };
  const unique = id => { sceneCheck(sceneId(id) && !ids.has(id), '视图节点 id 必须唯一。'); ids.add(id); };
  const markFields = { line: ['x1', 'y1', 'x2', 'y2'], arrow: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'width', 'height'], circle: ['cx', 'cy', 'r'], text: ['x', 'y'], path: [] };
  const node = (n, depth = 0) => {
    sceneCheck(++nodeCount <= 128 && depth <= 8 && sceneObject(n), '布局节点超过预算。'); unique(n.id);
    const common = ['kind', 'id', 'when']; if (n.when !== undefined) expr(n.when, 'boolean');
    switch (n.kind) {
      case 'layout':
        sceneKeys(n, [...common, 'direction', 'columns', 'gap', 'align', 'children']);
        sceneCheck(['row', 'column', 'grid'].includes(n.direction) && (n.columns === undefined || n.direction === 'grid' && Number.isInteger(n.columns) && n.columns >= 1 && n.columns <= 4), '布局无效。');
        sceneCheck(n.gap === undefined || ['small', 'medium', 'large'].includes(n.gap), '间距无效。');
        sceneCheck(n.align === undefined || ['start', 'center', 'stretch'].includes(n.align), '对齐无效。');
        sceneCheck(Array.isArray(n.children) && n.children.length >= 1 && n.children.length <= 32, '布局需要有界子节点。'); n.children.forEach(v => node(v, depth + 1)); break;
      case 'text': case 'formula':
        sceneKeys(n, [...common, 'parts', 'style']); parts(n.parts);
        sceneCheck(n.style === undefined || ['body', 'heading', 'caption', 'metric'].includes(n.style), '文字样式无效。'); break;
      case 'control': {
        sceneKeys(n, [...common, 'control', 'state', 'label']);
        sceneCheck(sceneString(n.label, 160) && n.label.trim() && Object.hasOwn(scene.state, n.state), '控件需要标签及可变状态。');
        const type = scene.state[n.state].type;
        sceneCheck(type === 'number' ? ['range', 'number'].includes(n.control) : type === 'boolean' ? n.control === 'toggle' : n.control === 'select', '控件与状态类型不符。'); break;
      }
      case 'button':
        sceneKeys(n, [...common, 'label', 'action']); sceneCheck(sceneString(n.label, 160) && n.label.trim(), '按钮需要标签。');
        sceneCheck(sceneObject(n.action), '按钮动作无效。');
        if (n.action.type === 'reset') sceneKeys(n.action, ['type']);
        else { sceneKeys(n.action, ['type', 'state', 'value']); sceneCheck(n.action.type === 'set' && Object.hasOwn(scene.state, n.action.state), '只允许设置当前视图状态。'); expr(n.action.value, scene.state[n.action.state].type); } break;
      case 'drawing':
        sceneKeys(n, [...common, 'description', 'viewBox', 'marks']); sceneCheck(sceneString(n.description, 2000) && n.description.trim(), '图形需要文字替代。');
        sceneKeys(n.viewBox, ['width', 'height']); sceneCheck([n.viewBox.width, n.viewBox.height].every(v => sceneFinite(v) && v >= 120 && v <= 1280) && n.viewBox.width / n.viewBox.height >= .25 && n.viewBox.width / n.viewBox.height <= 3, '画布比例或尺寸无效。');
        sceneCheck(Array.isArray(n.marks) && n.marks.length >= 1 && (markCount += n.marks.length) <= 192, '图元超过预算。');
        n.marks.forEach(m => {
          sceneCheck(sceneObject(m) && Object.hasOwn(markFields, m.kind), '图元类型无效。'); unique(m.id);
          const attrs = markFields[m.kind];
          sceneKeys(m, ['kind', 'id', 'tone', 'fill', 'strokeWidth', 'dashed', ...attrs, ...(m.kind === 'circle' ? ['drag'] : []), ...(m.kind === 'text' ? ['parts', 'anchor', 'fontSize'] : m.kind === 'path' ? ['commands'] : [])]);
          if (m.drag !== undefined) {
            const d = m.drag; sceneKeys(d, ['state', 'axis', 'origin', 'scale', 'label']);
            sceneCheck(Object.hasOwn(scene.state, d.state) && scene.state[d.state].type === 'number' && ['x', 'y'].includes(d.axis)
              && sceneFinite(d.origin) && sceneFinite(d.scale) && d.scale !== 0 && Math.abs(d.origin) <= 4096 && Math.abs(d.scale) <= 4096
              && sceneString(d.label, 160) && d.label.trim(), '拖动声明需要数值状态、轴、非零比例和标签。');
            const spec = scene.state[d.state], extent = n.viewBox[d.axis === 'x' ? 'width' : 'height'];
            sceneCheck([spec.min, spec.max].every(v => d.origin + d.scale * v >= 0 && d.origin + d.scale * v <= extent), '拖动状态范围必须位于画布内。');
          }
          sceneCheck(m.tone === undefined || ['blue', 'green', 'orange', 'neutral'].includes(m.tone), '图元颜色无效。');
          sceneCheck(m.fill === undefined || ['none', 'soft', 'solid'].includes(m.fill), '填充无效。');
          sceneCheck(m.strokeWidth === undefined || sceneFinite(m.strokeWidth) && m.strokeWidth >= 1 && m.strokeWidth <= 6, '线宽无效。');
          sceneCheck(m.dashed === undefined || typeof m.dashed === 'boolean', '虚线无效。'); attrs.forEach(k => expr(m[k], 'number'));
          if (m.kind === 'text') { parts(m.parts); sceneCheck(m.anchor === undefined || ['start', 'middle', 'end'].includes(m.anchor), '文字对齐无效。'); sceneCheck(m.fontSize === undefined || Number.isInteger(m.fontSize) && m.fontSize >= 14 && m.fontSize <= 36, '字号无效。'); }
          if (m.kind === 'path') {
            sceneCheck(Array.isArray(m.commands) && m.commands.length >= 2 && m.commands.length <= 40 && m.commands[0]?.op === 'M', '路径需要 M 起点和 2–40 条命令。');
            m.commands.forEach(c => { const fields = { M: ['x', 'y'], L: ['x', 'y'], Q: ['x1', 'y1', 'x', 'y'], C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'], Z: [] }[c.op]; sceneCheck(fields, '路径命令无效。'); sceneKeys(c, ['op', ...fields]); fields.forEach(k => expr(c[k], 'number')); });
          }
        }); break;
      default: sceneCheck(false, '未知视图节点。');
    }
  };
  node(scene.root); return { types, markFields };
}
export function sceneEvaluate(expression, lookup, budget = { n: 0 }) {
  sceneCheck(++budget.n <= 20000, '计算超过预算。');
  if (sceneScalar(expression)) return expression;
  if (Object.hasOwn(expression, 'ref')) return lookup(expression.ref);
  const { op, args } = expression;
  const run = e => sceneEvaluate(e, lookup, budget);
  if (op === 'if') return run(args[0]) ? run(args[1]) : run(args[2]);
  if (op === 'and') return args.every(run);
  if (op === 'or') return args.some(run);
  const a = args.map(run); let value;
  switch (op) {
    case 'add': value = a.reduce((x, y) => x + y); break;
    case 'sub': value = a[0] - a[1]; break;
    case 'mul': value = a.reduce((x, y) => x * y); break;
    case 'div': sceneCheck(a[1] !== 0, '除数不能为零。'); value = a[0] / a[1]; break;
    case 'pow': sceneCheck(Math.abs(a[1]) <= 16, '指数超出预算。'); value = a[0] ** a[1]; break;
    case 'min': value = Math.min(...a); break; case 'max': value = Math.max(...a); break;
    case 'abs': value = Math.abs(a[0]); break; case 'sqrt': value = Math.sqrt(a[0]); break;
    case 'sin': value = Math.sin(a[0]); break; case 'cos': value = Math.cos(a[0]); break; case 'round': value = Math.round(a[0]); break;
    case 'eq': value = a[0] === a[1]; break; case 'lt': value = a[0] < a[1]; break; case 'lte': value = a[0] <= a[1]; break; case 'gt': value = a[0] > a[1]; break; case 'gte': value = a[0] >= a[1]; break; case 'not': value = !a[0]; break;
    default: sceneCheck(false, '不支持的运算。');
  }
  sceneCheck(sceneScalar(value), '计算结果不是有界有限值。'); return value;
}
export function projectScene(scene, candidate) {
  const { markFields } = sceneContract(scene);
  const state = {};
  if (candidate !== undefined) sceneCheck(sceneObject(candidate) && Object.keys(candidate).length === Object.keys(scene.state).length && Object.keys(candidate).every(id => Object.hasOwn(scene.state, id)), '状态快照字段不匹配。');
  for (const [id, spec] of Object.entries(scene.state)) state[id] = sceneStateValue(spec, candidate === undefined ? spec.value : candidate[id]);
  const values = { ...scene.givens, ...state }, budget = { n: 0 };
  const lookup = id => {
    if (!Object.hasOwn(values, id)) values[id] = sceneEvaluate(scene.derived[id].expr, lookup, budget);
    sceneCheck(sceneScalar(values[id]) && (scene.derived[id] === undefined || typeof values[id] === scene.derived[id].type), '派生值类型或范围无效。'); return values[id];
  };
  Object.keys(scene.derived).forEach(lookup);
  const evaluate = e => sceneEvaluate(e, lookup, budget);
  // Presentation only: one precision per bound quantity; drawings use their
  // highest requested precision so adjacent numeric/unit labels agree.
  const displayPrecision = new Map();
  const requestPrecision = (ps, minimum = 0) => {
    for (const p of ps || []) if (typeof p !== 'string' && typeof values[p.ref] === 'number') {
      displayPrecision.set(p.ref, Math.max(displayPrecision.get(p.ref) ?? 0, p.precision ?? 3, minimum));
    }
  };
  const collectPrecision = n => {
    requestPrecision(n.parts);
    if (n.kind === 'drawing') {
      const numeric = n.marks.flatMap(m => m.parts || []).filter(p => typeof p !== 'string' && typeof values[p.ref] === 'number');
      const common = Math.max(0, ...numeric.map(p => p.precision ?? 3));
      n.marks.forEach(m => requestPrecision(m.parts, common));
    }
    n.children?.forEach(collectPrecision);
  };
  collectPrecision(scene.root);
  let expandedText = 0;
  const parts = ps => ps.map(p => {
    const text = typeof p === 'string' ? p : typeof values[p.ref] === 'number' ? String(Number(values[p.ref].toFixed(displayPrecision.get(p.ref) ?? 3))) : String(values[p.ref]);
    sceneCheck((expandedText += text.length) <= 60000, '绑定文字展开超过预算。'); return text;
  }).join('');
  const coordinate = e => { const v = evaluate(e); sceneCheck(typeof v === 'number' && Math.abs(v) <= 4096, '图元坐标超出范围。'); return v; };
  const node = n => {
    const next = { ...n, visible: n.when === undefined || evaluate(n.when) };
    if (n.kind === 'layout') next.children = n.children.map(node);
    if (n.parts) next.text = parts(n.parts);
    if (n.kind === 'control') next.value = state[n.state];
    if (n.kind === 'drawing') next.marks = n.marks.map(m => {
      const mark = { ...m }; markFields[m.kind].forEach(k => { mark[k] = coordinate(m[k]); });
      if (m.drag) {
        const expected = m.drag.origin + m.drag.scale * state[m.drag.state], actual = mark[m.drag.axis === 'x' ? 'cx' : 'cy'];
        sceneCheck(Math.abs(actual - expected) <= 32 * Number.EPSILON * Math.max(1, Math.abs(expected)), '拖动坐标必须绑定声明的同一状态及线性映射。');
      }
      if (m.parts) mark.text = parts(m.parts);
      if (m.kind === 'rect') sceneCheck(mark.width >= 0 && mark.height >= 0, '矩形尺寸不能为负。');
      if (m.kind === 'circle') sceneCheck(mark.r >= 0, '圆半径不能为负。');
      if (m.commands) mark.commands = m.commands.map(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'op' ? v : coordinate(v)])));
      return mark;
    });
    return next;
  };
  const root = node(scene.root);
  sceneCheck(JSON.stringify(root).length <= 220000, '展开视图超过预算。');
  return { root, values, state };
}
export function validateScene(scene) { projectScene(scene); return scene; }
export function sceneExploration(scene, candidate, interactionRevision) {
  const projected = projectScene(scene, candidate);
  sceneCheck(Number.isSafeInteger(interactionRevision) && interactionRevision >= 0, '交互修订无效。');
  const parameters = Object.fromEntries(Object.entries(scene.state).filter(([, spec]) => spec.role !== 'presentation').map(([id, spec]) =>
    [id, { type: spec.type, value: projected.state[id], initialValue: spec.value, ...(spec.label ? { label: spec.label } : {}), ...(spec.unit ? { unit: spec.unit } : {}) }]));
  const result = { type: 'scene-exploration', blockId: scene.id, interactionRevision, givens: { ...scene.givens }, parameters };
  sceneCheck(JSON.stringify(result).length <= 12000, '探索上下文超过预算；可复制参数继续提问。');
  return result;
}
export function sceneText(scene) {
  const p = projectScene(scene);
  const lines = [scene.description, ...Object.entries(scene.givens).map(([k, v]) => `${k} = ${v}`)];
  const visit = n => {
    if (!n.visible) return;
    if (n.text) lines.push(n.text);
    if (n.kind === 'drawing') lines.push(n.description, ...n.marks.filter(m => m.kind === 'text').map(m => m.text));
    if (n.kind === 'control') lines.push(`${n.label}：${n.value}`);
    if (n.children) n.children.forEach(visit);
  };
  visit(p.root);
  if (Object.keys(scene.state).length) lines.push('以上为初始视图快照；控件只改变当前视图内的探索值，重挂载恢复初始值。');
  return lines.join('\n');
}
