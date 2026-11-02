import { TYPES, inspect } from './component-validation.mjs';
import { normalizeResponse } from './response-normalization.mjs';
import { DOCUMENT_LIMITS as LIMITS, DOCUMENT_TONES, validateDocumentView } from './document-validation.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const keys = (value, allowed, label) => check(object(value) && Object.keys(value).every(key => allowed.includes(key)), `${label} 包含不受支持的字段。`);
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
// Remove separator lines without erasing Markdown's meaningful indentation.
const trimBlankLines = value => value.trim() ? value.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '') : '';
// Stable content identity, not authentication or a cryptographic integrity claim.
export function documentFingerprint(value) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return [a, b].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
const componentFields = {
  'input-form': ['fields', 'submitLabel', 'resetLabel', 'note'],
  progress: ['total', 'value', 'label', 'unit', 'stages', 'details', 'note'],
  profile: ['eyebrow', 'name', 'subtitle', 'tags', 'summary'],
  comparison: ['items', 'note'], steps: ['items', 'note'], timeline: ['items', 'note'],
  'reveal-steps': ['items', 'initialVisible', 'note'], rhythm: ['items', 'note'],
  quiz: ['questions', 'followUp', 'note'], 'line-chart': ['xLabel', 'yLabel', 'seriesLabel', 'points', 'xUnit', 'yUnit', 'note'],
  'force-diagram': ['mode', 'body', 'unit', 'forces', 'axisAngle', 'note'],
  'motion-lab': ['initialVelocity', 'acceleration', 'duration', 'time', 'unit'], geometry: ['radius', 'heightRatio', 'unit'],
  answer: ['label', 'title', 'detail', 'tex', 'mathLabel', 'tone'],
  'data-table': ['columns', 'rows', 'filterLabel', 'note'], 'media-panel': ['items', 'note']
};
const itemFields = {
  comparison: ['label', 'title', 'detail', 'tex', 'mathLabel', 'tone'],
  steps: ['title', 'detail', 'date', 'status', 'tex', 'mathLabel', 'tone'],
  timeline: ['title', 'detail', 'date', 'status', 'tex', 'mathLabel', 'tone'],
  'reveal-steps': ['title', 'detail', 'tex', 'mathLabel', 'tone'], rhythm: ['label', 'emphasis'],
  'media-panel': ['title', 'body', 'alt', 'sourceLabel', 'sourceUrl', 'caption', 'credit']
};
function strictComponent(type, data) {
  keys(data, componentFields[type], type);
  const optionalStrings = ['note', 'label', 'unit', 'eyebrow', 'subtitle', 'summary', 'followUp', 'xUnit', 'yUnit', 'filterLabel', 'mathLabel', 'detail'];
  for (const field of optionalStrings) if (data[field] !== undefined) check(text(data[field], 6000), `${type}.${field} 需要有界文本。`);
  if (data.tone !== undefined) check(['blue', 'green', 'orange', 'neutral'].includes(data.tone), '组件 tone 无效。');
  if (Array.isArray(data.items)) for (const item of data.items) {
    for (const field of ['title', 'detail', 'date', 'status', 'mathLabel', 'caption', 'credit']) if (item[field] !== undefined) check(text(item[field], 6000), `${type}.items.${field} 需要有界文本。`);
    if (item.tone !== undefined) check(['blue', 'green', 'orange', 'neutral'].includes(item.tone), '组件 tone 无效。');
  }
  if (itemFields[type] && Array.isArray(data.items)) data.items.forEach(item => keys(item, itemFields[type], `${type}.items`));
  const records = (items, fields, label) => { if (items !== undefined) { check(Array.isArray(items), `${label} 需要数组。`); items.forEach(item => keys(item, fields, label)); } };
  if (type === 'quiz') {
    records(data.questions, ['id', 'prompt', 'options', 'correct', 'explanation'], 'quiz.questions');
    for (const q of data.questions || []) { records(q.options, ['id', 'label'], 'quiz.options'); check(text(q.explanation, 6000), 'quiz 需要提交后的解释。'); }
  }
  if (type === 'line-chart') records(data.points, ['x', 'y'], 'chart.points');
  if (type === 'data-table') {
    records(data.columns, ['key', 'label', 'type'], 'table.columns'); records(data.rows, ['id', 'values'], 'table.rows');
    for (const row of data.rows || []) keys(row.values, (data.columns || []).map(col => col.key), 'table.values');
  }
  // MathML is server-generated; no alternate author-supplied object vocabulary.
  const noObjects = value => {
    if (!object(value) && !Array.isArray(value)) return;
    check(!Object.hasOwn(value, 'math') && !Object.hasOwn(value, 'fact'), '文档仅接受 TeX 和直接事实数据。');
    Object.values(value).forEach(noObjects);
  };
  noObjects(data); inspect(data);
}

// Line-oriented directives. Code fences shield their contents, including :::.
export function lexDocument(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n'); const segments = [];
  let buffer = [], fence = null, count = 0;
  const flush = () => { const body = trimBlankLines(buffer.join('\n')); if (body.trim()) segments.push({ type: 'markdown', body }); buffer = []; };
  const codeFence = line => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  const fenceStep = line => {
    const match = codeFence(line);
    if (fence) { if (match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = null; return true; }
    if (match) { fence = { char: match[1][0], length: match[1].length }; return true; }
    return false;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceStep(line) || !line.startsWith(':::')) { buffer.push(line); continue; }
    flush();
    const startLine = i + 1, header = /^:::([a-z][a-z-]*)\s+(\{.*)$/.exec(line);
    check(header, `第 ${startLine} 行：指令需要 :::type {JSON}，或出现了多余结束符。`);
    check(++count <= LIMITS.directives, `最多 ${LIMITS.directives} 个指令。`);
    let json = header[2], balance = 0, quoted = false, escaped = false, consumed = 0;
    while (true) {
      for (; consumed < json.length; consumed++) {
        const ch = json[consumed];
        if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
        else if (ch === '"') quoted = true; else if (ch === '{' || ch === '[') balance++; else if (ch === '}' || ch === ']') balance--;
      }
      if (balance <= 0 && !quoted) break;
      check(i + 1 < lines.length && !lines[i + 1].startsWith(':::'), `第 ${startLine} 行：JSON 未闭合。`);
      json += '\n' + lines[++i];
      check(json.length <= 12000, '指令 JSON 超过 12000 字符。');
    }
    check(json.length <= 12000, '指令 JSON 超过 12000 字符。');
    let options;
    try { options = JSON.parse(json); } catch { throw new Error(`第 ${startLine} 行：指令 JSON 无效。`); }
    check(object(options), `第 ${startLine} 行：选项需要 JSON 对象。`); inspect(options);
    const body = []; let closed = false;
    while (++i < lines.length) {
      if (fenceStep(lines[i])) { body.push(lines[i]); continue; }
      if (lines[i] === ':::') { closed = true; break; }
      check(!lines[i].startsWith(':::'), `第 ${i + 1} 行：v1 不支持指令嵌套。`);
      body.push(lines[i]);
    }
    check(closed, `第 ${startLine} 行：指令缺少 ::: 结束符。`);
    segments.push({ type: header[1], options, body: trimBlankLines(body.join('\n')), line: startLine });
  }
  flush(); return segments;
}

export function compileDocumentInput(input) {
  keys(input, ['contentId', 'source', 'title', 'theme'], 'render_document');
  check(text(input.contentId, 200) && (input.title === undefined || text(input.title, 200)), '文档需要有效 contentId 和可选标题。');
  check(input.theme === undefined || input.theme === 'native', '文档主题仅支持 native。');
  check(text(input.source, LIMITS.sourceCharacters) && new TextEncoder().encode(input.source).length <= LIMITS.sourceBytes, '文档 source 为空或超过 32768 字符 / 65536 UTF-8 字节。');
  const segments = lexDocument(input.source), used = new Map(), explicitKeys = new Set(), callouts = {};
  let componentCount = 0;
  const identity = (type, content, key) => {
    if (key !== undefined) { check(text(key, 80) && !explicitKeys.has(key), '显式 key 需要有效且全局唯一。'); explicitKeys.add(key); }
    const base = `d_${documentFingerprint(`${type}:${key ?? ''}:${JSON.stringify(content)}`)}`;
    const occurrence = used.get(base) || 0; used.set(base, occurrence + 1); return `${base}_${occurrence}`;
  };
  const prose = body => { check(text(body, LIMITS.proseCharacters), '每段连续 Markdown 需要 1–12000 字符；可使用指令或分开回答。'); return { id: identity('prose', body), kind: 'prose', text: body }; };
  const blocks = segments.map(segment => {
    if (segment.type === 'markdown') return prose(segment.body);
    const { key, ...options } = segment.options; const id = identity(segment.type, { options, body: segment.body }, key);
    if (segment.type === 'callout') {
      keys(options, ['tone', 'title'], 'callout'); check(options.tone === undefined || DOCUMENT_TONES.includes(options.tone), 'callout tone 仅支持 key/note/warning/success。');
      callouts[id] = options.tone || 'note';
      return { id, kind: 'group', layout: 'stack', ...(options.title !== undefined ? { title: options.title } : {}), blocks: [prose(segment.body)] };
    }
    if (segment.type === 'collapse') { keys(options, ['summary', 'open'], 'collapse'); return { id, kind: 'collapse', ...options, blocks: [prose(segment.body)] }; }
    check(!segment.body, `${segment.type} 只接受 JSON 数据，不能附带正文。`);
    if (segment.type === 'tabs') {
      keys(options, ['items'], 'tabs'); check(Array.isArray(options.items), 'tabs 需要 items。');
      return { id, kind: 'tabs', items: options.items.map((item, index) => {
        keys(item, ['label', 'body'], 'tabs.items');
        check(text(item.body, LIMITS.proseCharacters) && lexDocument(item.body).every(segment => segment.type === 'markdown'), 'tabs body 仅接受有界 Markdown。');
        return { id: `tab_${index}`, label: item.label, blocks: [prose(item.body)] };
      }) };
    }
    if (segment.type === 'diagram') { keys(options, ['title', 'description', 'viewBox', 'elements', 'states', 'initialState'], 'diagram'); check(++componentCount <= LIMITS.components, '文档最多 24 个视觉组件。'); return { ...options, id, kind: 'diagram' }; }
    check(TYPES.includes(segment.type) && componentFields[segment.type], `不支持的文档指令：${segment.type}。`);
    check(++componentCount <= LIMITS.components, '文档最多 24 个视觉组件。'); strictComponent(segment.type, options);
    return { id, kind: 'component', type: segment.type, data: options };
  });
  return { response: { schemaVersion: 1, contentId: input.contentId, ...(input.title ? { title: input.title } : {}), facts: {}, blocks }, callouts };
}
export function normalizeDocument(input) {
  const { response, callouts } = compileDocumentInput(input);
  const { view: responseView, text, mathDiagnostics } = normalizeResponse(response, { resolveFacts: false, mathFallback: true });
  const view = { ...responseView, mode: 'document', documentVersion: 1, sourceHash: documentFingerprint(input.source), callouts };
  validateDocumentView(view); return { view, text, mathDiagnostics };
}
