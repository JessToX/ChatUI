// Synthetic vertical case only. This is not product routing or an AI answer.
const ref = id => ({ ref: id }), op = (op, ...args) => ({ op, args });
export function verticalExperience(height = 3, contentId = 'vertical-original') {
  const scene = (id, initial) => ({ kind: 'scene', id, title: id === 'first' ? '第一张图' : '第二张独立图',
    description: '底边固定，沿竖直方向拖动顶点。高度是到底边的垂直距离。', givens: { base: 8 },
    state: { height: { type: 'number', value: initial, min: .5, max: 7, step: .1, label: '高度', unit: 'cm' },
      showGuide: { type: 'boolean', value: true, role: 'presentation', label: '显示辅助线' } },
    derived: { vertexY: { type: 'number', expr: op('sub', 260, op('mul', 30, ref('height'))) }, area: { type: 'number', expr: op('div', op('mul', ref('base'), ref('height')), 2) } },
    root: { kind: 'layout', id: 'layout', direction: 'column', children: [
      { kind: 'drawing', id: 'figure', description: '同一底边上，高度控制顶点位置与面积。', viewBox: { width: 360, height: 300 }, marks: [
        { kind: 'path', id: 'triangle', tone: 'blue', fill: 'soft', commands: [{ op: 'M', x: 40, y: 260 }, { op: 'L', x: 280, y: 260 }, { op: 'L', x: 160, y: ref('vertexY') }, { op: 'Z' }] },
        { kind: 'line', id: 'height-guide', x1: 160, y1: 260, x2: 160, y2: ref('vertexY'), dashed: true },
        { kind: 'circle', id: 'vertex', cx: 160, cy: ref('vertexY'), r: 7, tone: 'blue', fill: 'solid', drag: { state: 'height', axis: 'y', origin: 260, scale: -30, label: '调整顶点高度' } },
        { kind: 'text', id: 'base-label', x: 160, y: 285, anchor: 'middle', parts: ['底边 ', ref('base'), ' cm'] }
      ] },
      { kind: 'formula', id: 'area-reading', parts: ['S = ½ × ', ref('base'), ' × ', { ref: 'height', precision: 2 }, ' = ', { ref: 'area', precision: 2 }, ' cm²'] },
      { kind: 'control', id: 'height-number', control: 'number', state: 'height', label: '高度（cm）' },
      { kind: 'control', id: 'guide-toggle', control: 'toggle', state: 'showGuide', label: '显示辅助说明' },
      { kind: 'text', id: 'guide-note', when: ref('showGuide'), parts: ['图内探索不改写原始讲解。'] }
    ] } });
  return { schemaVersion: 1, contentId, facts: { base: { value: 8, unit: 'cm' } }, blocks: [scene('first', height), scene('second', 5)] };
}
export const verticalExperienceText = {
  id: 'vertical', title: '连续讲解与拖动',
  prompt: '底边为 8 厘米的三角形，面积怎么随高度变化？让我拖动顶点观察。',
  nativeText: '三角形面积 S = bh/2。这里底边固定为 8 cm，所以 S = 4h；高度每增加 1 cm，面积增加 4 cm²。第一张图的初始高度为 3 cm，面积为 12 cm²。\n\n高度指顶点到底边所在直线的垂直距离，不是斜边长度。把两块全等三角形拼成平行四边形，就得到面积 bh，因此一块占一半。下方的图只辅助观察；即使交互不可用，这段推导仍完整。第二张图是独立的比较视图。',
  whyPrompt: '为什么公式里要除以二？',
  whyText: '这是面积公式的知识点：两块全等三角形可以拼成底为 b、高为 h 的平行四边形，其面积为 bh；每块占一半。问题指向公式原理，不应自动改答成最后一次调参的原因。',
  currentPrompt: '按我刚才调整的条件重新计算，并与初始情况比较。'
};
