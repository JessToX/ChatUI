// Ten bounded fixtures corresponding to the user's reference content, not claimed real project facts.
const prose = (id, text) => ({ id, kind: 'prose', text });
const component = (id, type, data, title) => ({ id, kind: 'component', type, data, ...(title ? { title } : {}) });
const snapshot = (id, title, blocks, facts = {}) => ({ schemaVersion: 1, contentId: `reference-${id}-v1`, title, facts, blocks });
export const referenceIndex = [
  ['timeline', '项目时间线', '19.09.46'], ['progress', '完成进度', '19.09.51'], ['profile', '风格档案', '19.09.55'], ['rhythm', '叙事节奏', '19.10.06'],
  ['comparison', '左右公式对照', '19.10.22'], ['derivation', '推导步骤', '19.10.31'], ['quiz', '五题测验', '19.10.35'], ['chart', '速度曲线', '19.10.47'],
  ['geometry', '圆与三角形', '19.10.54'], ['answer', '最终答案', '19.11.04']
].map(([id, label, screenshot]) => ({ id, label, screenshot: `截屏2026-09-25 ${screenshot}.png` }));
export const responseFactories = {
  timeline: () => snapshot('timeline', '从资料到定稿', [
    prose('intro', '先看已经确认的阶段，再看下一步。下面是**排版演示数据**，不是对真实项目状态的推断。'),
    component('timeline', 'timeline', { items: [
      { date: '2026 年 5 月', title: '第一批资料归档', detail: '保存原始材料与版本来源，为后续核对提供依据。', status: '已确认', tone: 'green' },
      { date: '2026 年 6 月', title: '引用逐项核对', detail: '这一阶段仍有待确认内容。未知结论不提前标为完成。', status: '待核实', tone: 'orange' },
      { date: '日期待定', title: '汇总与定稿', detail: '核对完成后再确定交付日期，不从现有进度推测截止时间。', status: '计划', tone: 'blue' }
    ] }), prose('next', '时间线表达**先后关系与已知状态**；没有依据的日期，保留为“待定”。')
  ]),
  progress: (changed = false) => ({ ...snapshot(changed ? 'progress-changed' : 'progress', '材料整理到哪里了？', [
    prose('intro', '演示项目共 {{total}}，其中 {{done}}已收到。这个比例只表示**资料覆盖**，不表示内容已经核对或定稿。'),
    component('progress', 'progress', { value: { fact: 'done' }, total: { fact: 'total' }, unit: '份', label: '已收到的材料', note: '同一分母、同一单位；不把收集完成等同于审核完成。', details: ['资料收集：以已收到数量为准', '引用核对：状态待确认', '最终定稿：尚无完成依据'] }),
    prose('next', '下一步是核对已收到材料的来源。仅有数量时，不生成“哪些章节已完成”的虚构清单。')
  ], { total: { value: changed ? 12 : 10, unit: '份', label: '总材料' }, done: { value: changed ? 8 : 6, unit: '份', label: '已收到' } }) }),
  profile: () => snapshot('profile', undefined, [
    component('style', 'profile', { eyebrow: 'STYLE PROFILE · 风格档案', name: '现代白话文学叙事', subtitle: '让动作推进故事，把情绪留在细节里。', tags: ['克制', '稳定视角', '感官细节', '留白', '自然对白'], summary: '这是一种可讨论的写作方向，不是必须套用的模板。它追求清楚、连贯的阅读体验，让具体事物承载情绪。' }),
    prose('analysis', '## 从“解释感受”转向“写出动作”\n\n不要反复说明人物很紧张。可以写他把信折好，又展开，最后塞进外套内袋。动作与物件会让读者自己感到迟疑。\n\n**视角保持稳定。** 只写当前人物能够观察到的细节；需要改变视角时，给出清楚的段落过渡。'),
    { id: 'versions', kind: 'tabs', items: [
      { id: 'direct', label: '直说情绪', blocks: [{ id: 'direct-quote', kind: 'quote', text: '他很紧张，不知道该不该离开。' }] },
      { id: 'concrete', label: '动作与细节', blocks: [{ id: 'concrete-quote', kind: 'quote', text: '车已经到了。他把信折好，手却还停在口袋外。' }, prose('concrete-note', '这不是唯一正确的改法。选择哪一种，取决于这一段的叙事距离。')] }
    ] }
  ]),
  rhythm: () => snapshot('rhythm', '这一版的叙事节奏', [
    prose('intro', '把篇幅留给发生变化的时刻。横条是**定性关注度**，不是实测字数、时长或完成率。'),
    component('rhythm', 'rhythm', { items: [{ label: '整理行李', emphasis: 'brief' }, { label: '读到来信', emphasis: 'moderate' }, { label: '走向车站', emphasis: 'brief' }, { label: '站台相遇', emphasis: 'focus' }, { label: '列车出发', emphasis: 'moderate' }], note: '简写 → 适度展开 → 重点展开；不表示百分比。' }),
    prose('why', '相遇让人物关系发生改变，因此值得慢下来。路上的过渡可以更短，不需要为每个动作分配相同篇幅。')
  ]),
  comparison: () => snapshot('comparison', '把变量放到各自一边', [
    prose('intro', '在 $m>0$、$k>0$ 且 $v>0$ 的模型中，阻力满足 $m\\,\\frac{dv}{dt}=-kv^2$。两边同除以 $mv^2$ 后：'),
    component('sides', 'comparison', { items: [
      { label: '左边 · 速度变量', tone: 'blue', tex: String.raw`v^{-2}\,dv`, detail: '只含速度 v 及其微分，接下来对 v 积分。' },
      { label: '右边 · 时间与常数', tone: 'green', tex: String.raw`-\frac{k}{m}\,dt`, detail: 'k 与 m 在本模型里为常数，接下来对 t 积分。' }
    ] }), prose('check', '这里用到了 $v\\ne0$，所以必须先说明适用范围。排版不能掩盖除法和模型本身的条件。')
  ]),
  derivation: () => snapshot('derivation', '从受力到速度关系', [
    prose('intro', '设质量 $m>0$、阻力系数 $k>0$ 为常数，初速度 $v_0>0$。下面只讨论 $t\\ge0$ 时的正向运动。'),
    component('steps', 'steps', { items: [
      { title: '建立运动方程', tex: String.raw`m\frac{dv}{dt}=-kv^2`, detail: '负号表示阻力与速度方向相反。' },
      { title: '分离变量', tex: String.raw`\frac{dv}{v^2}=-\frac{k}{m}\,dt`, detail: '在 v>0 的范围内进行除法，两边分别积分。' },
      { title: '使用初始条件', tex: String.raw`-\frac{1}{v}+\frac{1}{v_0}=-\frac{k}{m}t`, detail: '采用 v(0)=v₀，避免丢掉积分常数。' },
      { title: '整理速度表达式', tex: String.raw`v(t)=\frac{v_0}{1+\frac{k v_0}{m}t}`, detail: 't≥0 时分母为正，速度逐渐下降但保持正值。' }
    ] }),
    { id: 'check', kind: 'collapse', summary: '展开：初值与量纲检查', blocks: [prose('check-content', '代入 $t=0$ 得 $v(0)=v_0$。又因 $[k]=\\mathrm{kg}/\\mathrm{m}$，所以 $kv_0t/m$ 无量纲，可以与 1 相加。')] }
  ]),
  quiz: () => snapshot('quiz', '把理解变成五次判断', [
    prose('intro', '选择全部答案后再提交。这里只根据你的实际选择评分；可以重试，也可以把结果带入下一轮讨论。'),
    component('quiz', 'quiz', { questions: [
      { id: 'q1', prompt: '忽略空气阻力，上抛物体到最高点时，哪项正确？', options: [{ id: 'a', label: '速度为零，加速度向下' }, { id: 'b', label: '速度和加速度都为零' }, { id: 'c', label: '速度向上，加速度为零' }], correct: 'a', explanation: '最高点的瞬时速度为零，但重力仍使速度向下变化。' },
      { id: 'q2', prompt: '速度—时间图的有符号面积表示什么？', options: [{ id: 'a', label: '加速度' }, { id: 'b', label: '位移' }, { id: 'c', label: '路程' }], correct: 'b', explanation: '速度对时间的积分为位移；路程需要积分速度的绝对值。' },
      { id: 'q3', prompt: 'v(t)=20−10t（SI单位），加速度为多少？', options: [{ id: 'a', label: '20 m/s²' }, { id: 'b', label: '10 m/s²' }, { id: 'c', label: '−10 m/s²' }], correct: 'c', explanation: '加速度为速度对时间的导数，因此是 −10 m/s²。' },
      { id: 'q4', prompt: 'm>0，合力不为零时，把力分解到两条轴上，会增加真实力的数量吗？', options: [{ id: 'a', label: '会，每个分量都是新增的力' }, { id: 'b', label: '不会，只是同一个力的表示' }], correct: 'b', explanation: '分力是数学表示，不能再作为额外的真实力重复求和。' },
      { id: 'q5', prompt: '6/10 份资料已经收到，能据此断定什么？', options: [{ id: 'a', label: '所有资料已审核完成' }, { id: 'b', label: '前六章已经定稿' }, { id: 'c', label: '资料接收覆盖率为 60%' }], correct: 'c', explanation: '数量说明覆盖比例，不提供审核状态或资料身份。' }
    ], followUp: '根据我实际提交的这五题结果，简短解释错题；全对时给一道新的迁移练习。' })
  ]),
  chart: (changed = false) => snapshot(changed ? 'chart-changed' : 'chart', '速度为什么会变成负数？', [
    prose('intro', '教学模型：忽略空气阻力，取向上为正。初速度为 {{v0}}，重力加速度大小取 {{g}}；负速度只表示向下运动。'),
    { id: 'velocity', kind: 'math', tex: String.raw`v(t)={{v0|value}}-{{g|value}}t`, label: '速度 · SI 单位', detail: '斜率为 −g，速度不是路程。' },
    component('chart', 'line-chart', { xLabel: '时间 t', xUnit: 's', yLabel: '速度 v', yUnit: 'm/s', seriesLabel: '上抛物体', tone: 'green', points: [0, 1, 2, 3, 4].map(t => ({ x: t, y: 20 - (changed ? 9.81 : 10) * t })), note: '点可悬停或用键盘聚焦；有符号面积对应位移。' }),
    prose('read', '图线穿过横轴时，物体到达最高点。之后速度为负，而加速度仍然向下。')
  ], { v0: { value: 20, unit: 'm/s' }, g: { value: changed ? 9.81 : 10, unit: 'm/s²' } }),
  geometry: () => snapshot('geometry', '圆、弦与三角形高度', [
    prose('intro', '图中 $O$ 是圆心，$AD\\perp BC$，$D$ 是底边中点。蓝色边、虚线半径与直角标记分别表示不同几何关系。'),
    { id: 'geometry', kind: 'diagram', description: 'A、B、C 在同一个圆上，AD 为高且垂直 BC；OD 与 AD 共线，OC 为半径。图示选取 h=1.5r，坐标由这些关系计算。', viewBox: { width: 500, height: 370 }, elements: [
      { id: 'circle', kind: 'circle', cx: 250, cy: 190, r: 120, tone: 'neutral' },
      { id: 'triangle', kind: 'path', tone: 'blue', fill: 'soft', commands: [{ op: 'M', values: [250, 70] }, { op: 'L', values: [146.0769515, 250] }, { op: 'L', values: [353.9230485, 250] }, { op: 'Z', values: [] }] },
      { id: 'height', kind: 'line', x1: 250, y1: 70, x2: 250, y2: 250, dashed: true, tone: 'blue', label: 'h', labelX: 269, labelY: 132 },
      { id: 'radius', kind: 'line', x1: 250, y1: 190, x2: 353.9230485, y2: 250, dashed: true, tone: 'orange', label: 'r', labelX: 317, labelY: 208 },
      { id: 'right-angle', kind: 'path', tone: 'neutral', commands: [{ op: 'M', values: [250, 238] }, { op: 'L', values: [262, 238] }, { op: 'L', values: [262, 250] }] },
      { id: 'a', kind: 'point', x: 250, y: 70, label: 'A', labelY: 44, tone: 'blue' },
      { id: 'b', kind: 'point', x: 146.0769515, y: 250, label: 'B', labelX: 127, labelY: 268, tone: 'blue' },
      { id: 'c', kind: 'point', x: 353.9230485, y: 250, label: 'C', labelX: 375, labelY: 268, tone: 'blue' },
      { id: 'o', kind: 'point', x: 250, y: 190, label: 'O', labelX: 228, labelY: 190, tone: 'orange' },
      { id: 'd', kind: 'point', x: 250, y: 250, label: 'D', labelY: 277, tone: 'neutral' },
      { id: 'base', kind: 'text', x: 250, y: 331, text: 'BC = 2√(2rh − h²)', fontSize: 20, tone: 'blue' }
    ] },
    { id: 'relation', kind: 'math', tex: String.raw`\left(\frac{BC}{2}\right)^2+(h-r)^2=r^2`, label: '直角三角形 ODC', detail: '由勾股关系得到 BC，再求面积。图形关系与公式使用同一个 h 和 r。' },
    { id: 'experiment', kind: 'collapse', summary: '展开：用滑块改变 h/r', blocks: [component('local-geometry', 'geometry', { radius: 3, heightRatio: 1.5, unit: 'cm' }), prose('experiment-note', '实验只改变此处的本地观察值，不把上面的固定示意图说成已经更新。')] }
  ]),
  answer: () => snapshot('answer', '让结论带上单位与含义', [
    prose('intro', '教学示例：圆柱**侧面积** $S=2\\pi rh$。当前半径 {{r}}、高度 {{h}}，两者的增长率均为 {{rate}}。不把侧面积混同于包含底面的总表面积。'),
    { id: 'substitution', kind: 'math', tex: String.raw`\frac{dS}{dt}=2\pi\left(h\frac{dr}{dt}+r\frac{dh}{dt}\right)=2\pi({{h|value}}\times{{rate|value}}+{{r|value}}\times{{rate|value}})`, label: '乘积法则' },
    component('answer', 'answer', { label: '最终答案 · 正值', title: '侧面积正在增加', tex: String.raw`\frac{dS}{dt}={{coefficient|value}}\pi\;\mathrm{mm}^2/\mathrm{s}`, detail: '正号表示增加，mm²/s 表示每秒增加的面积。' }),
    prose('check', '这一步既检查数值，也检查量纲。变化率与当前面积不是同一个量。')
  ], { r: { value: 7, unit: 'mm' }, h: { value: 7, unit: 'mm' }, rate: { value: 1, unit: 'mm/s' }, coefficient: { value: 28 } })
};
// Omit optional keys instead of putting undefined in JSON-only tool arguments.
for (const [id, factory] of Object.entries(responseFactories)) responseFactories[id] = (...args) => JSON.parse(JSON.stringify(factory(...args)));
