import { writeFile, mkdir } from 'node:fs/promises';
import { fixtures, responseFor } from '../examples/rc-fixtures.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { responseText } from '../lib/response-normalization.mjs';
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

const directory = new URL('../../output/playwright/rich-document/rc/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, input] of Object.entries(fixtures)) {
 const normalized = normalizeDocument(input);
 const payloads = { 'input': input, 'response.input': responseFor(input), 'html.input': { contentId: input.contentId, html: staticHtml(normalized.view, normalized.view.callouts) } };
 for (const [suffix, payload] of Object.entries(payloads)) await writeFile(new URL(name + '.' + suffix + '.json', directory), JSON.stringify(payload));
}
console.log('Generated matched RC tool inputs; HTML is a static approximation, never equivalent interactive or MathML functionality.');
