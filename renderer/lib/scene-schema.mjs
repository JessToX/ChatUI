// Authoring schema only; never shipped as a second browser framework.
const ref = name => ({ $ref: `#/$defs/scene${name}` });
const str = maxLength => ({ type: 'string', maxLength });
const obj = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const id = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$' };
const scalar = { anyOf: [{ type: 'number', minimum: -1e12, maximum: 1e12 }, { type: 'boolean' }, str(4000)] };
const parts = { type: 'array', minItems: 1, maxItems: 32, items: { anyOf: [str(4000), obj({ ref: id, precision: { type: 'integer', minimum: 0, maximum: 6 } }, ['ref'])] } };
const expr = ref('Expression');
const node = (kind, properties, required) => obj({ kind: { const: kind }, id, when: expr, ...properties }, ['kind', 'id', ...required]);
const record = (maxProperties, additionalProperties) => ({ type: 'object', maxProperties, propertyNames: id, additionalProperties });
const commandFields = { M: ['x', 'y'], L: ['x', 'y'], Q: ['x1', 'y1', 'x', 'y'], C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'], Z: [] };
const markFields = { line: ['x1', 'y1', 'x2', 'y2'], arrow: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'width', 'height'], circle: ['cx', 'cy', 'r'], text: ['x', 'y'], path: [] };
const variableMeta = { role: { enum: ['exploration', 'presentation'], description: 'Default exploration. Mark purely visual toggles as presentation; they are never exported to model context.' }, label: str(160), unit: str(40) };
export const SCENE_DEFS = {
  sceneExpression: { anyOf: [scalar, obj({ ref: id }, ['ref']), obj({
    op: { enum: ['add', 'sub', 'mul', 'div', 'pow', 'min', 'max', 'abs', 'sqrt', 'sin', 'cos', 'round', 'eq', 'lt', 'lte', 'gt', 'gte', 'and', 'or', 'not', 'if'] },
    args: { type: 'array', minItems: 1, maxItems: 8, items: expr }
  }, ['op', 'args'])], description: 'Typed bounded pure expression. {ref:"id"} references givens/state/derived. No dotted access, code strings, functions, loops or I/O. Arithmetic/comparisons require numbers; logical operators require booleans; if has [boolean,sameType,sameType]. sin/cos use radians. Division by zero and nonfinite/out-of-range results reject the update. pow exponent magnitude ≤16.' },
  sceneVariable: { oneOf: [
    obj({ type: { const: 'number' }, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', exclusiveMinimum: 0 }, ...variableMeta }, ['type', 'value', 'min', 'max']),
    obj({ type: { const: 'boolean' }, value: { type: 'boolean' }, role: variableMeta.role, label: variableMeta.label }, ['type', 'value']),
    obj({ type: { const: 'string' }, value: str(160), options: { type: 'array', minItems: 2, maxItems: 16, uniqueItems: true, items: str(160) }, role: variableMeta.role, label: variableMeta.label }, ['type', 'value', 'options'])
  ] },
  sceneNode: { oneOf: [
    node('layout', { direction: { enum: ['row', 'column', 'grid'] }, columns: { type: 'integer', minimum: 1, maximum: 4 }, gap: { enum: ['small', 'medium', 'large'] }, align: { enum: ['start', 'center', 'stretch'] }, children: { type: 'array', minItems: 1, maxItems: 32, items: ref('Node') } }, ['direction', 'children']),
    ...['text', 'formula'].map(kind => node(kind, { parts, style: { enum: ['body', 'heading', 'caption', 'metric'] } }, ['parts'])),
    node('control', { control: { enum: ['number', 'range', 'toggle', 'select'] }, state: id, label: str(160) }, ['control', 'state', 'label']),
    node('button', { label: str(160), action: { oneOf: [obj({ type: { const: 'reset' } }, ['type']), obj({ type: { const: 'set' }, state: id, value: expr }, ['type', 'state', 'value'])] } }, ['label', 'action']),
    node('drawing', { description: str(2000), viewBox: obj({ width: { type: 'number', minimum: 120, maximum: 1280 }, height: { type: 'number', minimum: 120, maximum: 1280 } }, ['width', 'height']), marks: { type: 'array', minItems: 1, maxItems: 192, items: ref('Mark') } }, ['description', 'viewBox', 'marks'])
  ], description: 'Compose a fresh view for the actual content; no shape/task templates. Layout uses browser flex/grid and collapses at narrow widths. Text/formula parts mix literal text and shared value references; formula renders plain mathematical notation as MathML mtext, not TeX execution. IDs unique across nodes and marks; max128 layout nodes/depth8. when must be boolean. Controls mutate declared local state. Valid exploration changes may replace public model context when supported, without messages, answers or tools; receipt does not prove adoption. Presentation-only changes are excluded. No persistence guarantee. Changed problem conditions require a new contentId snapshot.' },
  sceneMark: { oneOf: Object.entries(markFields).map(([kind, fields]) => obj({
    kind: { const: kind }, id, tone: { enum: ['blue', 'green', 'orange', 'neutral'] }, fill: { enum: ['none', 'soft', 'solid'] }, strokeWidth: { type: 'number', minimum: 1, maximum: 6 }, dashed: { type: 'boolean' },
    ...Object.fromEntries(fields.map(k => [k, expr])),
    ...(kind === 'circle' ? { drag: obj({ state: id, axis: { enum: ['x', 'y'] }, origin: { type: 'number', minimum: -4096, maximum: 4096 }, scale: { type: 'number', minimum: -4096, maximum: 4096, not: { const: 0 } }, label: str(160) }, ['state', 'axis', 'origin', 'scale', 'label']) } : {}),
    ...(kind === 'text' ? { parts, anchor: { enum: ['start', 'middle', 'end'] }, fontSize: { type: 'integer', minimum: 14, maximum: 36 } } : {}),
    ...(kind === 'path' ? { commands: { type: 'array', minItems: 2, maxItems: 40, items: { oneOf: Object.entries(commandFields).map(([op, fs]) => obj({ op: { const: op }, ...Object.fromEntries(fs.map(k => [k, expr])) }, ['op', ...fs])) } } } : {})
  }, ['kind', 'id', ...fields, ...(kind === 'text' ? ['parts'] : kind === 'path' ? ['commands'] : [])])) }
};
export const SCENE_SCHEMA = obj({
  kind: { const: 'scene' }, id, title: str(200), description: str(2000),
  givens: record(32, scalar), state: record(16, ref('Variable')),
  derived: record(32, obj({ type: { enum: ['number', 'boolean', 'string'] }, expr }, ['type', 'expr'])), root: ref('Node')
}, ['kind', 'id', 'description', 'givens', 'state', 'derived', 'root']);
SCENE_SCHEMA.description = 'General generated visual view. Plan the explanation, layout, marks, labels and useful controls from the natural question. Keep known/adopted givens separate from exploratory state; never invent measurements. Define derived relationships once and bind every corresponding text/formula/mark to the same value. Give derived values explicit types; dependencies must be acyclic. Empty state/derived are valid for static views. Data IDs unique across givens/state/derived. Model-supplied formulas still require reasoning verification. Runtime validates all data; no HTML/CSS/SVG strings, JS, URLs, network or host access.';
