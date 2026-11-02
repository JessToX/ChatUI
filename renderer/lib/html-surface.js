import createDOMPurify from 'dompurify';
import { HTML_TAGS, HTML_GLOBAL_ATTRIBUTES, HTML_TAG_ATTRIBUTES, HTML_DROP_CONTENT, cleanHtmlAttribute } from './html-policy.mjs';
import { validateHtmlView } from './html-validation.mjs';
export { validateHtmlView };
const purifiers = new WeakMap();
function purifierFor(document) {
  if (purifiers.has(document)) return purifiers.get(document);
  const purifier = createDOMPurify(document.defaultView);
  if (!purifier.isSupported) throw new Error('当前浏览器无法安全净化 HTML。');
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    const cleaned = cleanHtmlAttribute(node.localName, data.attrName, data.attrValue);
    if (cleaned === null) data.keepAttr = false;
    else data.attrValue = cleaned;
  });
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.localName !== 'a') return;
    if (node.hasAttribute('href')) node.setAttribute('rel', 'noopener noreferrer');
    else node.removeAttribute('target');
  });
  purifiers.set(document, purifier);
  return purifier;
}
export function sanitizeBrowserHtml(html, document) {
  const fragment = purifierFor(document).sanitize(html, {
    ALLOWED_TAGS: [...HTML_TAGS],
    ALLOWED_ATTR: [...new Set([...HTML_GLOBAL_ATTRIBUTES, ...Object.values(HTML_TAG_ATTRIBUTES).flat()])],
    ALLOW_ARIA_ATTR: true, ALLOW_DATA_ATTR: false,
    FORBID_CONTENTS: [...HTML_DROP_CONTENT],
    RETURN_DOM_FRAGMENT: true, SANITIZE_DOM: true, SANITIZE_NAMED_PROPS: true
  });
  if (!fragment.hasChildNodes()) throw new Error('HTML 净化后没有可显示内容。');
  return fragment;
}
// Draw simple vector accents with trusted CSS instead of a font-dependent U+20D7.
// Keep the combining mark in the DOM for selection/copy, but never alter literal code blocks.
function enhanceVectors(surface, document) {
  const mark = () => {
    const node = document.createElement('span'); node.className = 'cui-html-vector-mark';
    node.textContent = '\u20d7'; node.setAttribute('aria-hidden', 'true'); return node;
  };
  const walker = document.createTreeWalker(surface, 4 /* SHOW_TEXT */), texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    if (text.parentElement.closest('pre,kbd,samp')) continue;
    const explicit = text.parentElement.closest('span.vector');
    const matches = [...text.data.matchAll(explicit ? /\u20d7/gu : /([\p{L}\p{N}]\p{M}*?)\u20d7/gu)];
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment(); let offset = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.data.slice(offset, match.index)));
      if (explicit) fragment.append(mark());
      else {
        const vector = document.createElement('span'); vector.className = 'vector';
        vector.append(document.createTextNode(match[1]), mark()); fragment.append(vector);
      }
      offset = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.data.slice(offset))); text.replaceWith(fragment);
  }
  for (const vector of surface.querySelectorAll('span.vector')) {
    if (vector.closest('pre,kbd,samp')) continue;
    const symbol = vector.textContent.replaceAll('\u20d7', '').trim();
    vector.setAttribute('role', 'img');
    if (!vector.hasAttribute('aria-label')) vector.setAttribute('aria-label', `向量 ${symbol}`);
    if (!vector.querySelector('.cui-html-vector-mark')) vector.append(mark());
  }
}
export function mountHtmlSurface(config, host, root) {
  validateHtmlView(config);
  const document = root.ownerDocument;
  const fragment = sanitizeBrowserHtml(config.html, document);
  const surface = document.createElement('article');
  surface.className = 'cui-html-surface';
  surface.append(fragment);
  enhanceVectors(surface, document);
  // Trusted wrappers are DOM operations after sanitation, never string re-parsing.
  for (const table of surface.querySelectorAll('table')) {
    const scroll = document.createElement('div'); scroll.className = 'cui-html-scroll';
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', table.querySelector('caption')?.textContent.trim() || '表格，可横向滚动');
    table.replaceWith(scroll); scroll.append(table);
  }
  for (const pre of surface.querySelectorAll('pre')) { pre.tabIndex = 0; pre.setAttribute('aria-label', '代码，可选择复制或横向滚动'); }
  const resize = () => host.onRenderComplete?.();
  surface.addEventListener('toggle', resize, true);
  root.append(surface); host.onRenderComplete?.();
  return { kind: 'html', destroy() { surface.removeEventListener('toggle', resize, true); } };
}
