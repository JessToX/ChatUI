import { validateInputForm } from './input-form-policy.mjs';
export const TYPES = ['progress', 'timeline', 'profile', 'comparison', 'steps', 'rhythm', 'quiz', 'geometry', 'answer', 'line-chart', 'force-diagram', 'motion-lab', 'media-panel', 'tabs', 'reveal-steps', 'data-table', 'input-form'];
// One authoring description shared by standalone and composed component tools.
export const COMPONENT_DATA_DESCRIPTION = [
  'Type-specific JSON only. progress:{total,unit?,stages:[{id,label,value,subsetOf?}],note?,details?} for all known stages with the same denominator/unit; 1–12 stages, unique id<=80 chars, label<=160 chars, finite 0<=value<=total and total>0. subsetOf points to a listed parent; no self-reference/cycles, child value<=parent value. Never sum overlapping stages or infer item identities from counts. Legacy progress:{value,total,label?,unit?,note?,details?}; value and stages are mutually exclusive.',
  'force-diagram:{body,unit:"N",forces:[{id,label,fx,fy,tone?}],axisAngle?,note?}; unknown magnitudes use {mode:"direction",body,forces:[{id,label,angle,tone?}],note?}, without unit. Real forces only, not resultants/components. Known stationary smooth inclines with gravity/contact only use render_incline_forces.',
  'motion-lab:{initialVelocity,acceleration,duration,time?,unit?:"SI"}; initialVelocity in m/s, acceleration in m/s², duration/time in seconds. geometry:{radius,heightRatio?}; positive finite radius, heightRatio between 0.05 and 1.95.',
  'quiz:{questions:[{id,prompt,options:[{id,label}],correct,explanation}],followUp?}; do not reveal correct answers in adjacent prose before submission.',
  'timeline/steps:{items:[{title,detail,date?,status?,math?,mathLabel?}]}. reveal-steps:{items:[{title,detail,math?,mathLabel?}],initialVisible?}; reveal-steps math must be a MathML object, not a string.',
  'comparison:{items:[{label,title?,detail?,math?,mathLabel?}]}. rhythm:{items:[{label,emphasis:"brief"|"moderate"|"focus"}],note?}; qualitative attention, not measured percentages. profile:{eyebrow?,name,subtitle?,tags?,summary?}. answer:{label?,title,detail?,math?,mathLabel?}.',
  'line-chart:{xLabel,yLabel,seriesLabel,points:[{x,y}],xUnit?,yUnit?,note?}; 2–80 finite points, strictly increasing x. tabs:{items:[{id,label,title?,body,points?}],note?}. data-table:{columns:[{key,label,type:"text"|"number"}],rows:[{id,values:{columnKey:value}}]}.',
  'input-form:{fields:[{id,type:text|textarea|number|select|radio|checkbox,label,value?,required?,hint?,min?,max?,maxLength?,options?:[{value,label}]}],submitLabel?,resetLabel?,note?}; 1–8 fields, text limits <=500 chars, number bounds within +/-1e12, 2–12 choices, total input capacity <=1000 chars. Submit creates a local typed snapshot, no server mutation. Drafts stay in private widget state; values enter model context only on explicit submit. No passwords, files, actions, URLs or executable validation.',
  'media-panel:{items:[{title,body,alt,sourceLabel,sourceUrl}]}; HTTPS sources only, no imageUrl or third-party image requests. math uses safe MathML JSON {tag,text?,children?}, never HTML. tone is blue/green/orange/neutral. In compositions use {fact:"id"} for raw numeric data, {{id}} or {{id|text}} in text. Never invent measurements.'
].join(' ');
const fail = message => { throw new Error(message); };
const check = (condition, message) => condition || fail(message);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const short = (value, max = 6000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const optionalText = (value, max, empty = false) => value === undefined || typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
const textList = (value, max = 200, length = 6000) => value === undefined || Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= length);
const items = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(object);
const unique = values => new Set(values).size === values.length;
const tones = ['blue', 'green', 'orange', 'neutral'];
export const MATH_TAGS = ['mrow', 'mi', 'mn', 'mo', 'mtext', 'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mstyle', 'mspace', 'mpadded', 'mtable', 'mtr', 'mtd', 'menclose'];
const mathTags = new Set(MATH_TAGS);
// A closed MathML attribute vocabulary, shared by server and generated resources.
export const MATH_ATTRIBUTES = {
  mathvariant: /^(normal|bold|italic|bold-italic|double-struck|script|bold-script|fraktur|bold-fraktur|sans-serif|bold-sans-serif|sans-serif-italic|sans-serif-bold-italic|monospace)$/,
  displaystyle: /^(true|false)$/, scriptlevel: /^[0-2]$/,
  stretchy: /^(true|false)$/, fence: /^(true|false)$/, separator: /^(true|false)$/,
  largeop: /^(true|false)$/, movablelimits: /^(true|false)$/, symmetric: /^(true|false)$/,
  accent: /^(true|false)$/, accentunder: /^(true|false)$/,
  columnalign: /^(left|center|right)( (left|center|right)){0,11}$/,
  rowalign: /^(top|center|bottom|baseline|axis)( (top|center|bottom|baseline|axis)){0,11}$/,
  notation: /^(updiagonalstrike|downdiagonalstrike|horizontalstrike|verticalstrike|box|circle|top|bottom|left|right)( (updiagonalstrike|downdiagonalstrike|horizontalstrike|verticalstrike|box|circle|top|bottom|left|right)){0,3}$/
};
const mathLengths = new Set(['width', 'height', 'depth', 'voffset', 'lspace', 'rspace', 'minsize', 'maxsize', 'mathsize', 'linethickness', 'rowspacing', 'columnspacing']);
export function validateMathAttributes(attrs) {
  check(object(attrs) && Object.keys(attrs).length <= 12, '公式属性过多。');
  for (const [key, value] of Object.entries(attrs)) {
    check(typeof value === 'string' && value.length <= 160, '公式属性必须是有界文本。');
    if (Object.hasOwn(MATH_ATTRIBUTES, key)) check(MATH_ATTRIBUTES[key].test(value), '公式属性值不受支持。');
    else {
      check(mathLengths.has(key), '公式不能含 HTML、样式、链接或事件属性。');
      const lengths = value.split(' ');
      check(lengths.length <= 12 && lengths.every(part => {
        const match = part.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(em|ex|px|%)?$/);
        return match && Math.abs(Number(match[1])) <= (match[2] === '%' ? 400 : match[2] === 'px' ? 64 : 4);
      }), '公式尺寸超出安全范围。');
    }
  }
}
export function inspect(value, depth = 0, budget = { nodes: 0 }) {
  check(depth <= 20 && ++budget.nodes <= 20000, '组件数据过大或嵌套过深。');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { check(value.length <= 12000, '单段文字过长。'); return; }
  if (typeof value === 'number') { check(finite(value), '数值必须有限。'); return; }
  check(object(value) || Array.isArray(value), '只接受 JSON 数据。');
  if (Array.isArray(value)) check(value.length <= 200, '数组条目过多。');
  for (const [key, child] of Object.entries(value)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(key), '数据含不支持的属性。');
    check(key.length <= 100, '属性名称过长。');
    inspect(child, depth + 1, budget);
  }
}
export function validateMath(value, depth = 0) {
  check(depth < 16, '公式结构过深。');
  if (typeof value === 'string') return;
  check(object(value) && mathTags.has(value.tag), '只接受受支持的 MathML 数据。');
  check(Object.keys(value).every(key => ['tag', 'text', 'children', 'attrs'].includes(key)), '公式不能含 HTML 或属性。');
  if (value.attrs !== undefined) validateMathAttributes(value.attrs);
  if (value.text !== undefined) check(typeof value.text === 'string', '公式文字必须为文本。');
  if (value.children !== undefined) {
    check(Array.isArray(value.children), '公式 children 必须为数组。');
    value.children.forEach(child => validateMath(child, depth + 1));
  }
}
function inspectMath(value) {
  if (!object(value) && !Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'math' && child !== null) validateMath(child);
    else inspectMath(child);
  }
}
export function validateComponent(config) {
  inspect(config);
  check(object(config) && config.schemaVersion === 1 && TYPES.includes(config.type), '需要 schemaVersion: 1 和受支持的组件类型。');
  check(Object.keys(config).every(key => ['schemaVersion', 'contentId', 'type', 'title', 'data'].includes(key)), '组件含不支持的顶层属性。');
  check(short(config.contentId, 200) && (config.title === undefined || short(config.title, 200)) && object(config.data), '组件需要有效标识、标题和 data 对象。');
  inspectMath(config.data);
  const d = config.data;
  switch (config.type) {
    case 'input-form': validateInputForm(d); break;
    case 'progress': {
      check(finite(d.total) && d.total > 0, '进度总量必须为大于零的有限数值。');
      if (Object.hasOwn(d, 'stages')) {
        check(!Object.hasOwn(d, 'value'), '多阶段 stages 与单条 value 不能同时提供。');
        check(items(d.stages, 1, 12), '多阶段进度需要一至十二个阶段。');
        for (const stage of d.stages) {
          check(Object.keys(stage).every(key => ['id', 'label', 'value', 'subsetOf'].includes(key)), '阶段只接受 id、label、value 和可选 subsetOf。');
          check(short(stage.id, 80) && short(stage.label, 160), '阶段需要有效 id（至多80字符）和 label（至多160字符）。');
          check(finite(stage.value) && stage.value >= 0 && stage.value <= d.total, '每个阶段必须满足 0 ≤ 数量 ≤ 共同总量。');
          check(stage.subsetOf === undefined || short(stage.subsetOf, 80), 'subsetOf 必须是有效阶段标识。');
        }
        const byId = new Map(d.stages.map(stage => [stage.id, stage]));
        check(byId.size === d.stages.length, '阶段 id 不能重复。');
        for (const stage of d.stages) {
          const seen = new Set([stage.id]); let current = stage;
          while (current.subsetOf !== undefined) {
            const parent = byId.get(current.subsetOf);
            check(parent, 'subsetOf 必须指向已提供的阶段。');
            check(!seen.has(parent.id), '阶段包含关系不能指向自身或形成循环。');
            check(current.value <= parent.value, '子阶段数量不能超过其包含于的父阶段数量。');
            seen.add(parent.id); current = parent;
          }
        }
      } else check(finite(d.value) && d.value >= 0 && d.value <= d.total, '进度必须满足 0 ≤ value ≤ total。');
      check(textList(d.details), '进度细节必须为文本数组。'); break;
    }
    case 'timeline': case 'steps': case 'reveal-steps':
      check(items(d.items, 1, config.type === 'reveal-steps' ? 12 : 100) && d.items.every(x => short(x.title, 160) && (short(x.detail) || config.type !== 'reveal-steps' && x.math !== undefined)), '步骤需要有效 title，以及 detail 或公式。');
      if (config.type === 'reveal-steps') check(d.items.every(x => optionalText(x.mathLabel, 1000) && (x.math === undefined || object(x.math))), '逐步讲解的公式必须为 MathML 对象，朗读说明应为不超过1000字符的有效文本。');
      if (d.initialVisible !== undefined) check(Number.isInteger(d.initialVisible) && d.initialVisible >= 1 && d.initialVisible <= d.items.length, 'initialVisible 超出步骤范围。'); break;
    case 'profile':
      check(short(d.name || config.title, 200), '档案需要名称。');
      check(textList(d.tags), '档案标签必须为文本数组。'); break;
    case 'comparison': check(items(d.items, 1, 4) && d.items.every(x => short(x.label, 120)), '对照需要一至四项标签。'); break;
    case 'rhythm': check(items(d.items, 1, 100) && d.items.every(x => short(x.label, 200) && ['brief', 'moderate', 'focus'].includes(x.emphasis)), '节奏需要真实项目和定性等级。'); break;
    case 'answer': check(short(d.title, 1000), '结果需要标题。'); break;
    case 'line-chart':
      check(items(d.points, 2, 80) && d.points.every((p, i) => finite(p.x) && finite(p.y) && Math.abs(p.x) <= 1e12 && Math.abs(p.y) <= 1e12 && (i === 0 || p.x > d.points[i - 1].x)), '折线需要二至八十个有限坐标，x 严格递增。');
      check(['xLabel', 'yLabel', 'seriesLabel'].every(key => short(d[key], 80)), '图表需要轴与数据系列名称。');
      check(['xUnit', 'yUnit'].every(key => optionalText(d[key], 24, true)), '图表单位应为不超过24字符的文本。'); break;
    case 'force-diagram': {
      const mode = d.mode === undefined ? 'numeric' : d.mode; const numeric = mode === 'numeric';
      check(['numeric', 'direction'].includes(mode) && short(d.body, 120), '受力图需要 body 和正确模式。');
      check(optionalText(d.note, 1000, true), '受力说明应为不超过1000字符的文本。');
      check(numeric ? d.unit === 'N' : d.unit === undefined, '数值力统一用 N；未知大小的方向图不含数值单位。');
      check(d.axisAngle === undefined || finite(d.axisAngle) && Math.abs(d.axisAngle) <= 360, 'axisAngle 超出范围。');
      check(items(d.forces, 1, 12) && unique(d.forces.map(f => f.id)), '需要一至十二个标识唯一的真实力。');
      const keys = numeric ? ['id', 'label', 'fx', 'fy', 'tone'] : ['id', 'label', 'angle', 'tone'];
      for (const f of d.forces) {
        check(Object.keys(f).every(key => keys.includes(key)) && short(f.id, 80) && short(f.label, 120) && (f.tone === undefined || tones.includes(f.tone)), '作用力属性无效；不要把合力或分力加入真实力列表。');
        check(numeric ? finite(f.fx) && finite(f.fy) && Math.abs(f.fx) <= 1e12 && Math.abs(f.fy) <= 1e12 : finite(f.angle) && Math.abs(f.angle) <= 360, '力的数值或方向无效，不能用未知值代替零。');
      }
      break;
    }
    case 'motion-lab':
      check(finite(d.initialVelocity) && Math.abs(d.initialVelocity) <= 100 && finite(d.acceleration) && Math.abs(d.acceleration) <= 50 && finite(d.duration) && d.duration >= .1 && d.duration <= 60, '运动参数超出实验范围。');
      check(d.time === undefined || finite(d.time) && d.time >= 0 && d.time <= d.duration, '观察时间超出范围。');
      check(d.unit === undefined || d.unit === 'SI', '运动实验统一用 SI 单位。'); break;
    case 'geometry': {
      // Match the standalone kit: the minimum area on the continuous slider
      // interval is at q=.05. Normal binary64 output preserves relative precision.
      const minimumRatio = .05;
      const minimumArea = finite(d.radius) ? (minimumRatio * d.radius) * (d.radius * Math.sqrt(2 * minimumRatio - minimumRatio * minimumRatio)) : NaN;
      check(finite(d.radius) && d.radius > 0 && finite(2 * d.radius * d.radius) && d.radius * d.radius > 0 && minimumArea >= 2 ** -1022, '圆半径必须为可计算的正数。');
      check(d.heightRatio === undefined || finite(d.heightRatio) && d.heightRatio >= .05 && d.heightRatio <= 1.95, '高度比例必须在 0.05 与 1.95 之间；不会自动改写题目参数。'); break;
    }
    case 'quiz':
      check(items(d.questions, 1, 12) && unique(d.questions.map(q => q.id)), '测验需要一至十二道标识唯一的题。');
      for (const q of d.questions) check(short(q.id, 79) && short(q.prompt) && items(q.options, 2, 8) && unique(q.options.map(o => o.id)) && q.options.every(o => short(o.id, 80) && short(o.label, 1000)) && q.options.some(o => o.id === q.correct), '测验题目、选项或正确答案无效。'); break;
    case 'tabs':
      check(items(d.items, 2, 6) && unique(d.items.map(x => x.id)) && d.items.every(x => short(x.id, 80) && short(x.label, 60) && short(x.body)), '视角切换需要二至六项有效内容。');
      check(optionalText(d.note, 1000, true), '视角说明应为不超过1000字符的文本。');
      check(d.items.every(x => optionalText(x.title, 160) && (x.points === undefined || Array.isArray(x.points) && x.points.length <= 12 && x.points.every(point => short(point, 1000)))), '视角标题或要点无效；每项最多十二条有效文本。'); break;
    case 'data-table':
      check(items(d.columns, 2, 8) && unique(d.columns.map(c => c.key)) && d.columns.every(c => short(c.key, 64) && short(c.label, 80) && ['text', 'number'].includes(c.type)), '表格列定义无效。');
      check(items(d.rows, 1, 100) && unique(d.rows.map(r => r.id)) && d.rows.every(r => short(r.id, 64) && object(r.values) && d.columns.every(c => Object.hasOwn(r.values, c.key) && (c.type === 'number' ? finite(r.values[c.key]) : typeof r.values[c.key] === 'string' && r.values[c.key].length <= 500))), '表格行必须提供每列真实数值或文本。');
      check(optionalText(d.filterLabel, 80), '表格筛选名称应为不超过80字符的有效文本。'); break;
    case 'media-panel':
      check(items(d.items, 1, 6), '来源卡片需要一至六项。');
      for (const item of d.items) {
        check(short(item.title, 120) && short(item.body, 1800) && short(item.alt, 400) && short(item.sourceLabel, 200), '来源卡片需要标题、解释、替代文字和来源名称。');
        check(typeof item.sourceUrl === 'string' && item.sourceUrl.length <= 2048, '来源地址应为不超过2048字符的 HTTPS 文本地址。');
        let url; try { url = new URL(item.sourceUrl); } catch { fail('来源需要 HTTPS 地址。'); }
        check(url.protocol === 'https:' && !url.username && !url.password && !/[\u0000-\u0020\u007f]/.test(item.sourceUrl), '来源地址无效。');
        check(item.imageUrl === undefined, '此私有渲染器不自动请求第三方图片；保留来源和文字说明。');
        check(optionalText(item.caption, 500) && optionalText(item.credit, 300), '图注和归属应分别为不超过500与300字符的有效文本。');
      }
  }
  return config;
}
