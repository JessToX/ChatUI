import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { boundedBadTex, createGalleryScenarios, galleryScenarios, g08Quiz } from '../examples/gallery.mjs';
import { g01, g04, g05 } from '../examples/intellectual.mjs';
import { normalizeDocument, lexDocument } from '../lib/document-normalization.mjs';
import { DOCUMENT_LIMITS, validateDocumentView } from '../lib/document-validation.mjs';
import { documentHtml } from '../lib/document.generated.mjs';
import { compileGalleryScenarios } from '../scripts/generate-gallery.mjs';
import { projectQuizResult, hydrateQuizView } from '../lib/quiz-boundary.mjs';

const golden = JSON.parse(readFileSync(new URL('../examples/math-physics-golden.json', import.meta.url)));
const walk = value => value && typeof value === 'object' ? [value, ...Object.values(value).flatMap(walk)] : [];
const scene = id => galleryScenarios.find(item => item.id === id);
const normalized = id => normalizeDocument(scene(id).input || scene(id).quizInput);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != independent ${expected}`);
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function rendererHost(t, state) {
  const errors = [], outbound = [], saved = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS')) errors.push(error.message); });
  const dom = new JSDOM(documentHtml, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://gallery-test.invalid', virtualConsole: vc });
  const { window } = dom; window.TextEncoder = TextEncoder;
  const send = data => window.dispatchEvent(new window.MessageEvent('message', { source: parent, data }));
  const parent = { postMessage(message) {
    outbound.push(message);
    if (message.id) queueMicrotask(() => send({ jsonrpc: '2.0', id: message.id, result: message.method === 'ui/initialize' ? { protocolVersion: '2026-01-26', hostCapabilities: {}, hostContext: { theme: 'light' } } : {} }));
  } };
  Object.defineProperty(window, 'parent', { value: parent });
  window.openai = { widgetState: state, setWidgetState: value => saved.push(structuredClone(value)) };
  for (const script of window.document.scripts) window.eval(script.textContent);
  await tick();
  const root = window.document.querySelector('#chatui-component');
  t.after(() => { send({ jsonrpc: '2.0', id: 'end', method: 'ui/resource-teardown' }); window.close(); });
  return { root, errors, outbound, saved, async deliver(result) {
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: projectQuizResult({ structuredContent: result.view, content: [{ type: 'text', text: result.text }] }) });
    for (let index = 0; index < 100 && root.getAttribute('aria-busy') === 'true'; index++) await tick();
    assert.equal(window.document.querySelector('#chatui-status').textContent, '');
  } };
}

test('Gallery has ten fixed scenarios with honest display modes, complete instructions and fresh deterministic inputs', () => {
  assert.deepEqual(galleryScenarios.map(item => item.id), ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10']);
  assert.deepEqual(galleryScenarios.map(item => item.mode), ['document', 'document', 'document', 'document', 'document', 'native-reference', 'document', 'boundary', 'document', 'document']);
  for (const item of galleryScenarios) for (const key of ['title', 'goal', 'instructions', 'expected', 'limitations']) assert.ok(typeof item[key] === 'string' && item[key].trim(), `${item.id}.${key}`);
  assert.deepEqual(createGalleryScenarios(), galleryScenarios);
  const changed = createGalleryScenarios(); changed[0].input.source = 'changed'; changed[7].quizInput.source = 'changed';
  assert.deepEqual(createGalleryScenarios(), galleryScenarios, 'Each build receives fresh data without mutable cross-build state.');
});

test('Every normal Gallery document uses the existing validated compiler within unchanged content budgets', () => {
  for (const item of galleryScenarios) {
    const input = item.input || item.quizInput;
    if (!input) continue;
    const result = normalizeDocument(input);
    assert.equal(validateDocumentView(result.view), result.view);
    assert.equal(result.view.mode, 'document'); assert.equal(result.view.documentVersion, 1);
    assert.deepEqual(normalizeDocument(input), result);
    assert.ok(input.source.length <= DOCUMENT_LIMITS.sourceCharacters);
    assert.ok(Buffer.byteLength(input.source) <= DOCUMENT_LIMITS.sourceBytes);
    assert.ok(lexDocument(input.source).filter(segment => segment.type !== 'markdown').length <= DOCUMENT_LIMITS.directives);
    assert.ok(walk(result.view.blocks).filter(block => block.kind === 'component').length <= DOCUMENT_LIMITS.components);
    assert.ok(walk(result.view.blocks).filter(block => block.kind).length <= DOCUMENT_LIMITS.blocks);
    assert.ok(walk(result.view.blocks).filter(node => node.type === 'math').length <= DOCUMENT_LIMITS.formulas);
    assert.equal(result.mathDiagnostics.length, item.id === 'G07' ? 1 : 0, item.id);
    assert.ok(result.text.startsWith(`# ${input.title}`));
  }
});

test('Gallery preserves the reviewed G01, G04 and eight-section G05 inputs verbatim', () => {
  for (const [id, factory] of [['G01', g01], ['G04', g04], ['G05', g05]]) assert.deepEqual(scene(id).input, factory());
  const g01Text = normalized('G01').text, g04Text = normalized('G04').text, g05Text = normalized('G05').text;
  for (const literal of ['h=3 cm', 'b=2√3 cm', 'A=3√3 cm²', '0.05≤h/r≤1.95']) assert.ok(g01Text.includes(literal), literal);
  for (const literal of ['合成伦理思考实验', '前提 A1', '推论 A3', '前提 B1', '推论 B3', '反例 A', '反例 B', '尚未解决的问题']) assert.ok(g04Text.includes(literal), literal);
  assert.equal(walk(normalized('G05').view.blocks).filter(node => node.type === 'heading' && node.level === 2).length, 8);
  for (const literal of ['[SYN-E05]', '[SYN-E04-A]', '[SYN-E04-B]', 'A-03、A-09、B-04、B-11', 'const difference =', '完整文档到此结束']) assert.ok(g05Text.includes(literal), literal);
  assert.doesNotMatch(g04Text + g05Text, /https?:\/\//, 'Synthetic evidence is not dressed as external academic citations.');
});

test('G02 cone preserves independent exact values, dimensions and singular/full-capacity boundaries without fake controls', () => {
  const { view, text } = normalized('G02'), g = golden.cone;
  assert.equal(walk(view.blocks).filter(block => block.kind === 'component').length, 0);
  for (const literal of ['R=3 m', 'H=6 m', 'Q=2 m³/s', 'h=2 m', 'r_w=1 m', '0<h<H', 'dh/dt=2/π m/s', 'V=2π/3 m³', 'dr_w/dt=1/π m/s', 'h=0', '奇异', 'h=H=6 m', '停止']) assert.ok(text.includes(literal), literal);
  // This conservation oracle is hand-audited in the golden file, independent of the renderer.
  near(g.flowM3ps / (Math.PI * g.waterRadiusM ** 2), g.rateMps);
  near(Math.PI * g.waterRadiusM ** 2 * g.waterHeightM / 3, g.volumeM3);
  const tex = walk(view.blocks).filter(node => node.type === 'math').map(node => node.tex);
  assert.ok(tex.includes(String.raw`\left.\frac{dh}{dt}\right|_{h=2}=\frac{2}{\pi}\,\mathrm{m/s}`));
  assert.ok(tex.includes(String.raw`Q=\frac{dV}{dt}=\frac{\pi h^2}{4}\frac{dh}{dt}`));
});

test('G02 substitution retains the primitive, constant and chain-rule verification including x=0', () => {
  const { view, text } = normalized('G02');
  const tex = walk(view.blocks).filter(node => node.type === 'math').map(node => node.tex);
  assert.ok(tex.includes(String.raw`\int 2x\cos(x^2)\,dx=\sin(x^2)+C`));
  assert.ok(tex.includes(String.raw`\frac{d}{dx}\bigl(\sin(x^2)+C\bigr)=2x\cos(x^2)`));
  for (const literal of ['x∈R', '无量纲', 'du=2x dx', '不需要除以 x', '唯一反函数', '回验包含 x=0', '任意积分常数', '本例到此结束']) assert.ok(text.includes(literal), literal);
  near(2 * Math.cos(1), golden.integral.derivativeAtOne);
  assert.equal(2 * 0 * Math.cos(0), 0);
});

test('G03 real motion and force data agree with the independent SI/force golden, signs and only two real forces', () => {
  const { view, text } = normalized('G03');
  const components = walk(view.blocks).filter(block => block.kind === 'component');
  assert.deepEqual(components.map(block => block.type), ['motion-lab', 'force-diagram']);
  const motion = components[0].data, force = components[1].data;
  assert.deepEqual(motion, { initialVelocity: golden.motion.initialVelocity, acceleration: golden.motion.acceleration, duration: golden.motion.duration, time: 1, unit: 'SI' });
  for (const expected of golden.motion.cases) {
    near(motion.initialVelocity + motion.acceleration * expected.time, expected.velocity);
    near(golden.motion.x0M + motion.initialVelocity * expected.time + motion.acceleration * expected.time ** 2 / 2, expected.position);
  }
  assert.equal(force.unit, 'N'); assert.equal(force.axisAngle, 30);
  assert.deepEqual(force.forces.map(item => item.id), ['gravity', 'normal']);
  assert.equal(force.calculation, undefined, 'The compiler accepts the mature force fields, not a second calculation vocabulary.');
  assert.deepEqual([force.forces[0].fx, force.forces[0].fy], [0, -20]);
  [force.forces[1].fx, force.forces[1].fy].forEach((value, index) => near(value, golden.incline.normalVectorN[index]));
  near(Math.hypot(force.forces[1].fx, force.forces[1].fy), golden.incline.normalN);
  const sum = [force.forces.reduce((value, item) => value + item.fx, 0), force.forces.reduce((value, item) => value + item.fy, 0)];
  sum.forEach((value, index) => near(value, golden.incline.netVectorN[index]));
  near(Math.hypot(...sum), golden.incline.netN);
  near(Math.hypot(...sum) / golden.incline.massKg, golden.incline.accelerationMps2);
  for (const literal of ['x0=0 m', 't=1 s', 'v=10 m/s', 'x=15 m', 'g=10 m/s²', 'N=10√3 N', '合力大小 10 N', '加速度大小 5 m/s²', '不是第三个作用力', '两个独立', '本例到此结束']) assert.ok(text.includes(literal), literal);
});

test('G06 is explicitly a static native-text reference with no document or component masquerade', () => {
  const item = scene('G06');
  assert.equal(item.mode, 'native-reference');
  assert.equal(item.text, '已收到。下一步先核对题设，再检查结论。');
  assert.equal(item.input, undefined); assert.equal(item.quizInput, undefined);
  assert.match(item.expected, /静态原生文本参考视图/);
  assert.match(item.limitations, /不是真实 ChatGPT UI 或 MCP widget/);
  assert.match(item.limitations, /未测试真实原生路由/);
});

test('G07 has exactly one bounded non-forbidden TeX downgrade while preserving normal math and the entire document', () => {
  const { view, text, mathDiagnostics } = normalized('G07');
  const math = walk(view.blocks).filter(node => node.type === 'math');
  assert.deepEqual(math.map(node => node.tex), ['E=mc^2', boundedBadTex, '1+1=2']);
  assert.equal(mathDiagnostics.length, 1);
  assert.deepEqual(math[1].math, { tag: 'mtext', text: `公式排版失败，保留 TeX：${boundedBadTex}` });
  assert.notEqual(math[0].math.tag, 'mtext'); assert.notEqual(math[2].math.tag, 'mtext');
  for (const literal of ['安全降级示例开始', boundedBadTex, '坏公式后面的正文仍然存在', '安全降级示例结束', '禁止命令走硬拒绝路径']) assert.ok(text.includes(literal), literal);
  assert.ok(text.endsWith('完整复制应包含原始坏 TeX、两条正常公式和这句末尾文字。'));
});

test('G08 compiler boundaries reject five distinct fixed invalid inputs before any View can be emitted', () => {
  const checks = scene('G08').checks;
  assert.deepEqual(checks.map(item => item.id), ['illegal-dsl', 'dangerous-key', 'unsafe-url', 'budget-exceeded', 'forbidden-tex']);
  const reasons = [/不支持的文档指令/, /不支持的属性/, /来源地址无效/, /超过 32768/, /TeX 不允许/];
  checks.forEach((item, index) => {
    assert.equal(item.expected, 'compile-rejection');
    assert.throws(() => normalizeDocument(item.input), reasons[index], item.id);
  });
  assert.doesNotMatch(normalized('G08').text, /javascript:|__proto__|href|x{100}/);
  assert.equal({}.polluted, undefined);
});

test('Gallery build strips dangerous raw inputs and reports true rejection/fallback rather than a success document', () => {
  const compiled = compileGalleryScenarios(createGalleryScenarios());
  assert.deepEqual(compileGalleryScenarios(createGalleryScenarios()), compiled);
  const boundary = compiled.find(item => item.id === 'G08');
  assert.deepEqual(boundary.checks.map(item => item.status), ['rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'fallback']);
  for (const item of compiled) {
    assert.equal(item.input, undefined); assert.equal(item.quizInput, undefined); assert.equal(item.clientRejection, undefined);
    if (item.view) validateDocumentView(hydrateQuizView(item.view, item._meta));
  }
  assert.ok(boundary.checks.every(item => item.input === undefined));
  assert.doesNotMatch(JSON.stringify(compiled), /javascript:alert|__proto__|https:\/\/example\.invalid|x{100}/);
  assert.equal(boundary.hasQuiz, true);
  assert.throws(() => validateDocumentView(boundary.clientProbe), /文档提示块/);
});

test('G08 client rejection and unavailable-tool fallback derive from complete same-input safe documents', () => {
  const boundary = scene('G08'), compiled = compileGalleryScenarios([boundary])[0];
  const legal = normalizeDocument(boundary.clientRejection.input);
  validateDocumentView(legal.view);
  assert.equal(boundary.clientRejection.mutation, 'invalid-callouts');
  assert.ok(legal.text.includes('客户端回退开始')); assert.ok(legal.text.endsWith('客户端回退结束。'));
  assert.equal(compiled.toolFallback, normalizeDocument(boundary.toolFallback.input).text);
  assert.ok(compiled.toolFallback.includes('原生 fallback 开始')); assert.ok(compiled.toolFallback.endsWith('原生 fallback 结束。'));
  assert.doesNotMatch(compiled.toolFallback, /javascript:|__proto__|stack|Error:/);
});

test('G08 quiz complete fallback has prompts/options/tail but no unsubmitted scoring key or explanation', () => {
  const { view, text } = normalized('G08');
  const quiz = view.blocks.find(block => block.kind === 'component' && block.type === 'quiz');
  assert.equal(quiz.data.questions.length, 1);
  for (const question of quiz.data.questions) {
    assert.ok(text.includes(question.prompt));
    question.options.forEach(option => assert.ok(text.includes(option.label)));
    assert.ok(!text.includes(question.explanation));
  }
  assert.ok(text.includes('测验开始')); assert.ok(text.endsWith('复制不会包含评分键或解析。'));
  assert.doesNotMatch(text, /"correct"|正确答案：|4\+3=7/);
});

test('G08 fixture quiz really selects, submits, scores and retries without hidden grading or unauthorized messages', async t => {
  const result = normalized('G08'), question = result.view.blocks.find(block => block.type === 'quiz').data.questions[0];
  const app = await rendererHost(t); await app.deliver(result);
  const button = label => [...app.root.querySelectorAll('button')].find(item => item.textContent === label);
  assert.ok(!app.root.outerHTML.includes(question.explanation)); assert.doesNotMatch(app.root.outerHTML, /正确答案：|"correct"/);
  button('提交答案').click(); assert.match(app.root.textContent, /请先回答每一道题/);
  assert.ok(!app.root.outerHTML.includes(question.explanation));
  app.root.querySelector(`input[value="${question.correct}"]`).click();
  assert.ok(!app.root.outerHTML.includes(question.explanation));
  button('提交答案').click(); assert.match(app.root.textContent, /1 \/ 1 正确/);
  assert.ok(app.root.textContent.includes(question.explanation));
  const savedSubmitted = app.saved.at(-1);
  button('重新测试').click();
  assert.equal(app.root.querySelectorAll('input:checked').length, 0); assert.ok(!app.root.outerHTML.includes(question.explanation));
  const fresh = await rendererHost(t, savedSubmitted);
  await fresh.deliver(normalizeDocument({ ...g08Quiz(), contentId: 'gallery-g08-next-instance' }));
  assert.equal(fresh.root.querySelectorAll('input:checked').length, 0);
  assert.ok(!fresh.root.outerHTML.includes(question.explanation), 'A different scene identity cannot restore an old submission.');
  assert.ok(!app.outbound.some(message => message.method === 'tools/call' || message.method === 'ui/message'));
  assert.deepEqual(app.errors, []); assert.deepEqual(fresh.errors, []);
});
