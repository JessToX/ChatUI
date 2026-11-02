import { inspect } from './component-validation.mjs';
import { validateResponseView } from './response-validation.mjs';

export const DOCUMENT_LIMITS = Object.freeze({ sourceBytes: 65536, sourceCharacters: 32768, directives: 32, components: 24, blocks: 96, proseCharacters: 12000, formulas: 64, nesting: 1 });
export const DOCUMENT_TONES = ['key', 'note', 'warning', 'success'];
export function documentResponseView(view) {
  const { mode, documentVersion, sourceHash, callouts, runtimeDiagnostics, ...response } = view;
  void mode; void documentVersion; void sourceHash; void callouts; void runtimeDiagnostics;
  return response;
}
export function validateDocumentView(view) {
  if (!view || view.mode !== 'document' || view.documentVersion !== 1 || typeof view.sourceHash !== 'string' || !/^[a-f0-9]{16}$/.test(view.sourceHash)) throw new Error('文档视图版本或指纹无效。');
  inspect(view);
  if (view.runtimeDiagnostics !== undefined) {
    const d = view.runtimeDiagnostics;
    const allowed = ['version', 'instanceId', 'instanceStartedAt', 'requestNumber', 'serverReceivedAt', 'serverCompletedAt', 'documentCompileNumber', 'normalizationMs', 'mathFallbacks'];
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(key => !allowed.includes(key)) || typeof d.version !== 'string' || d.version.length > 40 || typeof d.instanceId !== 'string' || d.instanceId.length > 80 || Object.entries(d).some(([key, value]) => !['version', 'instanceId'].includes(key) && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))) throw new Error('候选诊断字段无效。');
  }
  const response = documentResponseView(view);
  validateResponseView(response);
  if (!view.callouts || typeof view.callouts !== 'object' || Array.isArray(view.callouts) || Object.keys(view.callouts).length > 32) throw new Error('文档提示块映射无效。');
  for (const [id, tone] of Object.entries(view.callouts)) {
    const block = view.blocks.find(block => block.id === id);
    if (!DOCUMENT_TONES.includes(tone) || block?.kind !== 'group' || block.layout !== 'stack' || block.blocks.some(child => child.kind !== 'prose')) throw new Error('文档提示块需要有效语义色和正文。');
  }
  return view;
}

export const DOCUMENT_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contentId', 'source'],
  properties: {
    contentId: { type: 'string', minLength: 1, maxLength: 200 },
    source: { type: 'string', minLength: 1, maxLength: DOCUMENT_LIMITS.sourceCharacters, description: 'ChatUI Rich Markdown v1: serialize TeX backslashes once for JSON only; never apply extra Markdown escaping to commands or underscores inside math. Normal Markdown, inline \\(TeX\\) or block \\[TeX\\]. Directive lines use :::type {strict JSON}, newline, optional body, newline :::. No nested directives. callout:{tone?:key|note|warning|success,title?} and collapse:{summary,open?} accept Markdown body. tabs:{items:[{label,body}]} has 2–8 Markdown tabs. Data-only directives have no body: line-chart:{xLabel,yLabel,seriesLabel,points:[{x,y}],xUnit?,yUnit?,note?}, 2–80 points with strictly increasing x; use for supplied numeric graphs instead of generated images. quiz:{questions:[{id,prompt,options:[{id,label}],correct,explanation}],followUp?},1–12 real graded questions. progress:{value,total,label?,unit?} or {total,stages:[{id,label,value,subsetOf?}],unit?}; profile:{name,subtitle?,tags?,summary?}; comparison:{items:[{label,title?,detail?,tex?,tone?}]}; steps/timeline:{items:[{title,detail,date?,status?,tex?}]}. input-form:{fields:[{id,type:text|textarea|number|select|radio|checkbox,label,value?,required?,hint?,min?,max?,maxLength?,options?:[{value,label}]}],submitLabel?,resetLabel?,note?}; local snapshot only, total input capacity <=1000 chars, at most 8 fields and 500 characters per text field. Other supported mature types: reveal-steps,answer,rhythm,force-diagram,motion-lab,geometry,data-table,media-panel,diagram. Use direct supplied facts and TeX; IDs/MathML/fallback are generated. No raw executable HTML, CSS, JS or SVG.' },
    title: { type: 'string', minLength: 1, maxLength: 200 }, theme: { const: 'native' }
  }
};
