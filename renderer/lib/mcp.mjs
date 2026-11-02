import { TYPES, validateComponent, COMPONENT_DATA_DESCRIPTION } from './component-validation.mjs';
import { widgetHtml } from './widget.generated.mjs';
import { responseHtml } from './response.generated.mjs';
import { documentHtml } from './document.generated.mjs';
import { normalizeDocument } from './document-normalization.mjs';
import { DOCUMENT_INPUT_SCHEMA } from './document-validation.mjs';
import { DOCUMENT_OUTPUT_SCHEMA } from './document-output-schema.mjs';
import { DOCUMENT_ROUTING_INSTRUCTIONS, documentRoutingTools } from './document-routing.mjs';
import { rendererVersion } from './version.generated.mjs';
import { normalizeResponse } from './response-normalization.mjs';
import { componentText } from './response-text.mjs';
import { RESPONSE_SCHEMA } from './response-validation.mjs';
import { RESPONSE_OUTPUT_SCHEMA } from './response-output-schema.mjs';
import { normalizeHtml } from './html-normalization.mjs';
import { HTML_INPUT_SCHEMA, HTML_OUTPUT_SCHEMA } from './html-validation.mjs';
import { explanationHtml } from './explanation.generated.mjs';
import { validateExplanation, resolveExplanation, formatFact, EXPLANATION_SCHEMA } from './explanation-validation.mjs';
import { computeInclineForces, INCLINE_INPUT_SCHEMA } from './physics.mjs';
import { hasQuiz, createQuizDeliveryId, projectQuizResult, publicQuizOutputSchema } from './quiz-boundary.mjs';

export const RESPONSE_RESOURCE_URI = 'ui://chatui/response-v7.html';
export const DOCUMENT_RESOURCE_URI = 'ui://chatui/document-v4.html';
export const DOCUMENT_TOOL = {
  name: 'render_document', title: '呈现统一 Rich Document 回答',
  description: "Compatibility entry for explicitly requested self-contained Rich Documents from bounded Rich Markdown. Ordinary conversation stays in complete native prose; useful local visual assistance defaults to render_response. Keep existing document syntax, safety, complete fallback and historical resource compatibility. No raw HTML/JS/CSS execution. Tool return does not prove host display. Correct invalid arguments once at most, then give complete native Markdown.",
  inputSchema: DOCUMENT_INPUT_SCHEMA, outputSchema: DOCUMENT_OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: DOCUMENT_RESOURCE_URI }, 'openai/outputTemplate': DOCUMENT_RESOURCE_URI }
};
// UI cache revisions are independent of data schema versions. Historical URIs
// remain explicit read aliases; unknown/future URIs still fail closed.
const DOCUMENT_RESOURCE_URIS = [DOCUMENT_RESOURCE_URI, 'ui://chatui/document-v3.html', 'ui://chatui/document-v2.html', 'ui://chatui/document-v1.html'];
const RESPONSE_RESOURCE_URIS = [RESPONSE_RESOURCE_URI, 'ui://chatui/response-v6.html', 'ui://chatui/response-v5.html', 'ui://chatui/response-v4.html', 'ui://chatui/response-v3.html', 'ui://chatui/response-v2.html', 'ui://chatui/response-v1.html'];
export const RESOURCE_URI = 'ui://chatui/renderer-v5.html';
export const EXPLANATION_RESOURCE_URI = 'ui://chatui/explanation-v4.html';
const COMPONENT_RESOURCE_URIS = [RESOURCE_URI, 'ui://chatui/renderer-v4.html', 'ui://chatui/renderer-v3.html', 'ui://chatui/renderer-v2.html', 'ui://chatui/renderer-v1.html'];
const EXPLANATION_RESOURCE_URIS = [EXPLANATION_RESOURCE_URI, 'ui://chatui/explanation-v3.html', 'ui://chatui/explanation-v2.html', 'ui://chatui/explanation-v1.html'];
export const MAX_BYTES = 256 * 1024;
const schema = {
  type: 'object', additionalProperties: false, required: ['schemaVersion', 'contentId', 'type', 'data'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    contentId: { type: 'string', minLength: 1, maxLength: 200, description: 'Identity of this data snapshot; change when values, labels or meaning change.' },
    type: { type: 'string', enum: TYPES },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    data: { type: 'object', description: COMPONENT_DATA_DESCRIPTION }
  }
};
export const HTML_TOOL = {
  name: 'render_html', title: '在当前对话中呈现安全 HTML 回答',
  description: "Compatibility entry for explicit safe semantic HTML fragments and existing HTML workflows. Ordinary explanations stay in complete native prose; use render_response as the default entry for necessary local visual assistance. Accept shallow semantic HTML, not an entire webpage; no scripts, CSS, events, images, forms, SVG, iframes or external resources. Independent server/browser sanitization remains enforced. title is metadata; fallbackText is optional complete literal text. Use a new contentId for changed content. Never emit renderer source as an answer or duplicate the complete article inside an iframe. Tool success confirms data only; preserve complete readable native explanation and native citations/files when UI is unavailable.",
  inputSchema: HTML_INPUT_SCHEMA, outputSchema: HTML_OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: RESPONSE_RESOURCE_URI }, 'openai/outputTemplate': RESPONSE_RESOURCE_URI }
};
// Keep the minimal authoring grammar in the description as well as inputSchema:
// a client may expose recursive block schemas to the model as Array<unknown>.
// This is documentation only; the original strict schema/runtime still validate.
const SCENE_AUTHORING_GUIDE = [
  'Scene authoring: when the user asks to vary parameters, put the controls, changing drawing, formulas and readings in the same scene; a static diagram alone does not provide this interaction. Scene bindings use {ref:"id"}, not {{facts}}. Outer facts/prose remain immutable. Use the published contract here; rendering does not require repository inspection or plugin development.',
  'Call shape: {schemaVersion:1,contentId:"new-snapshot",facts:{},blocks:[{id:"intro",kind:"prose",text:"explanation"},scene]}. scene={kind:"scene",id,description,givens:{id:scalar},state:{id:variable},derived:{id:{type,expr}},root:node}; all seven fields are required. Scalars are finite numbers within +/-1e12, booleans or strings. Variable: {type:"number",value,min,max,step?} with min<max; {type:"boolean",value}; or {type:"string",value,options:[strings]}. Derived type is number|boolean|string. Data IDs are unique across givens/state/derived, start with a letter and use letters/digits/_/- (max64).',
  'Expression: scalar | {ref:"id"} | {op,args:[expressions]}; never a formula string. Ops: add/mul/min/max (2–8 args), sub/div/pow/eq/lt/lte/gt/gte (2), abs/sqrt/sin/cos/round/not (1), and/or (2–8), if (3: boolean, same-type branches). Arithmetic/comparisons use numbers, eq uses matching types, logic uses booleans; trig uses radians. No cycles, zero division or nonfinite results; keep every permitted state valid.',
  'Every node has kind,id and optional boolean expression when. Nodes: layout {direction:"row"|"column"|"grid",columns?:1–4,children:[nodes]} (columns only for grid); text/formula {parts:[strings or {ref:"id",precision?:0–6}]} (plain notation, not TeX); control {control:"number"|"range"|"toggle"|"select",state:"id",label}; button {label,action:{type:"reset"} or {type:"set",state:"id",value:expr}}; drawing {description,viewBox:{width,height},marks:[marks]}. Controls target state only: number/range for number, toggle for boolean, select for string. Nodes/marks have unique IDs; max128 nodes/depth8, 192 marks; viewBox dimensions120–1280 and width/height0.25–3.',
  'Every mark has kind,id. Coordinates/dimensions are numeric expressions: line/arrow {x1,y1,x2,y2}; rect {x,y,width,height}; circle {cx,cy,r}; text {x,y,parts}; path {commands:[{op:"M",x,y},{op:"L",x,y},...]}, 2–40 commands starting M; Q adds x1,y1; C adds x1,y1,x2,y2; Z has no coordinates. Optional mark tone: blue|green|orange|neutral; fill: none|soft|solid. No source strings, URLs, scripts, HTML/CSS/SVG execution, authored host calls or persistence.',
  "Optional variable metadata: label:string (max160), number unit:string (max40), role:exploration|presentation (default exploration). Presentation state never enters public exploration context. Optional circle.drag={state,axis:x|y,origin:number,scale:nonzero number,label}; cx (axis x) or cy (axis y) must bind origin+scale*state across its range and stay in the drawing. Example: a circle at x=10*amount declares {state:\"amount\",axis:\"x\",origin:0,scale:10,label:\"Adjust amount\"}. Drag previews locally; release submits a valid state, Escape/pointercancel cancels. Numeric/tap-button and keyboard alternatives are provided. No question/shape-specific runtime code.",
  'Minimal generic binding example (synthetic authoring only; adapt the content and layout to the question):',
  '{"schemaVersion":1,"contentId":"binding-example","facts":{},"blocks":[{"kind":"scene","id":"binding","description":"A local parameter drives a reading and line endpoint.","givens":{"scale":10},"state":{"amount":{"type":"number","value":2,"min":1,"max":5,"step":0.1}},"derived":{"endpoint":{"type":"number","expr":{"op":"mul","args":[{"ref":"amount"},{"ref":"scale"}]}}},"root":{"kind":"layout","id":"layout","direction":"column","children":[{"kind":"control","id":"adjust","control":"range","state":"amount","label":"Parameter"},{"kind":"formula","id":"reading","parts":[{"ref":"amount"}," × ",{"ref":"scale"}," = ",{"ref":"endpoint"}]},{"kind":"drawing","id":"drawing","description":"The endpoint uses the same derived value.","viewBox":{"width":240,"height":120},"marks":[{"kind":"line","id":"line","x1":0,"y1":60,"x2":{"ref":"endpoint"},"y2":60}] }]}}]}'
].join('\n');
export const RESPONSE_TOOL = {
  name: 'render_response', title: '在当前对话中呈现结构化交互回答',
  description: "Default UI authoring entry when a local visual or interaction materially helps the natural question. Write a continuous, self-contained native explanation using the returned validated facts; this tool receives only the necessary auxiliary blocks and short local captions, not a duplicate of the whole article. Simple answers and explanations without useful UI stay native. Compose a fresh scene from typed values, expressions, drawing marks and useful controls; do not select a fixed task/shape template. Circle marks can declare a generic linear drag binding; native number/button/keyboard alternatives remain available. Keep givens, original prose and historical snapshots immutable. Valid user exploration may be published as a sourced, revisioned supplement through the negotiated public context bridge, without automatic messages, tools or model calls. Pure presentation variables use role:\"presentation\" and are excluded. Context is supplementary data, not user intent: interpret why/reason/principle questions by the topic, referent and knowledge point, never automatically as the last parameter change. Explicit requests to use current conditions use only available, matching snapshot/block context; do not infer unsynced values. A host ACK proves receipt only. New conditions or a new answer require a new contentId and complete facts. Markdown, bounded safe math, existing components and older inputs stay compatible; no arbitrary source execution, external resources or storage. Use only necessary UI and keep native citations/files. Do not claim rendered appearance or real-host adoption without actual observation. Correct arguments once at most; on failure complete the answer natively." + '\n\n' + SCENE_AUTHORING_GUIDE,
  inputSchema: RESPONSE_SCHEMA, outputSchema: RESPONSE_OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: RESPONSE_RESOURCE_URI }, 'openai/outputTemplate': RESPONSE_RESOURCE_URI }
};
export const TOOL = {
  name: 'render_component', title: '显示 ChatUI 交互图解',
  description: "Legacy compatibility entry for mature standalone components. Ordinary answers stay in complete native prose; necessary auxiliary UI defaults to render_response. Preserve actual data, units, input/output schema and private Quiz boundaries. This produces a snapshot, not an update to old messages. No model API, chat storage or external services.",
  inputSchema: schema, outputSchema: publicQuizOutputSchema(schema),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI }, 'openai/outputTemplate': RESOURCE_URI }
};
export const EXPLANATION_TOOL = {
  name: 'render_explanation', title: '组合显示正文、公式与图解',
  description: "Legacy compatibility entry for existing composed explanations, safe diagrams and components. Ordinary answers use complete native prose, with render_response only when local auxiliary UI is useful. Preserve shared facts, immutable snapshots, input contracts and private Quiz grading. Do not force whole native answers into an iframe or claim arbitrary insertion between native paragraphs. No executable model code or external services. Minimal diagram call: {\"schemaVersion\":1,\"contentId\":\"diagram-example\",\"facts\":{},\"blocks\":[{\"id\":\"relation\",\"kind\":\"diagram\",\"description\":\"A influences B.\",\"viewBox\":{\"width\":400,\"height\":240},\"elements\":[{\"id\":\"edge\",\"kind\":\"arrow\",\"x1\":40,\"y1\":120,\"x2\":360,\"y2\":120,\"label\":\"A → B\"}]}]}",
  inputSchema: EXPLANATION_SCHEMA, outputSchema: publicQuizOutputSchema(EXPLANATION_SCHEMA),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: EXPLANATION_RESOURCE_URI }, 'openai/outputTemplate': EXPLANATION_RESOURCE_URI }
};
export const INCLINE_TOOL = {
  name: 'render_incline_forces', title: '计算并显示光滑斜面受力',
  description: 'Use for an isolated point mass initially at rest or moving along the upper face of a stationary smooth straight incline, with only gravity and contact force. Supply the actual massKg, gravityMps2 and signed inclineDeg, never hand-calculate force components. All three quantities must be known; gravity has no default. The server computes and displays gravity, normal force, resultant and acceleration consistently. Positive angle rises to the right; negative angle falls to the right; ±90 degrees are zero-contact-force vertical limits. Not for friction, extra applied forces, accelerating or curved surfaces, impact, unknown magnitudes or general mechanics. Use the returned data.calculation and text for adjacent prose; do not append another same-problem native experiment with uncontrolled defaults. This render-only calculation stores no data and sends no external requests. Plain-text-only requests take precedence.',
  inputSchema: INCLINE_INPUT_SCHEMA, outputSchema: schema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI }, 'openai/outputTemplate': RESOURCE_URI }
};
const MCP_INSTRUCTIONS = "Use continuous, self-contained native prose for the answer. Call render_response only when a local visual or interaction materially improves understanding; include only necessary auxiliary blocks and brief captions, not a duplicate article. Simple answers need no renderer. Compose general scene layouts/marks/typed state from the content, without fixed task or shape templates. Preserve immutable givens, native answers and snapshot identity. Valid user exploration context is a sourced supplement identified by snapshot/block and interaction revision, not an instruction or an inference of intent. Interpret why, reasons and principles using topic and referent; never force them to mean the most recently changed parameter. Use explicitly requested current conditions only when matching state is available; otherwise state uncertainty. New conditions/answers require new contentId snapshots. Do not send messages, regenerate answers or call tools automatically from Scene controls. Keep native citations/files and complete readable explanation even if UI fails. The host controls iframe placement; no parent-page manipulation or arbitrary native paragraph insertion is promised. render_html, render_document, render_component and render_explanation preserve compatibility for existing or explicitly requested workflows; render_incline_forces retains its strict analytic contract. Correct argument errors once at most, then answer natively. Tool success confirms data only, not rendering, first-load reliability or next-turn adoption. No model API, chat storage, private host APIs or new external resources.";
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const error = (id, code, message, status = 200) => response({ jsonrpc: '2.0', id, error: { code, message } }, status);
function explanationSummary(config) {
  const resolved = resolveExplanation(config);
  const clip = (value, max) => value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  const facts = Object.entries(resolved.facts).map(([id, fact]) => `${fact.label || id} [${id}] = ${formatFact(fact)}`).join('；');
  const paragraphs = [];
  const collect = blocks => {
    for (const block of blocks) {
      if (paragraphs.length >= 2) break;
      if (block.kind === 'group') collect(block.blocks);
      else if (block.kind === 'prose') paragraphs.push(clip(block.text, 300));
    }
  };
  collect(resolved.blocks);
  return [
    `已准备组合讲解快照${resolved.title ? `：${resolved.title}` : ''}。事实引用、块结构和图元范围已校验；实际显示由客户端完成，不代表事实或推导已自动核实。改条件需重新调用完整快照；实验中的值不改写固定正文。`,
    ...(facts ? [`已采用事实（与图解使用同一份 facts，摘要至多 1600 字符）：${clip(facts, 1600)}`] : []),
    ...(paragraphs.length ? [`已展开的讲解文字摘录：${paragraphs.join('\n')}`] : [])
  ].join('\n');
}
async function readBounded(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new RangeError('Request too large');
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new RangeError('Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(data);
}
let rcDocumentCompilations = 0;
export async function handleMcp(request, { documentRouting = false, diagnostics = null } = {}) {
  // Streamable HTTP rejects foreign browser origins; server-to-server MCP may omit Origin.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) return error(null, -32600, 'Origin not allowed', 403);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return error(null, -32600, 'Content-Type must be application/json', 415);
  let message;
  try { message = JSON.parse(await readBounded(request)); }
  catch (e) { return error(null, e instanceof RangeError ? -32600 : -32700, e instanceof RangeError ? 'Request too large' : 'Invalid JSON', e instanceof RangeError ? 413 : 400); }
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && typeof message.id !== 'string' && typeof message.id !== 'number')) return error(null, -32600, 'Invalid JSON-RPC request', 400);
  if (message.id === undefined) return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } });
  const { id, method } = message; const params = message.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) return error(id, -32602, 'Invalid parameters');
  const requestedResourceUri = params.uri;
  if (diagnostics && method === 'resources/read' && typeof params.uri === 'string') params.uri = params.uri.replace(/-rc3\.html$/, '.html');
  let result;
  switch (method) {
    case 'initialize':
      result = { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0], capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } }, serverInfo: { name: 'chatui-renderer', version: rendererVersion }, instructions: MCP_INSTRUCTIONS }; break;
    case 'ping': result = {}; break;
    case 'tools/list': result = { tools: [HTML_TOOL, RESPONSE_TOOL, TOOL, INCLINE_TOOL, EXPLANATION_TOOL, DOCUMENT_TOOL] }; break;
    case 'resources/list': result = { resources: [{ uri: DOCUMENT_RESOURCE_URI, name: 'chatui-document', title: 'ChatUI Rich Document v1', mimeType: 'text/html;profile=mcp-app' }, { uri: RESPONSE_RESOURCE_URI, name: 'chatui-response', title: 'ChatUI unified response', mimeType: 'text/html;profile=mcp-app' }, { uri: RESOURCE_URI, name: 'chatui-renderer', title: 'ChatUI interactive component', mimeType: 'text/html;profile=mcp-app' }, { uri: EXPLANATION_RESOURCE_URI, name: 'chatui-explanation', title: 'ChatUI composed explanation', mimeType: 'text/html;profile=mcp-app' }] }; break;
    case 'resources/templates/list': result = { resourceTemplates: [] }; break;
    case 'resources/read': {
      const unified = RESPONSE_RESOURCE_URIS.includes(params.uri);
      const explanation = EXPLANATION_RESOURCE_URIS.includes(params.uri);
      const document = DOCUMENT_RESOURCE_URIS.includes(params.uri);
      if (!document && !unified && !explanation && !COMPONENT_RESOURCE_URIS.includes(params.uri)) return error(id, -32002, 'Resource not found');
      result = { contents: [{ uri: params.uri, mimeType: 'text/html;profile=mcp-app', text: document ? documentHtml : unified ? responseHtml : explanation ? explanationHtml : widgetHtml, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } }, 'openai/widgetDescription': document ? 'One transparent rich document: continuous prose, safe math, compact visual blocks and local interactions. Do not duplicate the full native answer.' : unified ? 'Unified transparent response: doubly sanitized semantic HTML with native disclosures, or existing structured Markdown, MathML, diagrams and local controls. No external requests or nested frames; do not duplicate the full native answer.' : explanation ? 'Ordered prose, formulas and labeled diagrams with isolated, real observation controls; no external requests.' : 'Interactive explanation with real force-vector, motion, quiz and table controls; no external requests.' } }] }; break;
    }
    case 'tools/call':
      // These headers are injected by Sites dispatch. Local requests without them fail closed.
      if (!request.headers.get('oai-authenticated-user-id') || !request.headers.get('oai-authenticated-user-email')) return error(id, -32001, 'Authenticated Sites user required', 401);
      if (![DOCUMENT_TOOL.name, HTML_TOOL.name, RESPONSE_TOOL.name, TOOL.name, INCLINE_TOOL.name, EXPLANATION_TOOL.name].includes(params.name)) return error(id, -32602, 'Unknown tool');
      try {
        // One fresh server-owned instance per Quiz call, including the legacy
        // explanation route's early projection. Authoring input cannot set it.
        let deliveryId;
        const projectToolResult = candidate => projectQuizResult(candidate, hasQuiz(candidate.structuredContent) ? { deliveryId: deliveryId ??= createQuizDeliveryId() } : {});
        if (params.name === DOCUMENT_TOOL.name) {
          if (diagnostics) diagnostics.documentCompileNumber = ++rcDocumentCompilations;
          const startedAt = performance.now();
          const { view, text, mathDiagnostics } = normalizeDocument(params.arguments);
          const normalizationMs = Number((performance.now() - startedAt).toFixed(2));
          if (diagnostics) view.runtimeDiagnostics = { ...diagnostics, serverCompletedAt: Date.now(), normalizationMs, mathFallbacks: mathDiagnostics.length };
          result = { structuredContent: view, content: [{ type: 'text', text }], _meta: { chatui: { normalizationMs, viewVersion: 1, documentVersion: 1, mathDiagnostics } } };
        } else if (params.name === HTML_TOOL.name) {
          const startedAt = performance.now();
          const { view, text } = normalizeHtml(params.arguments);
          result = { structuredContent: view, content: [{ type: 'text', text }], _meta: { chatui: { normalizationMs: Number((performance.now() - startedAt).toFixed(2)), viewVersion: 1 } } };
        } else if (params.name === RESPONSE_TOOL.name) {
          const startedAt = performance.now();
          const { view, text } = normalizeResponse(params.arguments);
          result = { structuredContent: view, content: [{ type: 'text', text }], _meta: { chatui: { normalizationMs: Number((performance.now() - startedAt).toFixed(2)), viewVersion: 1 } } };
        } else if (params.name === INCLINE_TOOL.name) {
          const { config, summary } = computeInclineForces(params.arguments);
          result = { structuredContent: config, content: [{ type: 'text', text: `${summary}\n已计算并准备受力图；实际显示由客户端完成。正文使用这组计算结果，不再附加同题默认参数实验。` }] };
        } else if (params.name === EXPLANATION_TOOL.name) {
          const config = validateExplanation(params.arguments);
          result = projectToolResult({ structuredContent: hasQuiz(config) ? resolveExplanation(config) : config, content: [] });
          result.content = [{ type: 'text', text: JSON.stringify(config.blocks).includes('"type":"input-form"') ? normalizeResponse(config).text : explanationSummary(result.structuredContent) }];
        } else {
          const config = validateComponent(params.arguments);
          result = { structuredContent: config, content: [{ type: 'text', text: config.type === 'input-form' ? `已准备输入表单；实际显示由客户端完成。\n${componentText(config.type, config.data)}` : `已准备 ${config.type} 数据快照${config.title ? `：${config.title}` : ''}。结构与数值范围已校验；实际显示由客户端完成。数值变更需重新调用，正文不会刷新旧卡。` }] };
        }
        result = projectToolResult(result);
      } catch (e) {
        const quizInput = JSON.stringify(params.arguments ?? {}).includes('"quiz"') || typeof params.arguments?.source === 'string' && /:::quiz\b/.test(params.arguments.source);
        result = { isError: true, content: [{ type: 'text', text: quizInput ? 'Quiz 数据边界校验失败；请检查题目与评分配置。' : e instanceof Error ? e.message : '组件数据无效。' }] };
      }
      break;
    default: return error(id, -32601, 'Method not found');
  }
  if (documentRouting && method === 'initialize') result.instructions = DOCUMENT_ROUTING_INSTRUCTIONS;
  if (documentRouting && method === 'tools/list') result.tools = documentRoutingTools(result.tools);
  // Isolated RC URIs prevent a host cache from silently testing old resource bytes.
  if (diagnostics && method === 'tools/list') result.tools = result.tools.map(tool => ({ ...tool, _meta: { ...tool._meta, ui: { ...tool._meta.ui, resourceUri: tool._meta.ui.resourceUri.replace('.html', '-rc3.html') }, 'openai/outputTemplate': tool._meta['openai/outputTemplate'].replace('.html', '-rc3.html') } }));
  if (diagnostics && method === 'resources/list') result.resources = result.resources.map(resource => ({ ...resource, uri: resource.uri.replace('.html', '-rc3.html') }));
  if (diagnostics && method === 'resources/read' && result.contents) result.contents = result.contents.map(resource => ({ ...resource, uri: requestedResourceUri, text: resource.text.replace('<html ', '<html data-chatui-diagnostics="rc3" ') }));
  if (diagnostics && result && method === 'tools/call') result._meta = { ...result._meta, chatui: { ...result._meta?.chatui, rc: { ...diagnostics, serverCompletedAt: Date.now() } } };
  return response({ jsonrpc: '2.0', id, result });
}
