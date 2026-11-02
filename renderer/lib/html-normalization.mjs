import sanitizeHtml from 'sanitize-html';
import { parseDocument } from 'htmlparser2';
import { HTML_TAGS, HTML_GLOBAL_ATTRIBUTES, HTML_TAG_ATTRIBUTES, HTML_DROP_CONTENT, cleanHtmlAttribute } from './html-policy.mjs';
import { validateHtmlInput, validateHtmlView } from './html-validation.mjs';
export function sanitizeHtmlFragment(html) {
  return sanitizeHtml(html, {
    allowedTags: [...HTML_TAGS],
    allowedAttributes: { '*': [...HTML_GLOBAL_ATTRIBUTES, 'aria-*'], ...HTML_TAG_ATTRIBUTES },
    allowedSchemes: ['https', 'http', 'mailto'], allowProtocolRelative: false,
    disallowedTagsMode: 'discard', nonTextTags: [...HTML_DROP_CONTENT], parseStyleAttributes: false,
    transformTags: { '*': (tagName, attributes) => {
      const attribs = {};
      for (const [name, value] of Object.entries(attributes)) {
        const cleaned = cleanHtmlAttribute(tagName, name, value);
        if (cleaned !== null) attribs[name] = cleaned;
      }
      if (tagName === 'a' && attribs.href) attribs.rel = 'noopener noreferrer';
      if (tagName === 'a' && !attribs.href) delete attribs.target;
      return { tagName, attribs };
    } }
  });
}
const blockTags = new Set(['article', 'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'dl', 'dt', 'dd', 'blockquote', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'details', 'summary']);
// Parse only sanitized output; preserve literal code, entities, links and all disclosure content.
export function htmlFallbackText(html) {
  const document = parseDocument(html, { decodeEntities: true });
  const literal = node => node.type === 'text' ? node.data : (node.children || []).map(literal).join('');
  const isVector = node => node.name === 'span' && (node.attribs?.class || '').split(/\s+/u).includes('vector');
  const inlineLiteral = node => {
    const text = node.type === 'text' ? node.data : (node.children || []).map(inlineLiteral).join('');
    return isVector(node) ? `vec(${text.replaceAll('\u20d7', '')})` : text;
  };
  const render = (node, listDepth = 0) => {
    if (node.type === 'text') return node.data.replace(/\s+/gu, ' ');
    const tag = node.name;
    if (tag === 'pre') return `\n\n${literal(node)}\n\n`;
    if (tag === 'kbd' || tag === 'samp') return literal(node);
    if (tag === 'code') return inlineLiteral(node);
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n——\n\n';
    if (tag === 'ul' || tag === 'ol') {
      let number = Number(node.attribs?.start || 1);
      const items = (node.children || []).filter(child => child.name === 'li');
      if (Object.hasOwn(node.attribs || {}, 'reversed')) number = Number(node.attribs.start || items.length);
      return '\n' + items.map(child => {
        if (child.attribs?.value !== undefined) number = Number(child.attribs.value);
        const prefix = tag === 'ol' ? `${number}. ` : '- ';
        number += Object.hasOwn(node.attribs || {}, 'reversed') ? -1 : 1;
        return `${'  '.repeat(listDepth)}${prefix}${(child.children || []).map(item => render(item, listDepth + 1)).join('').trim()}\n`;
      }).join('') + '\n';
    }
    if (tag === 'tr') return (node.children || []).filter(child => ['th', 'td'].includes(child.name)).map(child => (child.children || []).map(item => render(item, listDepth)).join('').trim()).join(' | ') + '\n';
    const content = (node.children || []).map(child => render(child, listDepth)).join('');
    if (isVector(node)) return `vec(${content.replaceAll('\u20d7', '')})`;
    if (tag === 'a' && node.attribs?.href) return content.trim() === node.attribs.href ? content : `${content} (${node.attribs.href})`;
    return blockTags.has(tag) ? `\n${content}\n` : content;
  };
  // Trim the outside only. Do not collapse whitespace inside code blocks.
  return render(document).trim();
}
export function normalizeHtml(input) {
  validateHtmlInput(input);
  const html = sanitizeHtmlFragment(input.html);
  if (!html.trim()) throw new Error('HTML 净化后没有可显示内容；请使用安全语义标签或提供原生文字回答。');
  const view = { schemaVersion: 1, mode: 'html', contentId: input.contentId,
    ...(input.title !== undefined ? { title: input.title } : {}), html, theme: 'native' };
  validateHtmlView(view);
  const text = input.fallbackText ?? htmlFallbackText(html);
  if (!text.trim()) throw new Error('HTML 没有可读的正文；请补充正文或 fallbackText。');
  return { view, text };
}
