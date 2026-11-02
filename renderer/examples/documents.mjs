// Synthetic acceptance content, never presented as the user's project facts.
export const teachingSource = String.raw`## 为什么要先分离变量？

想象一个物体沿直线向前运动。这里采用一个简化的教学模型：质量保持不变，阻力大小与速度的平方成正比，并且方向与运动方向相反。我们只讨论正向运动的区间，把质量和阻力系数分别记为 \(m>0\) 与 \(k>0\)。这些条件决定了方程能够怎样变形，也决定了最后答案的适用范围。

把牛顿第二定律写成微分方程，得到下面的关系。左边描述速度随时间变化的快慢，右边说明速度越大，减速效应越强。负号表达方向关系；它不表示质量为负，也不表示我们随时可以把速度替换成速率。

\[
m\frac{dv}{dt}=-kv^2
\]

:::callout {"tone":"key","title":"先确认变量与常数"}
这一模型中，速度和时间会变化，质量与阻力系数保持不变。分离变量的目标，是让一边只留下速度及其微分，另一边只留下时间及其微分。我们是在整理同一个关系，并没有建立新的运动定律。
:::

具体操作可以分成三个判断：

- 先指出讨论区间内速度为正，因此可以除以速度的平方。
- 把所有包含速度的因子放到左边，包含时间的微分放到右边。
- 积分之后保留积分常数，再通过初始条件确定它。

这里最容易忽略的不是计算，而是除法的条件。若某个解在讨论区间中可能等于零，就不能先除以它再假装所有解都被保留下来。对本题的正向运动，我们得到 \(v^{-2}dv=-\frac{k}{m}dt\)。这一步可看作可分离微分方程的标准整理形式；它依赖前面已经说明的条件。

> 每一次变形，都应能说清楚它保留了哪些条件。

:::callout {"tone":"warning","title":"积分常数不能丢"}
两边积分后，并不是立刻得到唯一的速度函数。初速度对应的是整个解族中的一个成员。只有把初始时刻与初速度一起代入，才确定了这一条运动轨迹；任意选取积分常数都会改变题目本身。
:::

可以用一段很短的伪代码提醒自己检查顺序。它表达的是思考流程，不负责求解方程，也不能代替对正向区间、单位和初始条件的说明。

~~~text
确认模型条件
分离变量并积分
代入初值，再检查量纲
~~~

最后，回到原始方程检查结果。初始时刻应该还原给定的初速度；在正向区间，导数应该为负，与阻力导致减速一致。还要检查分母中与常数一相加的组合是否没有量纲。这些检查并不重复求解，却能够发现遗漏常数、符号错误和单位混乱。

如果仍不确定为什么这样整理，可以先问：现在这一边出现了几种会变化的量？把两边分别变成一个变量的积分，正是分离变量让问题变得可计算的原因。`;

const directive = (type, data) => `:::${type} ${JSON.stringify(data)}\n:::`;
export const quizData = { questions: [
  { id: 'q1', prompt: '速度为零时，加速度一定为零吗？', options: [{ id: 'a', label: '一定' }, { id: 'b', label: '不一定' }], correct: 'b', explanation: '最高点速度为零，重力加速度仍向下。' },
  { id: 'q2', prompt: '速度时间图的有符号面积表示什么？', options: [{ id: 'a', label: '位移' }, { id: 'b', label: '加速度' }], correct: 'a', explanation: '速度对时间积分得到位移。' }
] };
export const documentFactories = {
  teaching: () => ({ contentId: 'document-teaching-v1', source: teachingSource }),
  project: () => ({ contentId: 'document-project-v1', source: `## 示例材料整理进度\n\n这个演示项目的总量是十份材料，已收到六份、已核对三份。核对阶段包含于已收到阶段，两个数字不能相加。\n\n${directive('profile', { name: '资料整理', subtitle: '先收集，再核对', tags: ['示例项目', '分阶段核对'], summary: '这是合成验收数据。' })}\n\n${directive('progress', { total: 10, unit: '份', stages: [{ id: 'received', label: '已收到', value: 6 }, { id: 'checked', label: '已核对', value: 3, subsetOf: 'received' }] })}\n\n下一步按已收到的材料逐份核对；计数不能说明具体哪些材料已经完成。\n\n${directive('steps', { items: [{ title: '整理来源', detail: '保存提供的来源信息。' }, { title: '核对引用', detail: '逐项确认引用与原文一致。' }] })}\n\n${directive('timeline', { items: [{ title: '材料收集', detail: '持续接收材料。', status: '进行中' }, { title: '最终定稿', detail: '完成核对后安排，日期待定。' }] })}` }),
  comparison: () => ({ contentId: 'document-comparison-v1', source: `## 变量怎样分到两边？\n\n在正向运动区间，把速度与时间分别放到两边，才能各自积分。\n\n${directive('comparison', { items: [{ label: '速度变量', tex: 'v^{-2}dv', detail: '左边只含速度及其微分。', tone: 'blue' }, { label: '时间变量', tex: '-\\frac{k}{m}dt', detail: '右边只含时间及常数。', tone: 'green' }] })}\n\n:::collapse {"summary":"展开检查条件"}\n这里使用了速度不为零这一条件。质量与阻力系数保持不变。\n:::\n\n${directive('tabs', { items: [{ label: '代数检查', body: '把整理后的式子乘回原有因子，确认两边相等。' }, { label: '物理检查', body: '导数应与阻力导致的减速方向一致。' }] })}` }),
  quiz: () => ({ contentId: 'document-quiz-v1', source: `## 检查你的理解\n\n先选择，再提交。判断只依据你的实际作答；你可以重试。\n\n${directive('quiz', quizData)}\n\n作答后可以对照自己的思路，寻找把速度与加速度混淆的地方。` }),
  visual: () => ({ contentId: 'document-visual-v1', source: `## 速度与关系\n\n下面是明确给定的合成教学数据。\n\n${directive('line-chart', { xLabel: '时间', yLabel: '速度', seriesLabel: '速度', xUnit: 's', yUnit: 'm/s', points: [{ x: 0, y: 20 }, { x: 1, y: 10 }, { x: 2, y: 0 }] })}\n\n${directive('diagram', { description: '合力导致加速度。', viewBox: { width: 400, height: 240 }, elements: [{ id: 'a', kind: 'arrow', x1: 40, y1: 120, x2: 360, y2: 120, label: '合力 → 加速度' }] })}\n\n${directive('motion-lab', { initialVelocity: 20, acceleration: -10, duration: 2 })}` })
};
export const documentReferenceIndex = Object.keys(documentFactories).map(id => ({ id: `document-${id}`, title: `Rich Document · ${id}` }));
