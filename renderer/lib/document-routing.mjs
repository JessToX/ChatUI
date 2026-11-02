// Enabled only by the isolated test entrypoint, pending production approval.
export const DOCUMENT_ROUTING_INSTRUCTIONS = 'Short/simple replies, exact translations and explicit plain text/Markdown stay native. Prefer render_document for substantial explanations, analysis, comparisons and project organization: one finalized ChatUI Rich Markdown v1 call, one unified surface, no duplicate full native body. Prepare the answer body inside source; do not publish a substantial native explanation before calling the tool. After success, native output contains only required citations/files or a short acknowledgement, never another summary, table or formula block of the same answer. Natural follow-ups inherit the latest confirmed conditions and produce a new complete snapshot when those conditions change. Most content may be ordinary prose. Directives use strict JSON, safe TeX and supplied facts only; never invent totals, dates, statuses, relationships or quiz keys. A standalone specialist interaction may use render_response/render_component/render_incline_forces. For a chart of supplied numeric data, use the data-backed line-chart component in render_document or a structured tool, never an image-generation tool or a static image substitute. For a quiz, use real clickable options and submission-based grading, not a static answer list. render_html is a compatibility/special semantic-document route; render_response is a compatibility/advanced structured route. No raw HTML/JS/CSS execution in Rich Markdown. Correct malformed arguments at most once; if unavailable or still failing, provide the complete native answer. Preserve native citations and attachments. Changed conditions require a new contentId. No streaming, append or polling.';
export function documentRoutingTools(tools) {
  const descriptions = {
    render_html: 'Compatibility/special document route for safe semantic HTML. Prefer render_document for substantial mixed prose/math/components. Short/simple or explicit plain text/Markdown stays native. Existing safe HTML contract and complete fallback remain unchanged.',
    render_response: 'Compatibility/advanced structured route and standalone specialist interaction. Supplied numeric charts use the line-chart component here or in render_document, not image generation. Prefer render_document for substantial mixed prose/math/components. Existing strict component contracts, safe TeX, state isolation and complete fallback remain unchanged.',
    render_component: 'Compatibility entry for one standalone mature interaction. Prefer render_document for substantial surrounding explanations. Use real supplied data; retain the existing validated input contract.',
    render_explanation: 'Compatibility entry for stored explanations and existing diagram primitives. Prefer render_document for substantial new mixed explanations. Existing input contract remains unchanged.'
  };
  return tools.map(tool => descriptions[tool.name] ? { ...tool, description: descriptions[tool.name] } : tool);
}
export const documentRoutingCases = [
  { prompt: '这个结果是不是 11/3？', expected: 'native' },
  { prompt: '重新解释为什么这个 u substitution 要这样找。', expected: 'render_document' },
  { prompt: '帮我梳理这道 related rates 题。', expected: 'render_document' },
  { prompt: '比较 Romanesque 和 Gothic 的结构区别。', expected: 'render_document' },
  { prompt: '把这段文字直接翻译成中文，不要分析。', expected: 'native' },
  { prompt: '整理这个项目目前进度。', expected: 'render_document' },
  { prompt: '考我五题。', expected: 'render_document or standalone quiz' },
  { prompt: '画这个速度时间图。', expected: 'render_document or standalone chart' },
  { prompt: '只用纯 Markdown。', expected: 'native' },
  { prompt: '用 ChatUI 好好讲一下。', expected: 'render_document' }
];
