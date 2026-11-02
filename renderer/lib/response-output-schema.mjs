import { RESPONSE_SCHEMA } from './response-validation.mjs';
import { MATH_TAGS } from './component-validation.mjs';
import { publicQuizOutputSchema } from './quiz-boundary.mjs';

// The input contract is unchanged. Output prose is a normalized AST, and TeX
// is accompanied by compiled MathML, so the input schema cannot describe it.
export const RESPONSE_OUTPUT_SCHEMA = (() => {
  const schema = JSON.parse(JSON.stringify(RESPONSE_SCHEMA));
  const text = (maxLength, minLength = 0) => ({ type: 'string', minLength, maxLength });
  const ref = name => ({ $ref: `#/$defs/${name}` });
  const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
  const nodes = { type: 'array', maxItems: 200, items: ref('richNode') };
  const node = (type, properties = {}, required = []) => object({ type: { const: type }, ...properties }, ['type', ...required]);
  // Fact references have already been resolved in the returned snapshot.
  const resolved = value => {
    if (Array.isArray(value)) return value.map(resolved);
    if (!value || typeof value !== 'object') return value;
    if (value.anyOf?.length === 2 && ['#/$defs/textFactRef', '#/$defs/numericFactRef'].includes(value.anyOf[1].$ref)) return resolved(value.anyOf[0]);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolved(child)]));
  };
  const output = resolved(schema);
  output.properties.viewVersion = { type: 'integer', const: 1 };
  output.required.push('viewVersion');
  output.$defs.prose = object({
    id: schema.$defs.prose.properties.id, kind: { const: 'prose' },
    title: text(200, 1), eyebrow: text(100, 1), nodes
  }, ['id', 'kind', 'nodes']);
  output.$defs.math.required = ['id', 'kind', 'math'];
  delete output.$defs.math.oneOf;
  output.$defs.mathNode = { anyOf: [text(12000), object({
    tag: { type: 'string', enum: MATH_TAGS }, text: text(12000),
    children: { type: 'array', maxItems: 200, items: ref('mathNode') },
    attrs: { type: 'object', maxProperties: 12, additionalProperties: text(160), description: 'Closed attribute names and bounded values are independently checked by validateMathAttributes; never CSS, URLs or events.' }
  }, ['tag'])] };
  output.$defs.richNode = { oneOf: [
    object({ type: { enum: ['paragraph', 'strong', 'em', 'del', 'blockquote', 'item', 'table', 'row'] }, children: nodes }, ['type', 'children']),
    object({ type: { enum: ['text', 'code'] }, text: text(12000) }, ['type', 'text']),
    node('codeblock', { text: text(12000), language: text(40, 1) }, ['text']),
    node('heading', { level: { type: 'integer', minimum: 1, maximum: 4 }, children: nodes }, ['level', 'children']),
    node('link', { href: text(2048, 1), children: nodes }, ['href', 'children']),
    node('list', { ordered: { type: 'boolean' }, start: { type: 'integer', minimum: 1, maximum: 9999 }, children: nodes }, ['ordered', 'start', 'children']),
    node('cell', { header: { type: 'boolean' }, children: nodes }, ['header', 'children']),
    node('math', { math: ref('mathNode'), tex: text(2400, 1), display: { type: 'boolean' } }, ['math', 'tex', 'display']),
    node('break'), node('rule')
  ] };
  output.$defs.block.oneOf = ['prose', 'math', 'component', 'diagram', 'scene', 'group', 'collapse', 'tabs'].map(ref);
  for (const kind of ['heading', 'list', 'quote', 'code']) delete output.$defs[kind];
  return publicQuizOutputSchema(output);
})();
