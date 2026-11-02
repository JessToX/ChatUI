import { Marked } from 'marked';
import { compileDocumentInput, normalizeDocument } from '../lib/document-normalization.mjs';
import { normalizeResponse, responseText } from '../lib/response-normalization.mjs';
import { normalizeHtml } from '../lib/html-normalization.mjs';
import { documentFactories } from '../examples/documents.mjs';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function richHtml(nodes) {
  return nodes.map(n => {
    const children = () => richHtml(n.children || []);
    if (n.type === 'text') return escape(n.text);
    if (n.type === 'math') return `<${n.display ? 'pre' : 'code'}>${escape(n.tex)}</${n.display ? 'pre' : 'code'}>`;
    if (n.type === 'codeblock') return `<pre><code>${escape(n.text)}</code></pre>`;
    if (n.type === 'link') return `<a href="${escape(n.href)}">${children()}</a>`;
    const tag = n.type === 'heading' ? `h${n.level}` : n.type === 'list' ? n.ordered ? 'ol' : 'ul' : n.type === 'cell' ? n.header ? 'th' : 'td' : ({ paragraph: 'p', strong: 'strong', em: 'em', del: 's', blockquote: 'blockquote', item: 'li', table: 'table', row: 'tr', code: 'code', break: 'br', rule: 'hr' })[n.type];
    return `<${tag}>${n.text !== undefined ? escape(n.text) : children()}</${tag}>`;
  }).join('');
}
function staticHtml(view, callouts) {
  const blocks = values => values.map(b => {
    const heading = b.title ? `<h2>${escape(b.title)}</h2>` : '';
    if (b.kind === 'prose') return heading + richHtml(b.nodes);
    if (b.kind === 'group') return `<section${callouts[b.id] ? ` class="${callouts[b.id] === 'key' ? 'key-point' : callouts[b.id]}"` : ''}>${heading}${blocks(b.blocks)}</section>`;
    if (b.kind === 'collapse') return `<details><summary>${escape(b.summary)}</summary>${blocks(b.blocks)}</details>`;
    if (b.kind === 'tabs') return b.items.map(item => `<section><h3>${escape(item.label)}</h3>${blocks(item.blocks)}</section>`).join('');
    return heading + `<pre>${escape(responseText({ ...view, title: undefined, blocks: [b] }))}</pre>`;
  }).join('');
  return (view.title ? `<h1>${escape(view.title)}</h1>` : '') + blocks(view.blocks);
}
const size = value => ({ utf8Bytes: Buffer.byteLength(value), characters: [...value].length });

export function comparisonData() {
const rows = [];
for (const [id, factory] of Object.entries(documentFactories)) {
  const documentInput = factory(); const { response, callouts } = compileDocumentInput(documentInput);
  const normalized = normalizeDocument(documentInput); const structured = normalizeResponse(response);
  // Also disclose a verbose paragraph/block authoring baseline. Never hide the compact baseline.
  let serial = 0; const granular = blocks => blocks.flatMap(block => block.kind === 'prose'
    ? new Marked().lexer(block.text).filter(token => token.type !== 'space').map(token => ({ id: `part_${++serial}`, kind: 'prose', text: token.raw }))
    : block.blocks ? [{ ...block, blocks: granular(block.blocks) }] : block);
  const verboseInput = { ...response, blocks: granular(response.blocks) }; normalizeResponse(verboseInput);
  const htmlInput = { contentId: documentInput.contentId, html: staticHtml(structured.view, callouts) };
  const html = normalizeHtml(htmlInput);
  const payloads = { render_document: JSON.stringify(documentInput), render_response: JSON.stringify(response), render_response_granular: JSON.stringify(verboseInput), render_html_static: JSON.stringify(htmlInput) };
  rows.push({ id, documentInput, payloads, results: { structured, html }, source: size(documentInput.source), authoring: Object.fromEntries(Object.entries(payloads).map(([key, value]) => [key, size(value)])), ratioToCompactResponse: +(Buffer.byteLength(payloads.render_document) / Buffer.byteLength(payloads.render_response)).toFixed(4), ratioToGranularResponse: +(Buffer.byteLength(payloads.render_document) / Buffer.byteLength(payloads.render_response_granular)).toFixed(4), normalizedView: size(JSON.stringify(normalized.view)), canonicalChineseCharacters: id === 'teaching' ? (documentInput.source.match(/\p{Script=Han}/gu) || []).length : undefined });
}
return rows;
}
