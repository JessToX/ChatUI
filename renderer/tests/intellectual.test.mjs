import assert from 'node:assert/strict';
import test from 'node:test';
import { intellectualFactories, intellectualReferenceIndex, nativeControl } from '../examples/intellectual.mjs';
import { normalizeDocument, lexDocument } from '../lib/document-normalization.mjs';
import { DOCUMENT_LIMITS, validateDocumentView } from '../lib/document-validation.mjs';

const walk = value => value && typeof value === 'object'
  ? [value, ...Object.values(value).flatMap(walk)] : [];
const plain = nodes => nodes.map(node => node.text ?? plain(node.children || [])).join('');
const headings = view => walk(view.blocks).filter(node => node.type === 'heading');

test('Phase 2A references compile deterministically through the existing Document path within unchanged budgets', () => {
  assert.deepEqual(Object.keys(intellectualFactories), ['g01', 'g04', 'g05']);
  assert.deepEqual(intellectualReferenceIndex.map(item => item.id), ['document-g01', 'document-g04', 'document-g05']);
  for (const [name, factory] of Object.entries(intellectualFactories)) {
    const input = factory(), result = normalizeDocument(input);
    assert.equal(validateDocumentView(result.view), result.view);
    assert.equal(result.view.mode, 'document');
    assert.equal(result.view.documentVersion, 1);
    assert.equal(result.mathDiagnostics.length, 0, name);
    assert.deepEqual(normalizeDocument(factory()), result, `${name} is deterministic`);
    assert.ok(input.source.length <= DOCUMENT_LIMITS.sourceCharacters);
    assert.ok(Buffer.byteLength(input.source) <= DOCUMENT_LIMITS.sourceBytes);
    assert.ok(lexDocument(input.source).filter(segment => segment.type !== 'markdown').length <= DOCUMENT_LIMITS.directives);
    assert.ok(walk(result.view.blocks).filter(item => item.kind === 'component').length <= DOCUMENT_LIMITS.components);
    assert.ok(walk(result.view.blocks).filter(item => item.kind).length <= DOCUMENT_LIMITS.blocks);
    assert.ok(walk(result.view.blocks).filter(item => item.type === 'math').length <= DOCUMENT_LIMITS.formulas);
    assert.ok(result.text.startsWith(`# ${input.title}`));
  }
});

test('G01 separates the default experiment from an independently derived exact maximum and analytic endpoints', () => {
  const { view, text } = normalizeDocument(intellectualFactories.g01());
  const geometry = walk(view.blocks).filter(block => block.kind === 'component' && block.type === 'geometry');
  assert.equal(geometry.length, 1);
  assert.deepEqual(geometry[0].data, { radius: 2, heightRatio: 1, unit: 'cm' });

  // Independent equilateral-circumradius oracle, not the production area function.
  const circumradius = 2, side = Math.sqrt(3) * circumradius;
  const maximumArea = Math.sqrt(3) * side ** 2 / 4;
  assert.ok(Math.abs(maximumArea - 5.196152422706632) < 1e-12);
  assert.ok(Math.abs(side - 3.4641016151377546) < 1e-12);
  const tex = walk(view.blocks).filter(node => node.type === 'math').map(node => node.tex);
  assert.ok(tex.includes(String.raw`A'(h)=\frac{h(3r-2h)}{\sqrt{2rh-h^2}}`));
  for (const literal of ['r=2 cm', 'h/r=1', 'h=2 cm', 'b=4 cm', 'A=4 cm²', 'h/r=1.5', 'h=3 cm', 'b=2√3 cm', 'A=3√3 cm²≈5.1961524227 cm²', '0.05≤h/r≤1.95', 'h=0 和 h=2r', '两个端点不在实验范围内', '不随下方滑块改写']) {
    assert.ok(text.includes(literal), literal);
  }
  assert.doesNotMatch(text, /6√3/);
});

test('G01 cannot bypass repaired full-slider rejection through its new Document fixture', () => {
  const input = intellectualFactories.g01();
  for (const radius of [2e-162, 1e-160, 1e-153, 1e154, 0, -2]) {
    for (const heightRatio of [.05, 1, 1.5, 1.95]) {
      const source = input.source.replace('"radius":2,"heightRatio":1', `"radius":${radius},"heightRatio":${heightRatio}`);
      assert.notEqual(source, input.source);
      assert.throws(() => normalizeDocument({ ...input, source }), /半径/, `${radius}, ${heightRatio}`);
    }
  }
});

test('G01 gives each fixed optimum quantity its own exact, unit-bearing display formula', () => {
  const { view, text, mathDiagnostics } = normalizeDocument(intellectualFactories.g01());
  assert.deepEqual(mathDiagnostics, []);
  const formulas = walk(view.blocks).filter(node => node.type === 'math').map(node => node.tex);
  assert.ok(formulas.includes(String.raw`h=\frac{3r}{2}=3\,\mathrm{cm}`));
  assert.ok(formulas.includes(String.raw`b=\sqrt{3}r=2\sqrt{3}\,\mathrm{cm}`));
  assert.ok(formulas.includes(String.raw`A_{\max}=\frac{3\sqrt{3}}{4}r^2`));
  assert.ok(formulas.includes(String.raw`A_{\max}=3\sqrt{3}\,\mathrm{cm}^2`));
  assert.ok(formulas.every(tex => !tex.includes('\\qquad')), 'Critical conclusions are no longer one long horizontal expression.');
  for (const tex of formulas) assert.ok(text.includes(tex), 'Full fallback retains each exact expression.');
  assert.ok(text.includes('这里 x 是半底边，不是整个底边'));
  assert.ok(text.includes('长度以 cm 计，面积以 cm² 计'));
});

test('G04 retains fact/value premises, targeted counterexamples and unresolved questions in the complete fallback', () => {
  const { view, text } = normalizeDocument(intellectualFactories.g04());
  assert.equal(view.blocks.filter(block => block.kind === 'component' && block.type === 'comparison').length, 1);
  const collapsed = view.blocks.filter(block => block.kind === 'collapse');
  assert.equal(collapsed.length, 2);
  assert.ok(collapsed.every(block => block.open !== true));
  for (const literal of ['合成伦理思考实验', '事实判断 F1', '事实判断 F2', '前提 A1（价值）', '前提 B1（价值）', '推论 A3', '推论 B3', '隐含前提', '反例 A', '反例 B', '它没有否定事实 F1', '没有否定平等考虑本身', '尚未解决的问题', '本例没有共同的量尺']) assert.ok(text.includes(literal), literal);
  assert.doesNotMatch(text, /https?:\/\/|\d+(?:\.\d+)?%/);
});

test('G04 exposes six separately readable argument nodes in A then B order without extending comparison data', () => {
  const { view, text } = normalizeDocument(intellectualFactories.g04());
  const comparison = view.blocks.find(block => block.kind === 'component' && block.type === 'comparison');
  assert.equal(comparison.data.items.length, 2);
  let previous = -1;
  comparison.data.items.forEach((item, index) => {
    assert.deepEqual(Object.keys(item).sort(), ['detail', 'label', 'title', 'tone']);
    const side = index === 0 ? 'A' : 'B';
    const nodes = item.detail.split('\n\n');
    assert.equal(nodes.length, 3);
    ['前提', '理由', '推论'].forEach((role, nodeIndex) => {
      const label = `${role} ${side}${nodeIndex + 1}`;
      assert.ok(nodes[nodeIndex].startsWith(label));
      const position = text.indexOf(label);
      assert.ok(position > previous, `${label} preserves the complete fallback reading order.`);
      previous = position;
    });
    assert.ok(nodes[2].includes('隐含前提'), 'Each qualification stays attached to its own inference.');
    assert.ok(text.includes(item.detail), 'Copy retains the argument node boundaries.');
    assert.doesNotMatch(item.detail, /<[^>]+>|\*\*|<script/i, 'The existing field remains plain text.');
  });
  const counterexamples = view.blocks.filter(block => block.kind === 'collapse');
  assert.ok(counterexamples[0].summary.startsWith('检查 A3：'));
  assert.ok(counterexamples[1].summary.startsWith('检查 B3：'));
});

test('G05 has eight complete sections and copies closed disclosures, every tab, table, formulas, code and provenance', () => {
  const input = intellectualFactories.g05(), { view, text } = normalizeDocument(input);
  const titles = headings(view);
  assert.equal(titles.length, 8);
  assert.ok(titles.every(heading => heading.level === 2));
  titles.forEach((heading, index) => {
    assert.ok(plain(heading.children).startsWith(`${String(index + 1).padStart(2, '0')} · `));
    assert.equal(text.split(`## ${plain(heading.children)}`).length - 1, 1);
  });
  const nodes = walk(view.blocks), tabs = view.blocks.find(block => block.kind === 'tabs');
  assert.equal(tabs.items.length, 2);
  assert.equal(view.blocks.find(block => block.kind === 'collapse').open, false);
  assert.equal(nodes.filter(node => node.type === 'table').length, 1);
  assert.equal(nodes.filter(node => node.type === 'codeblock').length, 1);
  assert.equal(nodes.filter(node => node.type === 'math').length, 2);
  for (const literal of ['evidence traceability', 'retrieval success', '[SYN-E01]', '[SYN-E02]', '[SYN-E03]', '[SYN-E04-A]', '[SYN-E04-B]', '[SYN-E05]', 'A-03、A-09、B-04、B-11', '检索线索（retrieval cue）', '任务更容易', '20 个百分点', '8/10−6/10=1/5', 'const difference = rate(evidence[1]) - rate(evidence[0]);', 'A · 连续文字 | 12 | 2 | 10 | 6 | 4', 'B · 局部编号 | 12 | 2 | 10 | 8 | 2', '限制 L1', '限制 L2', '限制 L3', '限制 L4', '完整文档到此结束']) assert.ok(text.includes(literal), literal);
  assert.ok(text.endsWith('复制并不会把这些合成材料转变为真实研究。'));
  assert.doesNotMatch(text, /https?:\/\//);
});

test('new fixtures retain literal bounded TeX failure and inert author HTML without losing the document tail', () => {
  const input = intellectualFactories.g05();
  const broken = String.raw`\frac{x}{`;
  const source = `${input.source}\n\nBefore formula $${broken}$. After formula.\n\n<script>globalThis.fixtureExecuted=true</script>\n\nSAFE-TAIL`;
  const { view, text, mathDiagnostics } = normalizeDocument({ ...input, source });
  assert.equal(mathDiagnostics.length, 1);
  assert.ok(text.includes(broken));
  assert.ok(text.includes('完整文档到此结束'));
  assert.ok(text.endsWith('SAFE-TAIL'));
  assert.ok(walk(view.blocks).some(node => node.type === 'text' && node.text.includes('<script>')));
  assert.ok(walk(view.blocks).every(node => node.type !== 'html' && node.type !== 'script'));
});

test('fixture edits still reject dangerous TeX, invalid directives and source budgets', () => {
  const input = intellectualFactories.g05();
  for (const addition of [String.raw`$\href{javascript:alert(1)}{x}$`, ':::script {}\n:::', ':::geometry {"radius":2,"heightRatio":1,"unit":"cm","script":"x"}\n:::']) {
    assert.throws(() => normalizeDocument({ ...input, source: `${input.source}\n\n${addition}` }));
  }
  assert.throws(() => normalizeDocument({ ...input, source: 'x'.repeat(DOCUMENT_LIMITS.sourceCharacters + 1) }), /超过/);
  assert.throws(() => normalizeDocument({ ...input, source: '中'.repeat(Math.floor(DOCUMENT_LIMITS.sourceBytes / 3) + 1) }), /超过/);
});

test('complete fallback of the new long document excludes appended unsubmitted quiz grading data', () => {
  const input = intellectualFactories.g05();
  const quiz = { questions: [{ id: 'audit', prompt: '哪项说明材料来源？', options: [{ id: 'a', label: '真实日志' }, { id: 'b', label: '合成材料' }], correct: 'b', explanation: 'PRIVATE-GRADING-EXPLANATION' }] };
  const { text } = normalizeDocument({ ...input, source: `${input.source}\n\n:::quiz ${JSON.stringify(quiz)}\n:::` });
  for (const literal of ['哪项说明材料来源？', 'a. 真实日志', 'b. 合成材料', '[SYN-E05]', '完整文档到此结束']) assert.ok(text.includes(literal), literal);
  assert.doesNotMatch(text, /PRIVATE-GRADING-EXPLANATION|"correct"|正确答案/);
});

test('G06 remains a plain short answer with no Document input or component', () => {
  assert.deepEqual(Object.keys(nativeControl).sort(), ['id', 'text', 'title']);
  assert.equal(nativeControl.id, 'native-g06');
  assert.equal(nativeControl.text, '已收到。下一步先核对题设，再检查结论。');
  assert.ok(!intellectualReferenceIndex.some(item => item.id === nativeControl.id));
  assert.equal(nativeControl.source, undefined);
});
