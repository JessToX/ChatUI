// One data-only policy for the server sanitizer and the browser sanitizer.
export const HTML_MAX_BYTES = 256 * 1024;
export const HTML_TAGS = Object.freeze([
  'article', 'section', 'div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'ul', 'ol', 'li',
  'dl', 'dt', 'dd', 'blockquote', 'q', 'pre', 'code', 'kbd', 'samp',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'details', 'summary', 'hr', 'br', 'a', 'sub', 'sup'
]);
export const HTML_CLASSES = Object.freeze([
  'concept-card', 'derivation', 'key-point', 'note', 'warning', 'success',
  'comparison-grid', 'muted', 'compact', 'vector'
]);
export const HTML_DROP_CONTENT = Object.freeze([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'button', 'input',
  'textarea', 'select', 'option', 'svg', 'math', 'template', 'noscript', 'head'
]);
export const HTML_GLOBAL_ATTRIBUTES = Object.freeze(['class', 'title', 'role']);
export const HTML_TAG_ATTRIBUTES = Object.freeze({
  a: ['href', 'target', 'rel'], details: ['open'],
  th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
  ol: ['start', 'reversed'], li: ['value'], blockquote: ['cite'], q: ['cite']
});
const classes = new Set(HTML_CLASSES);
const roles = new Set(['article', 'document', 'region', 'note', 'status', 'alert', 'group',
  'list', 'listitem', 'table', 'rowgroup', 'row', 'cell', 'columnheader', 'rowheader',
  'heading', 'presentation', 'none']);
export function safeHtmlUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  // Absolute URLs only. Reject embedded controls/whitespace, including decoded entities.
  if (!url || /[\u0000-\u0020\u007f-\u009f]/u.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return null;
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.hostname) return null;
    return parsed.href;
  } catch { return null; }
}
export function cleanHtmlAttribute(tag, name, value) {
  if (typeof value !== 'string') return null;
  if (/^aria-[a-z][a-z-]*$/u.test(name)) return value;
  if (!HTML_GLOBAL_ATTRIBUTES.includes(name) && !HTML_TAG_ATTRIBUTES[tag]?.includes(name)) return null;
  switch (name) {
    case 'class': return [...new Set(value.split(/\s+/u).filter(item => classes.has(item)))].join(' ') || null;
    case 'role': return roles.has(value) ? value : null;
    case 'href': case 'cite': return safeHtmlUrl(value);
    case 'target': return ['_blank', '_self'].includes(value) ? value : null;
    case 'rel': return null; // App supplies this, never trust a model-provided rel.
    case 'open': case 'reversed': return '';
    case 'colspan': case 'rowspan': return /^\d{1,4}$/u.test(value) && Number(value) >= 1 && Number(value) <= 1000 ? String(Number(value)) : null;
    case 'scope': return ['row', 'col', 'rowgroup', 'colgroup'].includes(value) ? value : null;
    case 'start': case 'value': return /^-?\d{1,7}$/u.test(value) ? String(Number(value)) : null;
    default: return value;
  }
}
