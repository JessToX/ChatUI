import { HTML_MAX_BYTES } from './html-policy.mjs';
const stringSchema = maxLength => ({ type: 'string', minLength: 1, maxLength });
const properties = {
  contentId: { ...stringSchema(200), description: 'Immutable identity of this answer snapshot. Use a new identity when the content or conditions change.' },
  html: { ...stringSchema(HTML_MAX_BYTES), description: 'Semantic HTML fragment, not a full document. No scripts, CSS, SVG, images, forms or event handlers. Use native details/summary for optional explanations.' },
  title: stringSchema(200), theme: { type: 'string', enum: ['native'], default: 'native' }
};
export const HTML_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contentId', 'html'],
  properties: { ...properties, fallbackText: { ...stringSchema(HTML_MAX_BYTES), description: 'Optional complete readable fallback. If omitted, it is generated from sanitized HTML.' } }
};
export const HTML_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'mode', 'contentId', 'html', 'theme'],
  properties: { schemaVersion: { type: 'integer', const: 1 }, mode: { type: 'string', const: 'html' }, ...properties }
};
function validate(config, view) {
  const fail = message => { throw new Error(message); };
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('HTML 参数必须是对象。');
  const allowed = Object.keys((view ? HTML_OUTPUT_SCHEMA : HTML_INPUT_SCHEMA).properties);
  if (Object.keys(config).some(key => !allowed.includes(key))) fail('HTML 参数含有不支持的属性。');
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= max;
  if (!text(config.contentId, 200)) fail('HTML contentId 必须是 1–200 字符的快照标识。');
  if (!text(config.html, HTML_MAX_BYTES)) fail('HTML 片段不能为空或超过请求上限。');
  if (config.title !== undefined && !text(config.title, 200)) fail('HTML 标题必须是 1–200 字符的文本。');
  if (config.theme !== undefined && config.theme !== 'native') fail('HTML 主题仅支持 native。');
  if (!view && config.fallbackText !== undefined && !text(config.fallbackText, HTML_MAX_BYTES)) fail('HTML fallbackText 必须是完整可读文本且不超过上限。');
  if (view && (config.mode !== 'html' || config.schemaVersion !== 1 || config.theme !== 'native')) fail('HTML 视图版本、模式或主题无效。');
  if (new TextEncoder().encode(JSON.stringify(config)).byteLength > HTML_MAX_BYTES) fail('HTML 快照超过 256 KiB 上限；请按自然章节缩短，不要截断 HTML。');
  return config;
}
export const validateHtmlInput = config => validate(config, false);
export const validateHtmlView = config => validate(config, true);
