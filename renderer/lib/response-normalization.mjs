import katex from 'katex';
import { Marked } from 'marked';
import { SaxesParser } from 'saxes';
import { validateMath } from './component-validation.mjs';
import { resolveExplanation } from './explanation-validation.mjs';
import { validateResponseInput, validateResponseView, safeResponseUrl } from './response-validation.mjs';
import { responseText } from './response-text.mjs';
export { mathText, responseText } from './response-text.mjs';

const parser = new Marked({ gfm: true, breaks: false, extensions: [
  { name: 'displayMath', level: 'block', start: src => src.search(/\$\$|\\\[/), tokenizer(src) {
    const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n|$)/.exec(src);
    if (match) return { type: 'displayMath', raw: match[0], tex: (match[1] ?? match[2]).trim() };
  } },
  { name: 'inlineMath', level: 'inline', start: src => src.search(/\$|\\\(/), tokenizer(src) {
    const match = /^(?:\$((?:\\.|[^$\\\n])+)\$(?!\d)|\\\(([^\n]+?)\\\))/.exec(src);
    const tex = match?.[1] ?? match?.[2];
    if (match && tex === tex.trim()) return { type: 'inlineMath', raw: match[0], tex };
  } }
] });

// Parse only KaTeX's generated XML, never author-supplied HTML/MathML strings.
// No DOM innerHTML, external entities, CSS, scripts, images or network requests.
export function compileTex(tex, display = true) {
  if (typeof tex !== 'string' || !tex.trim() || tex.length > 2400) throw new Error('TeX 应为 1–2400 字符。');
  if (/\\(?:href|url|includegraphics|html\w*|style|class|cssId|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|global|require|input|include|color|textcolor|colorbox|fcolorbox)\b/i.test(tex)) throw new Error('TeX 不允许链接、HTML、样式、加载命令或宏定义。');
  let source;
  try { source = katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: true, trust: false, strict: 'error', maxExpand: 128, maxSize: 4, macros: {}, globalGroup: false }); }
  catch (cause) { throw Object.assign(new Error('TeX 公式无效或超出安全限制，请简化公式后重试。', { cause }), { stage: 'katex' }); }
  if (source.length > 64000) throw new Error('公式展开后过大。');
  const xml = new SaxesParser({ xmlns: false }); const stack = [], roots = [];
  xml.on('doctype', () => { throw new Error('不允许 XML 文档类型。'); });
  xml.on('opentag', node => {
    const entry = { tag: node.name, attrs: node.attributes, children: [] };
    (stack.at(-1)?.children ?? roots).push(entry); stack.push(entry);
  });
  xml.on('text', text => { if (stack.length) stack.at(-1).children.push(text); });
  xml.on('closetag', () => stack.pop());
  xml.on('error', () => { throw new Error('生成的公式结构无效。'); });
  xml.write(source).close();
  const convert = node => {
    if (typeof node === 'string') return { tag: 'mtext', text: node };
    if (node.tag === 'annotation') return null;
    const children = node.children.map(convert).filter(Boolean);
    if (['span', 'math', 'semantics'].includes(node.tag)) {
      if (children.length !== 1) throw new Error('生成的公式根节点无效。');
      return children[0];
    }
    const result = { tag: node.tag };
    if (Object.keys(node.attrs).length) result.attrs = { ...node.attrs };
    if (node.children.every(child => typeof child === 'string')) result.text = node.children.join('');
    else if (children.length) result.children = children;
    return result;
  };
  const result = convert(roots[0]); validateMath(result); return result;
}

function markdownNodes(text, compile) {
  const transform = tokens => tokens.flatMap(token => {
    const child = () => transform(token.tokens || []);
    switch (token.type) {
      case 'space': return [];
      case 'text': case 'escape': return token.tokens ? child() : [{ type: 'text', text: token.text }];
      case 'html': return [{ type: 'text', text: token.raw }];
      case 'paragraph': return [{ type: 'paragraph', children: child() }];
      case 'heading': return [{ type: 'heading', level: Math.min(token.depth, 4), children: child() }];
      case 'strong': case 'em': case 'del': case 'blockquote': return [{ type: token.type, children: child() }];
      case 'codespan': return [{ type: 'code', text: token.text }];
      case 'code': return [{ type: 'codeblock', text: token.text, ...(token.lang ? { language: token.lang.split(/\s/)[0].slice(0, 40) } : {}) }];
      case 'br': return [{ type: 'break' }];
      case 'hr': return [{ type: 'rule' }];
      case 'link': return safeResponseUrl(token.href) ? [{ type: 'link', href: token.href, children: child() }] : child();
      case 'image': {
        const children = [{ type: 'text', text: `图片来源：${token.text || '未命名图片'}（未自动加载）` }];
        return safeResponseUrl(token.href) ? [{ type: 'link', href: token.href, children }] : children;
      }
      case 'list': return [{ type: 'list', ordered: !!token.ordered, start: token.ordered ? Math.min(9999, Math.max(1, Number(token.start) || 1)) : 1, children: token.items.map(item => ({ type: 'item', children: [...(item.task ? [{ type: 'text', text: item.checked ? '已完成：' : '未完成：' }] : []), ...transform(item.tokens)] })) }];
      case 'table': return [{ type: 'table', children: [token.header, ...token.rows].map((row, i) => ({ type: 'row', children: row.map(cell => ({ type: 'cell', header: i === 0, children: transform(cell.tokens) })) })) }];
      case 'inlineMath': case 'displayMath': return [{ type: 'math', tex: token.tex, display: token.type === 'displayMath', math: compile(token.tex, token.type === 'displayMath') }];
      default: throw new Error(`不支持的 Markdown 节点：${token.type}。`);
    }
  });
  return transform(parser.lexer(text));
}

export function normalizeResponse(input, { resolveFacts = true, mathFallback = false } = {}) {
  validateResponseInput(input, { resolveFacts });
  const resolved = resolveFacts ? resolveExplanation(input) : input;
  let mathCount = 0;
  const mathDiagnostics = [];
  const compile = (tex, display = true) => {
    if (++mathCount > 64) throw new Error('一轮回答最多 64 个 TeX 公式，请分段讲解。');
    // Limits and forbidden commands remain fail-closed. Only a bounded formula
    // that fails compilation gets a literal, non-executable document fallback.
    try { return compileTex(tex, display); }
    catch (error) {
      if (!mathFallback || typeof tex !== 'string' || !tex.trim() || tex.length > 2400 || /\\(?:href|url|includegraphics|html\w*|style|class|cssId|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|global|require|input|include|color|textcolor|colorbox|fcolorbox)\b/i.test(tex)) throw error;
      mathDiagnostics.push({ index: mathCount, stage: error.stage || 'mathml-validation', reason: String(error.cause?.message || error.message).slice(0, 500) });
      return { tag: 'mtext', text: `公式排版失败，保留 TeX：${tex}` };
    }
  };
  const componentData = (type, data) => {
    const formulaRecord = value => {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'tex')) return value;
      if (Object.hasOwn(value, 'math')) throw new Error('同一公式不能同时提供 tex 与 math。');
      const { tex, ...rest } = value;
      return { ...rest, math: compile(tex), mathLabel: rest.mathLabel || tex };
    };
    const output = type === 'answer' ? formulaRecord(data)
      : ['comparison', 'timeline', 'steps', 'reveal-steps'].includes(type) && Array.isArray(data.items)
        ? { ...data, items: data.items.map(formulaRecord) } : data;
    const rejectUnusedTex = value => {
      if (!value || typeof value !== 'object') return;
      if (Object.hasOwn(value, 'tex')) throw new Error('tex 仅用于 answer 或 comparison/timeline/steps/reveal-steps 的公式字段。');
      Object.values(value).forEach(rejectUnusedTex);
    };
    rejectUnusedTex(output); return output;
  };
  const blocks = values => values.map(block => {
    const common = { id: block.id, ...(block.title ? { title: block.title } : {}) };
    switch (block.kind) {
      case 'prose': { const { text, ...rest } = block; return { ...rest, nodes: markdownNodes(text, compile) }; }
      case 'heading': return { ...common, kind: 'prose', nodes: [{ type: 'heading', level: block.level ?? 2, children: [{ type: 'text', text: block.text }] }] };
      case 'list': return { ...common, kind: 'prose', nodes: [{ type: 'list', ordered: !!block.ordered, start: 1, children: block.items.map(item => ({ type: 'item', children: markdownNodes(item, compile) })) }] };
      case 'quote': return { ...common, kind: 'prose', nodes: [{ type: 'blockquote', children: markdownNodes(block.text, compile) }, ...(block.citation ? [{ type: 'paragraph', children: [{ type: 'text', text: `— ${block.citation}` }] }] : [])] };
      case 'code': return { ...common, kind: 'prose', nodes: [{ type: 'codeblock', text: block.code, ...(block.language ? { language: block.language } : {}) }] };
      case 'math': return block.tex ? { ...block, math: compile(block.tex) } : block;
      case 'component': return { ...block, data: componentData(block.type, block.data) };
      case 'group': case 'collapse': return { ...block, blocks: blocks(block.blocks) };
      case 'tabs': return { ...block, items: block.items.map(item => ({ ...item, blocks: blocks(item.blocks) })) };
      default: return block;
    }
  });
  const view = { ...resolved, viewVersion: 1, blocks: blocks(resolved.blocks) };
  validateResponseView(view);
  return { view, text: responseText(view), ...(mathFallback ? { mathDiagnostics } : {}) };
}
