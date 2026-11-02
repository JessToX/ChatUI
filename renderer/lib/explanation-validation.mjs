import { inspect, validateMath, validateComponent, TYPES, COMPONENT_DATA_DESCRIPTION } from './component-validation.mjs';

export const EXPLANATION_MAX_BYTES = 256 * 1024;
const echeck = (condition, message) => { if (!condition) throw new Error(message); };
const eobject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const etext = (value, max = 6000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const efinite = value => typeof value === 'number' && Number.isFinite(value);
const eid = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value);
const ekeys = (value, keys) => echeck(eobject(value) && Object.keys(value).every(key => keys.includes(key)), '讲解含不支持的属性。');
const etones = ['blue', 'green', 'orange', 'neutral'];
const eformats = ['value', 'text', 'quantity', 'unit', 'label'];
const optionalString = (value, max = 6000) => value === undefined || etext(value, max);
const diagramLimits = { minSize: 120, maxSize: 1280, minRatio: .25, maxRatio: 3 };
const diagramSizeRule = `Both dimensions must be ${diagramLimits.minSize}–${diagramLimits.maxSize}; height/width must be ${diagramLimits.minRatio}–${diagramLimits.maxRatio}.`;

export function formatFact(fact, format = 'quantity') {
  if (format === 'value') return fact.value;
  if (format === 'unit') return fact.unit || '';
  if (format === 'label') return fact.label || String(fact.value);
  let value = typeof fact.value === 'number' ? new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: fact.precision ?? 6,
    ...(fact.precision !== undefined ? { minimumFractionDigits: fact.precision } : {}),
    useGrouping: false
  }).format(fact.value) : fact.value;
  // A nonzero given must never silently become zero because of display precision.
  if (typeof fact.value === 'number' && fact.value !== 0 && Number(value) === 0) {
    value = new Intl.NumberFormat('zh-CN', { notation: 'scientific', maximumFractionDigits: fact.precision ?? 6, useGrouping: false }).format(fact.value);
  }
  return format === 'quantity' && fact.unit ? `${value} ${fact.unit}` : value;
}

// Resolves JSON references and literal text placeholders, never expressions or executable input.
export function resolveExplanation(config) {
  const facts = config.facts;
  const reference = (id, format) => {
    echeck(eid(id) && Object.hasOwn(facts, id), `未知事实引用：${String(id)}。`);
    echeck(eformats.includes(format), '事实格式不受支持。');
    return formatFact(facts[id], format);
  };
  const resolve = value => {
    if (typeof value === 'string') return value.replace(/\{\{([^{}]+)\}\}/g, (_, token) => {
      const [id, format = 'quantity', ...rest] = token.split('|');
      echeck(rest.length === 0, '事实占位符只接受 id 与可选格式。');
      return String(reference(id, format));
    });
    if (Array.isArray(value)) return value.map(resolve);
    if (!eobject(value)) return value;
    // Scenes own their typed bindings; legacy fact placeholder substitution must not rewrite them.
    if (value.kind === 'scene') return value;
    if (Object.hasOwn(value, 'fact')) {
      ekeys(value, ['fact', 'format']);
      return reference(value.fact, value.format ?? 'value');
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child)]));
  };
  return { ...config, ...(config.title ? { title: resolve(config.title) } : {}), blocks: resolve(config.blocks) };
}

function validatePrimitive(element, box) {
  const common = ['kind', 'id', 'tone', 'label', 'labelX', 'labelY', 'dashed', 'strokeWidth', 'fill'];
  const attributes = {
    point: ['x', 'y', 'r'], line: ['x1', 'y1', 'x2', 'y2'], arrow: ['x1', 'y1', 'x2', 'y2'],
    circle: ['cx', 'cy', 'r'], rect: ['x', 'y', 'width', 'height', 'radius'],
    path: ['commands'], text: ['x', 'y', 'text', 'anchor', 'fontSize']
  };
  echeck(eobject(element) && Object.hasOwn(attributes, element.kind) && eid(element.id), '图元需要受支持的 kind 和稳定 id。');
  ekeys(element, [...common, ...attributes[element.kind]]);
  echeck(element.tone === undefined || etones.includes(element.tone), '图解只接受语义色。');
  echeck(optionalString(element.label, 160) && (element.dashed === undefined || typeof element.dashed === 'boolean'), '图元标签或虚线设置无效。');
  echeck(element.strokeWidth === undefined || efinite(element.strokeWidth) && element.strokeWidth >= 1 && element.strokeWidth <= 6, '线宽应为 1–6。');
  echeck(element.fill === undefined || ['none', 'soft', 'solid'].includes(element.fill), '图元填充无效。');
  const coord = (key, max = 4096) => echeck(efinite(element[key]) && Math.abs(element[key]) <= max, `图元 ${key} 必须是有界有限数值。`);
  for (const [key, dimension] of [['labelX', 'width'], ['labelY', 'height']]) {
    if (element[key] === undefined) continue;
    coord(key);
    echeck(element[key] >= 0 && element[key] <= box[dimension], '标签位置必须位于画布内。');
  }
  switch (element.kind) {
    case 'point': case 'text':
      coord('x'); coord('y');
      if (element.kind === 'point') echeck(element.r === undefined || efinite(element.r) && element.r > 0 && element.r <= 100, '点半径无效。');
      else {
        echeck(etext(element.text, 160) && (element.anchor === undefined || ['start', 'middle', 'end'].includes(element.anchor)), '图解文字或对齐无效。');
        echeck(element.fontSize === undefined || efinite(element.fontSize) && element.fontSize >= 14 && element.fontSize <= 36, '图解字号应为 14–36。');
      }
      break;
    case 'line': case 'arrow': ['x1', 'y1', 'x2', 'y2'].forEach(key => coord(key)); break;
    case 'circle':
      ['cx', 'cy', 'r'].forEach(key => coord(key)); echeck(element.r > 0, '圆半径必须大于零。'); break;
    case 'rect':
      ['x', 'y', 'width', 'height'].forEach(key => coord(key));
      echeck(element.width > 0 && element.height > 0 && (element.radius === undefined || efinite(element.radius) && element.radius >= 0 && element.radius <= 100), '矩形尺寸无效。'); break;
    case 'path': {
      const counts = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
      echeck(Array.isArray(element.commands) && element.commands.length >= 2 && element.commands.length <= 40 && eobject(element.commands[0]) && element.commands[0].op === 'M', '路径必须从 M 开始并包含 2–40 个结构化命令。');
      for (const command of element.commands) {
        ekeys(command, ['op', 'values']);
        echeck(Object.hasOwn(counts, command.op) && Array.isArray(command.values) && command.values.length === counts[command.op] && command.values.every(value => efinite(value) && Math.abs(value) <= 4096), '路径只接受 M/L/Q/C/Z 及其有限坐标；不接受 SVG 字符串。');
      }
      break;
    }
  }
}

export function validateDiagram(block) {
  ekeys(block, ['id', 'kind', 'title', 'description', 'viewBox', 'elements', 'states', 'initialState']);
  echeck(etext(block.description, 1600), '图解必须有可读的关系描述。');
  ekeys(block.viewBox, ['width', 'height']);
  echeck(['width', 'height'].every(key => efinite(block.viewBox[key]) && block.viewBox[key] >= diagramLimits.minSize && block.viewBox[key] <= diagramLimits.maxSize), `画布尺寸必须为 ${diagramLimits.minSize}–${diagramLimits.maxSize}。`);
  echeck(block.viewBox.height / block.viewBox.width >= diagramLimits.minRatio && block.viewBox.height / block.viewBox.width <= diagramLimits.maxRatio, `画布高宽比 height/width 必须为 ${diagramLimits.minRatio}–${diagramLimits.maxRatio}。`);
  const elements = block.elements ?? [];
  echeck(Array.isArray(elements) && elements.length <= 100, '每层图解最多 100 个图元。');
  const layer = values => {
    echeck(Array.isArray(values) && values.length <= 100, '图解图元过多。');
    values.forEach(value => validatePrimitive(value, block.viewBox));
    echeck(new Set(values.map(value => value.id)).size === values.length, '同层图元 id 不能重复。');
  };
  layer(elements);
  if (block.states !== undefined) {
    echeck(Array.isArray(block.states) && block.states.length >= 2 && block.states.length <= 6, '状态切换需要 2–6 个预先定义的状态。');
    echeck(block.states.every(eobject), '图解状态必须是对象。');
    echeck(new Set(block.states.map(state => state.id)).size === block.states.length, '图解状态 id 不能重复。');
    for (const state of block.states) {
      ekeys(state, ['id', 'label', 'description', 'elements']);
      echeck(eid(state.id) && etext(state.label, 60) && optionalString(state.description, 1600) && Array.isArray(state.elements) && state.elements.length > 0, '状态需要标识、标签和真实图元。');
      layer(state.elements);
      echeck(new Set([...elements, ...state.elements].map(value => value.id)).size === elements.length + state.elements.length, '状态图元不能与共同图元重名。');
    }
    echeck(block.initialState === undefined || block.states.some(state => state.id === block.initialState), '初始状态必须存在。');
  } else echeck(elements.length > 0 && block.initialState === undefined, '静态图解需要图元，不能指定状态。');
}

export function validateFacts(facts) {
  echeck(eobject(facts) && Object.keys(facts).length <= 80, 'facts 必须为最多 80 项的事实字典。');
  for (const [id, fact] of Object.entries(facts)) {
    echeck(eid(id), '事实 id 应为字母开头的短标识。');
    ekeys(fact, ['value', 'unit', 'label', 'precision']);
    echeck(efinite(fact.value) && Math.abs(fact.value) <= 1e12 || etext(fact.value, 500), '事实必须为有限数值或非空文本。');
    echeck(fact.unit === undefined || typeof fact.unit === 'string' && fact.unit.length <= 24, '单位过长。');
    echeck(optionalString(fact.label, 160), '事实标签必须为有效文本。');
    echeck(fact.precision === undefined || typeof fact.value === 'number' && Number.isInteger(fact.precision) && fact.precision >= 0 && fact.precision <= 6, 'precision 仅适用于数值事实，必须为 0–6 的整数；文字事实应省略 precision。');
  }
}

export function validateExplanation(config) {
  inspect(config);
  const bounded = value => echeck(new Blob([JSON.stringify(value)]).size <= EXPLANATION_MAX_BYTES, '讲解快照超过 256 KiB，请拆分为更小的讲解。');
  bounded(config);
  ekeys(config, ['schemaVersion', 'contentId', 'title', 'facts', 'blocks']);
  echeck(config.schemaVersion === 1 && etext(config.contentId, 200) && optionalString(config.title, 200), '讲解需要 schemaVersion:1、contentId 和有效标题。');
  validateFacts(config.facts);
  const resolved = resolveExplanation(config);
  echeck(optionalString(resolved.title, 200), '展开后的讲解标题应为不超过200字符的有效文本。');
  // Expansion must respect the same JSON budgets; repeated fact text cannot bypass them.
  inspect(resolved);
  bounded(resolved);
  const ids = new Set(); let count = 0;
  const visit = (blocks, depth = 0) => {
    echeck(depth <= 4 && Array.isArray(blocks) && blocks.length >= 1 && blocks.length <= 24, '每组需 1–24 块，最多四层组合。');
    for (const block of blocks) {
      echeck(++count <= 48 && eobject(block) && eid(block.id) && !ids.has(block.id), '讲解最多 48 块，块 id 必须全局唯一。');
      ids.add(block.id);
      echeck(optionalString(block.title, 200), '块标题无效。');
      switch (block.kind) {
        case 'prose':
          ekeys(block, ['id', 'kind', 'title', 'eyebrow', 'text']);
          echeck(etext(block.text, 6000) && optionalString(block.eyebrow, 100), '正文需要短段落文本。'); break;
        case 'math':
          ekeys(block, ['id', 'kind', 'title', 'math', 'label', 'detail', 'tone']);
          validateMath(block.math);
          echeck(optionalString(block.label, 1000) && optionalString(block.detail, 1600) && (block.tone === undefined || etones.includes(block.tone)), '公式说明或语义色无效。'); break;
        case 'component':
          ekeys(block, ['id', 'kind', 'type', 'title', 'data']);
          validateComponent({ schemaVersion: 1, contentId: `${config.contentId.slice(0, 110)}/${block.id}`, type: block.type, ...(block.title ? { title: block.title } : {}), data: block.data }); break;
        case 'diagram': validateDiagram(block); break;
        case 'group':
          ekeys(block, ['id', 'kind', 'title', 'layout', 'blocks']);
          echeck(['stack', 'parallel'].includes(block.layout), '组合布局仅支持 stack 或 parallel。'); visit(block.blocks, depth + 1); break;
        default: echeck(false, '只支持 prose、math、component、diagram 与 group 内容块。');
      }
    }
  };
  visit(resolved.blocks);
  return config;
}

// Typed authoring contract. The runtime additionally checks references, expanded
// budgets, global ID uniqueness, group depth, geometry and component semantics.
export const EXPLANATION_SCHEMA = (() => {
  const id = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$' };
  const ref = name => ({ $ref: `#/$defs/${name}` });
  const text = (max = 6000) => ({ anyOf: [{ type: 'string', minLength: 1, maxLength: max }, ref('textFactRef')] });
  const number = (minimum = -4096, maximum = 4096) => ({ anyOf: [{ type: 'number', minimum, maximum }, ref('numericFactRef')] });
  const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
  const tone = { enum: etones };
  const commonBlock = { id, title: text(200) };
  const block = (kind, properties, required) => object({ ...commonBlock, kind: { const: kind }, ...properties }, ['id', 'kind', ...required]);
  const commonPrimitive = {
    id, tone, label: text(160),
    labelX: { ...number(0, diagramLimits.maxSize), description: 'Optional independent label x override within viewBox.width; omitted y keeps its default.' },
    labelY: { ...number(0, diagramLimits.maxSize), description: 'Optional independent label y override within viewBox.height; omitted x keeps its default.' },
    dashed: { type: 'boolean' }, strokeWidth: number(1, 6), fill: { enum: ['none', 'soft', 'solid'] }
  };
  const primitive = (kind, properties, required) => object({ ...commonPrimitive, kind: { const: kind }, ...properties }, ['id', 'kind', ...required]);
  const coord = number();
  const line = { x1: coord, y1: coord, x2: coord, y2: coord };
  const primitives = [
    primitive('point', { x: coord, y: coord, r: number(Number.MIN_VALUE, 100) }, ['x', 'y']),
    primitive('line', line, Object.keys(line)), primitive('arrow', line, Object.keys(line)),
    primitive('circle', { cx: coord, cy: coord, r: number(Number.MIN_VALUE, 4096) }, ['cx', 'cy', 'r']),
    primitive('rect', { x: coord, y: coord, width: number(Number.MIN_VALUE, 4096), height: number(Number.MIN_VALUE, 4096), radius: number(0, 100) }, ['x', 'y', 'width', 'height']),
    primitive('path', { commands: { type: 'array', minItems: 2, maxItems: 40, items: ref('pathCommand'), description: 'Begin with M. Coordinates only, never an SVG d string.' } }, ['commands']),
    primitive('text', { x: coord, y: coord, text: text(160), anchor: { enum: ['start', 'middle', 'end'] }, fontSize: number(14, 36) }, ['x', 'y', 'text'])
  ];
  const elementList = { type: 'array', maxItems: 100, items: ref('primitive'), description: 'Primitive IDs must be unique within this layer. State primitives cannot reuse a common element ID; IDs may recur in different states.' };
  const blocks = { type: 'array', minItems: 1, maxItems: 24, items: ref('block') };
  const defs = {
    factRef: object({ fact: id, format: { enum: eformats } }, ['fact']),
    textFactRef: {
      ...object({ fact: id, format: { enum: ['text', 'quantity', 'unit', 'label'] } }, ['fact', 'format']),
      description: 'Text fields need an explicit text/quantity/unit/label format; raw numeric value references belong in number fields.'
    },
    numericFactRef: object({ fact: id, format: { const: 'value' } }, ['fact']),
    mathNode: { anyOf: [text(12000), object({ tag: { enum: ['mrow', 'mi', 'mn', 'mo', 'mtext', 'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mover', 'munder'] }, text: text(12000), children: { type: 'array', maxItems: 200, items: ref('mathNode') } }, ['tag'])] },
    pathCommand: { oneOf: Object.entries({ M: 2, L: 2, Q: 4, C: 6, Z: 0 }).map(([op, count]) => object({ op: { const: op }, values: { type: 'array', minItems: count, maxItems: count, items: coord } }, ['op', 'values'])) },
    primitive: { oneOf: primitives },
    diagramState: object({ id, label: text(60), description: text(1600), elements: { ...elementList, minItems: 1 } }, ['id', 'label', 'elements']),
    prose: block('prose', { eyebrow: text(100), text: text(6000) }, ['text']),
    math: block('math', { math: ref('mathNode'), label: text(1000), detail: text(1600), tone }, ['math']),
    component: block('component', { type: { enum: TYPES }, data: {
      type: 'object',
      description: COMPONENT_DATA_DESCRIPTION
    } }, ['type', 'data']),
    group: block('group', { layout: { enum: ['stack', 'parallel'] }, blocks }, ['layout', 'blocks']),
    diagram: {
      ...block('diagram', {
        description: text(1600), viewBox: {
          ...object({ width: number(diagramLimits.minSize, diagramLimits.maxSize), height: number(diagramLimits.minSize, diagramLimits.maxSize) }, ['width', 'height']),
          description: `Numeric object, not an SVG viewBox string. ${diagramSizeRule} The server checks the cross-field ratio after fact resolution.`
        },
        elements: elementList, states: { type: 'array', minItems: 2, maxItems: 6, items: ref('diagramState'), description: 'Each state needs a unique state ID. initialState must name one of these IDs.' }, initialState: id
      }, ['description', 'viewBox']),
      anyOf: [{ required: ['states'] }, { required: ['elements'], properties: { elements: { minItems: 1 } } }],
      description: `A static relationship or 2–6 predefined observation states. ${diagramSizeRule} Use readable labels, direction and units, and a textual alternative. Optional labelX/labelY each override their own default within the viewBox. Not a script or continuous formula executor.`
    },
    block: { oneOf: ['prose', 'math', 'component', 'group', 'diagram'].map(ref) }
  };
  return {
    ...object({
      schemaVersion: { type: 'integer', const: 1 },
      contentId: { type: 'string', minLength: 1, maxLength: 200, description: 'Full snapshot identity. Change when values, units, labels or meaning change. Natural follow-ups use the latest givens.' },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      facts: {
        type: 'object', maxProperties: 80, propertyNames: id,
        description: 'Known or explicitly adopted facts, keyed by short IDs. Numeric facts may set precision:0–6; text facts must omit precision. Use {fact:"id"} for raw numeric data, {fact:"id",format:"text"} for MathML, and {{id}} or {{id|text}} inside prose/labels. No formulas or invented facts. Live experiment state is independent of these immutable problem givens.',
        additionalProperties: { oneOf: [
          object({ value: { type: 'number', minimum: -1e12, maximum: 1e12 }, unit: { type: 'string', maxLength: 24 }, label: { type: 'string', minLength: 1, maxLength: 160 }, precision: { type: 'integer', minimum: 0, maximum: 6 } }, ['value']),
          object({ value: { type: 'string', minLength: 1, maxLength: 500 }, unit: { type: 'string', maxLength: 24 }, label: { type: 'string', minLength: 1, maxLength: 160 } }, ['value'])
        ] }
      },
      blocks: { ...blocks, description: 'Ordered reading flow. Use prose between visual blocks; do not wrap the whole answer in cards. Max 48 total blocks, four group levels, globally unique IDs. Parallel groups become vertical on narrow screens. Safe MathML and structured SVG only; no HTML/SVG strings.' }
    }, ['schemaVersion', 'contentId', 'facts', 'blocks']),
    $defs: defs
  };
})();
