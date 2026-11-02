import { inspect, validateMath, validateComponent, TYPES } from './component-validation.mjs';
import { validateFacts, validateDiagram, resolveExplanation, EXPLANATION_SCHEMA } from './explanation-validation.mjs';
import { validateScene } from './scene-runtime.mjs';
import { SCENE_SCHEMA, SCENE_DEFS } from './scene-schema.mjs';

export const RESPONSE_MAX_BYTES = 256 * 1024;
export const RESPONSE_VIEW_MAX_BYTES = 512 * 1024;
export const RESPONSE_KINDS = ['prose', 'heading', 'list', 'quote', 'code', 'math', 'component', 'diagram', 'scene', 'group', 'collapse', 'tabs'];
const rcheck = (ok, message) => { if (!ok) throw new Error(message); };
const robject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rtext = (value, max = 12000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const rid = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value);
const rkeys = (value, keys) => rcheck(robject(value) && Object.keys(value).every(key => keys.includes(key)), '回答包含不受支持的属性。');
const ropt = (value, max) => value === undefined || rtext(value, max);
export function safeResponseUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\x00-\x1f<>]/u.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
function responseBudget(config, maximum) {
  inspect(config);
  rcheck(new TextEncoder().encode(JSON.stringify(config)).byteLength <= maximum, '回答快照过大，请拆分本轮内容。');
}
export function validateRichNodes(nodes, depth = 0, budget = { nodes: 0 }) {
  rcheck(depth <= 12 && Array.isArray(nodes) && nodes.length <= 200, '正文结构过深或过长。');
  const containers = ['paragraph', 'strong', 'em', 'del', 'blockquote', 'item', 'table', 'row'];
  for (const node of nodes) {
    rcheck(++budget.nodes <= 8000 && robject(node), '正文节点过多。');
    let keys = ['type'];
    if (containers.includes(node.type)) keys.push('children');
    else if (['text', 'code'].includes(node.type)) { keys.push('text'); rcheck(typeof node.text === 'string' && node.text.length <= 12000, '正文必须为有界文本。'); }
    else if (node.type === 'codeblock') { keys.push('text', 'language'); rcheck(typeof node.text === 'string' && node.text.length <= 12000 && ropt(node.language, 40), '代码块无效。'); }
    else if (node.type === 'heading') { keys.push('children', 'level'); rcheck(Number.isInteger(node.level) && node.level >= 1 && node.level <= 4, '标题层级应为 1–4。'); }
    else if (node.type === 'link') { keys.push('children', 'href'); rcheck(safeResponseUrl(node.href), '来源仅接受无凭据的 HTTPS 地址。'); }
    else if (node.type === 'list') { keys.push('children', 'ordered', 'start'); rcheck(typeof node.ordered === 'boolean' && Number.isInteger(node.start) && node.start >= 1 && node.start <= 9999, '列表起点无效。'); }
    else if (node.type === 'cell') { keys.push('children', 'header'); rcheck(typeof node.header === 'boolean', '表格标题无效。'); }
    else if (node.type === 'math') { keys.push('math', 'tex', 'display'); validateMath(node.math); rcheck(rtext(node.tex, 2400) && typeof node.display === 'boolean', '正文公式无效。'); }
    else rcheck(['break', 'rule'].includes(node.type), '不受支持的正文节点。');
    rkeys(node, keys);
    if (keys.includes('children')) validateRichNodes(node.children, depth + 1, budget);
  }
}
function validateResponseContract(config, view, resolveFacts = true) {
  responseBudget(config, view ? RESPONSE_VIEW_MAX_BYTES : RESPONSE_MAX_BYTES);
  rkeys(config, ['schemaVersion', 'contentId', 'title', 'facts', 'blocks', ...(view ? ['viewVersion'] : [])]);
  rcheck(config.schemaVersion === 1 && rtext(config.contentId, 200) && ropt(config.title, 200), '回答需要 schemaVersion:1、contentId 和有效标题。');
  if (view) rcheck(config.viewVersion === 1, '视图需经服务端归一化。');
  validateFacts(config.facts);
  const resolved = view || !resolveFacts ? config : resolveExplanation(config);
  responseBudget(resolved, view ? RESPONSE_VIEW_MAX_BYTES : RESPONSE_MAX_BYTES);
  rcheck(ropt(resolved.title, 200), '展开后的回答标题过长。');
  const ids = new Set(); let count = 0;
  const visit = (blocks, depth = 0) => {
    rcheck(depth <= 4 && Array.isArray(blocks) && blocks.length >= 1 && blocks.length <= 64, '每组需要 1–64 块，组合不超过四层。');
    for (const b of blocks) {
      rcheck(++count <= 96 && robject(b) && rid(b.id) && !ids.has(b.id), '最多 96 个内容块，块 id 必须全局唯一。'); ids.add(b.id);
      rcheck(ropt(b.title, 200), '块标题无效。');
      const common = ['kind', 'id', 'title'];
      switch (b.kind) {
        case 'prose':
          rkeys(b, [...common, 'eyebrow', view ? 'nodes' : 'text']); rcheck(ropt(b.eyebrow, 100), '眉题无效。');
          if (view) validateRichNodes(b.nodes); else rcheck(rtext(b.text), '正文应为非空 Markdown 文本。'); break;
        case 'heading':
          rcheck(!view, '标题需归一化。'); rkeys(b, [...common, 'text', 'level']); rcheck(rtext(b.text, 400) && (b.level === undefined || Number.isInteger(b.level) && b.level >= 1 && b.level <= 4), '标题内容或层级无效。'); break;
        case 'list':
          rcheck(!view, '列表需归一化。'); rkeys(b, [...common, 'items', 'ordered']); rcheck(Array.isArray(b.items) && b.items.length >= 1 && b.items.length <= 80 && b.items.every(item => rtext(item, 2000)) && (b.ordered === undefined || typeof b.ordered === 'boolean'), '列表内容无效。'); break;
        case 'quote':
          rcheck(!view, '引用需归一化。'); rkeys(b, [...common, 'text', 'citation']); rcheck(rtext(b.text) && ropt(b.citation, 400), '引用内容无效。'); break;
        case 'code':
          rcheck(!view, '代码需归一化。'); rkeys(b, [...common, 'code', 'language']); rcheck(rtext(b.code) && ropt(b.language, 40), '代码内容无效。'); break;
        case 'math':
          rkeys(b, [...common, 'math', 'tex', 'label', 'detail', 'tone']);
          rcheck(ropt(b.label, 1000) && ropt(b.detail, 1600) && (b.tone === undefined || ['blue', 'green', 'orange', 'neutral'].includes(b.tone)), '公式说明或语义色无效。');
          if (view) { validateMath(b.math); rcheck(ropt(b.tex, 2400), '原公式无效。'); }
          else { rcheck((b.tex !== undefined) !== (b.math !== undefined), '公式须且只能提供 tex 或 math。'); if (b.tex !== undefined) rcheck(rtext(b.tex, 2400), 'TeX 公式过长或为空。'); else validateMath(b.math); } break;
        case 'component':
          rkeys(b, [...common, 'type', 'data']);
          rcheck(TYPES.includes(b.type) && robject(b.data), '组件类型或数据无效。');
          // Input TeX is compiled before component-specific validation. Output is always checked.
          if (view) validateComponent({ schemaVersion: 1, contentId: `${config.contentId.slice(0, 110)}/${b.id}`, type: b.type, ...(b.title ? { title: b.title } : {}), data: b.data }); break;
        case 'diagram': validateDiagram(b); break;
        case 'scene': validateScene(b); break;
        case 'group':
          rkeys(b, [...common, 'layout', 'blocks']); rcheck(['stack', 'parallel'].includes(b.layout), '组合仅接受 stack / parallel。'); visit(b.blocks, depth + 1); break;
        case 'collapse':
          rkeys(b, [...common, 'summary', 'open', 'blocks']); rcheck(rtext(b.summary, 200) && (b.open === undefined || typeof b.open === 'boolean'), '折叠项需要摘要。'); visit(b.blocks, depth + 1); break;
        case 'tabs':
          rkeys(b, [...common, 'items', 'initialTab']); rcheck(Array.isArray(b.items) && b.items.length >= 2 && b.items.length <= 8, '标签页需要 2–8 项。');
          rcheck(new Set(b.items.map(item => item.id)).size === b.items.length, '标签页标识不能重复。');
          for (const item of b.items) { rkeys(item, ['id', 'label', 'blocks']); rcheck(rid(item.id) && rtext(item.label, 80), '标签页需要有效 id 和标签。'); visit(item.blocks, depth + 1); }
          rcheck(b.initialTab === undefined || b.items.some(item => item.id === b.initialTab), '初始标签页不存在。'); break;
        default: rcheck(false, '不受支持的回答内容块。');
      }
    }
  };
  visit(resolved.blocks);
  return config;
}
export const validateResponseInput = (config, { resolveFacts = true } = {}) => validateResponseContract(config, false, resolveFacts);
export const validateResponseView = config => validateResponseContract(config, true);

// The browser bundle stops before this schema; there are no parsers or TeX libraries in the iframe.
export const RESPONSE_SCHEMA = (() => {
  const base = JSON.parse(JSON.stringify(EXPLANATION_SCHEMA));
  Object.assign(base.$defs, SCENE_DEFS, { scene: SCENE_SCHEMA });
  const text = max => ({ type: 'string', minLength: 1, maxLength: max });
  const blocks = { type: 'array', minItems: 1, maxItems: 64, items: { $ref: '#/$defs/block' } };
  const block = (kind, props, required) => ({ type: 'object', additionalProperties: false, properties: { id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$' }, kind: { const: kind }, title: text(200), ...props }, required: ['id', 'kind', ...required] });
  base.properties.blocks = blocks;
  base.properties.contentId.description = 'Immutable problem snapshot ID. Use a new ID when facts or conditions change; unchanged block IDs preserve UI within one snapshot.';
  base.$defs.prose.properties.text = { ...text(12000), description: 'Necessary Markdown: paragraphs, headings, lists, emphasis, code, quotes, tables, HTTPS links; HTML is inert text. Inline math uses $TeX$ or \\(TeX\\); display math uses $$TeX$$. Reference shared facts with {{id|value}} / {{id}}.' };
  base.$defs.math.properties.tex = { ...text(2400), description: 'Compact TeX, safely compiled server-side. Exactly one of tex or legacy math. No commands for HTML, CSS, URLs or macro definitions.' };
  base.$defs.math.required = ['id', 'kind']; base.$defs.math.oneOf = [{ required: ['tex'], not: { required: ['math'] } }, { required: ['math'], not: { required: ['tex'] } }];
  base.$defs.component.properties.data.description += ' In render_response only, use tex instead of math at supported formula fields; the server compiles it into validated MathML. No arbitrary expressions or runtime code.';
  base.$defs.group.properties.blocks = blocks;
  base.$defs.heading = block('heading', { text: text(400), level: { type: 'integer', minimum: 1, maximum: 4 } }, ['text']);
  base.$defs.list = block('list', { items: { type: 'array', minItems: 1, maxItems: 80, items: text(2000) }, ordered: { type: 'boolean' } }, ['items']);
  base.$defs.quote = block('quote', { text: text(12000), citation: text(400) }, ['text']);
  base.$defs.code = block('code', { code: text(12000), language: text(40) }, ['code']);
  base.$defs.collapse = block('collapse', { summary: text(200), open: { type: 'boolean' }, blocks }, ['summary', 'blocks']);
  base.$defs.tabs = block('tabs', { initialTab: { type: 'string' }, items: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, label: text(80), blocks }, required: ['id', 'label', 'blocks'] } } }, ['items']);
  base.$defs.block.oneOf = RESPONSE_KINDS.map(kind => ({ $ref: `#/$defs/${kind}` }));
  return base;
})();
