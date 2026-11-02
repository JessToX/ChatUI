// Shared server/iframe boundary. Grading is never part of a public tool View.
import { inspect, validateComponent } from './component-validation.mjs';

const quizError = () => { throw new Error('Quiz 评分数据缺失或身份校验失败；请使用公开题目文本。'); };
const quizCheck = ok => { if (!ok) quizError(); };
const quizObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const quizKeys = (value, allowed) => quizObject(value) && Object.keys(value).every(key => allowed.includes(key));
const quizClone = value => JSON.parse(JSON.stringify(value));
const quizDeliveryPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const validQuizDeliveryId = value => typeof value === 'string' && new RegExp(quizDeliveryPattern).test(value);
// A public correlation token, never a grading fingerprint or authentication proof.
export function createQuizDeliveryId() {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') {
    const id = source.randomUUID(); quizCheck(validQuizDeliveryId(id)); return id;
  }
  quizCheck(typeof source?.getRandomValues === 'function');
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function quizEntries(view) {
  const found = [];
  if (view?.type === 'quiz') found.push({ id: '$component', node: view });
  const visit = blocks => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!quizObject(block)) continue;
      if (block.kind === 'component' && block.type === 'quiz') found.push({ id: block.id, node: block });
      if (block.blocks) visit(block.blocks);
      if (block.kind === 'tabs') for (const item of block.items || []) visit(item.blocks);
    }
  };
  visit(view?.blocks);
  return found;
}
export const hasQuiz = view => quizEntries(view).length > 0;
// Identity binding only, not authentication/encryption. It covers public bytes.
export function quizViewFingerprint(view) {
  const copy = { ...view }; delete copy.runtimeDiagnostics; delete copy.sourceHash; delete copy.deliveryId;
  const value = JSON.stringify(copy);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return [a, b].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
function quizPublicData(data) {
  const copy = { questions: data.questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options.map(o => ({ id: o.id, label: o.label })) })) };
  for (const key of ['followUp', 'followUpLabel', 'note']) if (data[key] !== undefined) {
    quizCheck(typeof data[key] === 'string' && data[key].length <= 12000); copy[key] = data[key];
  }
  return copy;
}
function quizSecretCopies(view, explanations, answers = []) {
  const encodings = value => {
    const bytes = new TextEncoder().encode(value);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(binary), hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const unicode = value.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    return [value, encodeURIComponent(value), base64, base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''), hex, hex.toUpperCase(), unicode, unicode.replace(/[a-f]/g, char => char.toUpperCase())];
  };
  const markers = explanations.filter(value => typeof value === 'string' && value.length > 0).flatMap(encodings);
  const answerMarkers = answers.flatMap(value => encodings(value).filter(marker => marker !== value));
  const publicOptions = new Set(quizEntries(view).flatMap(entry => entry.node.data.questions.map(q => q.options)));
  const visit = value => {
    if (typeof value === 'string') quizCheck(!markers.some(marker => value.includes(marker)) && !answerMarkers.some(marker => marker.length < 8 ? value === marker : value.includes(marker)));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (quizObject(value)) for (const [key, child] of Object.entries(value)) {
      quizCheck(!/^(correct|explanation|answerKey|grading|solution|correctAnswer|correctOption|answerIndex|gradingConfig)$/i.test(key));
      visit(key);
      // Option ids/labels are explicitly public; their presence does not identify
      // which option is correct. Explanations still cannot appear in them.
      if (publicOptions.has(child)) { quizSecretCopies(child, explanations); continue; }
      visit(child);
    }
  };
  visit(view);
}
export function projectQuizView(view, { deliveryId } = {}) {
  if (!hasQuiz(view)) return { view, meta: {} };
  inspect(view);
  const publicView = quizClone(view), quizzes = [], explanations = [], answers = [];
  const selectedDeliveryId = deliveryId ?? createQuizDeliveryId();
  quizCheck(validQuizDeliveryId(selectedDeliveryId));
  const entries = quizEntries(publicView);
  for (const entry of entries) {
    const data = entry.node.data;
    validateComponent({ schemaVersion: 1, contentId: publicView.contentId, type: 'quiz', data });
    const questions = data.questions.map(q => {
      quizCheck(q.explanation === undefined || typeof q.explanation === 'string');
      explanations.push(q.explanation); answers.push(q.correct);
      return { id: q.id, correct: q.correct, ...(q.explanation !== undefined ? { explanation: q.explanation } : {}) };
    });
    entry.node.data = quizPublicData(data);
    // Document-generated IDs must not fingerprint the hidden authoring source.
    if (publicView.mode === 'document') {
      const publicBlock = { ...entry.node }; delete publicBlock.id;
      entry.node.id = `d_quiz_${quizViewFingerprint(publicBlock)}_${quizzes.length}`;
    }
    quizzes.push({ id: entry.id === '$component' ? entry.id : entry.node.id, questions });
  }
  // Resolved grade-only facts otherwise retain a second copy of the secret.
  // Public prose that also spells out a grading explanation is rejected below.
  if (publicView.facts) for (const [id, fact] of Object.entries(publicView.facts)) {
    if (explanations.includes(fact.value) || answers.includes(fact.value)) delete publicView.facts[id];
  }
  // Inspect all supplied public fields before adding the independently minted
  // controlled UUID; its fixed v4 bits may coincidentally match a short grader.
  quizSecretCopies(publicView, explanations, answers);
  publicView.deliveryId = selectedDeliveryId;
  if (publicView.mode === 'document') publicView.sourceHash = quizViewFingerprint(publicView);
  const quizGrading = { version: 1, contentId: publicView.contentId, deliveryId: publicView.deliveryId, ...(publicView.sourceHash !== undefined ? { sourceHash: publicView.sourceHash } : {}), viewHash: quizViewFingerprint(publicView), quizzes };
  return { view: publicView, meta: { chatui: { quizGrading } } };
}
export function projectQuizResult(result, options) {
  if (hasQuiz(result.structuredContent) && result._meta?.chatui?.quizGrading) {
    hydrateQuizView(result.structuredContent, result._meta);
    const questions = result._meta.chatui.quizGrading.quizzes.flatMap(quiz => quiz.questions);
    quizSecretCopies(result.content, questions.map(q => q.explanation), questions.map(q => q.correct));
    return result;
  }
  const projected = projectQuizView(result.structuredContent, options);
  if (!projected.meta.chatui) return result;
  const questions = projected.meta.chatui.quizGrading.quizzes.flatMap(quiz => quiz.questions);
  quizSecretCopies(result.content, questions.map(q => q.explanation), questions.map(q => q.correct));
  return { ...result, structuredContent: projected.view, _meta: { ...result._meta, chatui: { ...result._meta?.chatui, ...projected.meta.chatui } } };
}
export function hydrateQuizView(view, meta) {
  if (!hasQuiz(view)) return view;
  try {
    inspect(view); inspect(meta?.chatui?.quizGrading);
    const grading = meta.chatui.quizGrading;
    quizCheck(quizKeys(grading, ['version', 'contentId', 'deliveryId', 'sourceHash', 'viewHash', 'quizzes']) && validQuizDeliveryId(view.deliveryId) && grading.deliveryId === view.deliveryId && grading.version === 1 && grading.contentId === view.contentId && grading.sourceHash === view.sourceHash && grading.viewHash === quizViewFingerprint(view));
    const copy = quizClone(view), entries = quizEntries(copy);
    // Delivery is checked at the boundary, not added to authoring/state identity.
    delete copy.deliveryId;
    quizCheck(Array.isArray(grading.quizzes) && grading.quizzes.length === entries.length);
    for (let i = 0; i < entries.length; i++) {
      const { id, node } = entries[i], item = grading.quizzes[i];
      quizCheck(quizKeys(item, ['id', 'questions']) && item.id === id && Array.isArray(item.questions) && item.questions.length === node.data.questions.length);
      quizCheck(quizKeys(node.data, ['questions', 'followUp', 'followUpLabel', 'note']));
      node.data.questions.forEach((q, index) => {
        const grade = item.questions[index];
        quizCheck(quizKeys(q, ['id', 'prompt', 'options']) && q.options.every(option => quizKeys(option, ['id', 'label'])));
        quizCheck(quizKeys(grade, ['id', 'correct', 'explanation']) && grade.id === q.id && typeof grade.correct === 'string' && q.options.some(option => option.id === grade.correct) && (grade.explanation === undefined || typeof grade.explanation === 'string'));
        q.correct = grade.correct;
        if (grade.explanation !== undefined) q.explanation = grade.explanation;
      });
      validateComponent({ schemaVersion: 1, contentId: copy.contentId, type: 'quiz', data: node.data });
    }
    return copy;
  } catch { quizError(); }
}

// Input schemas remain authoring contracts. Only Quiz outputs become closed.
export function publicQuizOutputSchema(authoringSchema) {
  const schema = quizClone(authoringSchema);
  const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
  const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
  const option = object({ id: text(80), label: text(1000) }, ['id', 'label']);
  const question = object({ id: text(79), prompt: text(6000), options: { type: 'array', minItems: 2, maxItems: 8, items: option } }, ['id', 'prompt', 'options']);
  const data = object({ questions: { type: 'array', minItems: 1, maxItems: 12, items: question }, followUp: { type: 'string', maxLength: 12000 }, followUpLabel: { type: 'string', maxLength: 12000 }, note: { type: 'string', maxLength: 12000 } }, ['questions']);
  schema.properties.deliveryId = { type: 'string', minLength: 36, maxLength: 36, pattern: quizDeliveryPattern, description: 'Nonsecret Quiz result-instance correlation UUID. Grading metadata must carry the same deliveryId; this is not authentication or replay protection for a complete matched old result.' };
  if (!schema.$defs?.component) schema.allOf = [...(schema.allOf || []), { if: { properties: { type: { const: 'quiz' } }, required: ['type'] }, then: { required: ['deliveryId'] } }];
  const component = schema.$defs?.component || schema;
  component.allOf = [...(component.allOf || []), { if: { properties: { type: { const: 'quiz' } }, required: ['type'] }, then: { properties: { data } } }];
  component.properties.data.description = 'Public component data. Quiz contains only question ids, prompts, options and public UI text; grading is component-only tool result _meta.';
  return schema;
}
