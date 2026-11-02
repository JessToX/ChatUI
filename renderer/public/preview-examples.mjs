// Complete teaching snapshots. These are illustrative data, not user project records.
const mi = text => ({ tag: 'mi', text });
const mo = text => ({ tag: 'mo', text });
const mn = text => ({ tag: 'mn', text });
const row = (...children) => ({ tag: 'mrow', children });
const sub = (base, text) => ({ tag: 'msub', children: [mi(base), mn(text)] });
const frac = (top, bottom) => ({ tag: 'mfrac', children: [top, bottom] });
const fact = (id, format = 'value') => ({ fact: id, ...(format === 'value' ? {} : { format }) });
const mf = id => mn(fact(id, 'text'));
const component = (id, type, title, data) => ({ id, kind: 'component', type, title, data });
const prose = (id, title, text, eyebrow) => ({ id, kind: 'prose', ...(title ? { title } : {}), text, ...(eyebrow ? { eyebrow } : {}) });
const text = (id, x, y, value, tone = 'neutral', fontSize = 22) => ({ id, kind: 'text', x, y, text: value, tone, fontSize });
const arrow = (id, x1, y1, x2, y2, tone = 'blue') => ({ id, kind: 'arrow', x1, y1, x2, y2, tone });

export function learningExample({ initialVelocity = 20, gravity = 10 } = {}) {
  if (!Number.isFinite(initialVelocity) || initialVelocity < 2 || initialVelocity > 50 || !Number.isFinite(gravity) || gravity < 2 || gravity > 20) throw new Error('初速度应为 2–50 m/s，重力加速度应为 2–20 m/s²。');
  const topTime = initialVelocity / gravity;
  const facts = {
    v0: { value: initialVelocity, unit: 'm/s', label: '初速度' },
    g: { value: gravity, unit: 'm/s²', label: '重力加速度' },
    acceleration: { value: -gravity, unit: 'm/s²' },
    topTime: { value: topTime, unit: 's', precision: 2 },
    zero: { value: 0, unit: 'm/s' },
    halfSpeed: { value: initialVelocity / 2, unit: 'm/s' },
    duration: { value: topTime * 2, unit: 's' }
  };
  const ball = y => ({ id: 'ball', kind: 'point', x: 96, y, r: 8, tone: 'green', label: '小球', labelX: 47, labelY: y });
  return {
    schemaVersion: 1, contentId: `learning-v3-v${initialVelocity}-g${gravity}`, title: '最高点静止了，为什么加速度还在？', facts,
    blocks: [
      prose('start', undefined, '速度描述“这一刻怎样运动”，加速度描述“速度正在怎样改变”。两者不是同一个量。\n\n这个教学示例忽略空气阻力，明确取初速度 {{v0}}、重力加速度 {{g}}，向上为正方向。', '学习讲解 · 可操作示例'),
      { id: 'formulaPair', kind: 'group', layout: 'parallel', blocks: [
        { id: 'velocity', kind: 'math', title: '速度会经过零点', label: '描述运动状态', tone: 'blue', math: row(mi('v'), mo('='), sub('v', '0'), mo('−'), mi('g'), mi('t')), detail: '初速度 {{v0}}，随着时间增加，速度逐渐减小。' },
        { id: 'acceleration', kind: 'math', title: '加速度保持向下', label: '描述速度的变化', tone: 'green', math: row(mi('a'), mo('='), frac(row(mi('d'), mi('v')), row(mi('d'), mi('t'))), mo('='), mo('−'), mi('g')), detail: '本例 a = {{acceleration}}。速度为零，并不会让重力消失。' }
      ] },
      prose('deriveIntro', '从方程走到最高点', '先写出速度关于时间的关系，再问：它什么时候恰好为零？展开下面的推导，检查代入的数值与单位。'),
      component('derivation', 'reveal-steps', '逐步推导', { initialVisible: 1, items: [
        { title: '从恒定加速度得到速度关系', math: row(mi('v'), mo('='), mf('v0'), mo('−'), mf('g'), mi('t')), mathLabel: 'v 等于初速度减去 g 乘 t；各量使用 SI 单位', detail: '在 SI 单位下，时间以秒计、速度以米每秒计。' },
        { title: '在最高点代入 v = 0', math: row(mi('t'), mo('='), frac(sub('v', '0'), mi('g')), mo('='), mf('topTime'), { tag: 'mtext', text: ' s' }), mathLabel: '最高点时间等于初速度除以重力加速度', detail: '到达最高点的时间为 {{topTime}}。' },
        { title: '再检查加速度，而不是猜测', math: row(mi('a'), mo('='), mo('−'), mi('g'), mo('≠'), mn('0')), mathLabel: '加速度等于负 g，不等于零', detail: '最高点是速度改变符号的一瞬间，不是重力停止作用的一段时间。' }
      ] }),
      { id: 'ballStates', kind: 'diagram', title: '切换三个瞬间，看方向而不是只看数值', description: '位置与箭头长度仅作示意，不表示实际高度或大小。蓝色表示速度，橙色表示加速度；两者不是新增的外力。', viewBox: { width: 400, height: 290 }, initialState: 'top', elements: [
        { id: 'ground', kind: 'line', x1: 26, y1: 265, x2: 380, y2: 265, tone: 'neutral', dashed: true },
        text('direction', 250, 34, '向上为正方向'),
      ], states: [
        { id: 'up', label: '上升', description: '上升途中：速度向上，加速度向下。小球在减速。', elements: [ball(196), arrow('velocityArrow', 96, 196, 96, 113), arrow('accelerationArrow', 160, 196, 160, 252, 'orange'), text('velocityLabel', 270, 126, 'v > 0，向上', 'blue'), text('accelerationLabel', 270, 226, 'a = {{acceleration}}', 'orange')] },
        { id: 'top', label: '最高点', description: '到达最高点：v = {{zero}}，但 a = {{acceleration}}。重力仍然作用。', elements: [ball(94), arrow('accelerationArrow', 160, 94, 160, 166, 'orange'), text('velocityLabel', 270, 94, 'v = {{zero}}', 'blue'), text('accelerationLabel', 270, 184, 'a = {{acceleration}}', 'orange')] },
        { id: 'down', label: '下降', description: '下降途中：速度与加速度都向下。速度的大小在增加。', elements: [ball(150), arrow('velocityArrow', 96, 150, 96, 222), arrow('accelerationArrow', 160, 150, 160, 207, 'orange'), text('velocityLabel', 270, 226, 'v < 0，向下', 'blue'), text('accelerationLabel', 270, 144, 'a = {{acceleration}}', 'orange')] }
      ] },
      prose('experimentIntro', '再把“一瞬间”放回完整过程', '拖动时间，观察速度曲线在最高点穿过零点，而斜率仍保持 −g。下面是独立实验：若在实验里修改参数，结果以实验当前读数为准；上面的已知条件仍属于这份讲解快照。'),
      component('motion', 'motion-lab', '速度—时间实验', { initialVelocity: fact('v0'), acceleration: fact('acceleration'), duration: fact('duration'), time: 0 }),
      component('takeaway', 'answer', '抓住最重要的区别', { label: '结论', title: '瞬时静止，不等于没有加速度', math: row(mi('v'), mo('='), mn('0'), mo('，'), mi('a'), mo('≠'), mn('0')), mathLabel: '在最高点，速度为零但加速度不为零', detail: '看速度判断运动方向；看加速度判断速度怎样变化。本例最高点 t = {{topTime}}，a = {{acceleration}}。' })
    ]
  };
}

export function writingExample({ focus = 'arrival' } = {}) {
  if (!['arrival', 'waiting'].includes(focus)) throw new Error('写作示例只支持 arrival 或 waiting。');
  const waiting = focus === 'waiting';
  return {
    schemaVersion: 1, contentId: `writing-v3-${focus}`, title: '让叙事重点落在真正发生变化的地方', facts: { focus: { value: waiting ? '等待中的犹疑' : '装甲车出现', label: '叙事重点' } },
    blocks: [
      prose('writingStart', undefined, '这一页分析一段虚构的出发场景，不替你把完整小说拆成卡片。先确定这段文字要让读者注意什么，再安排解释、动作与留白。', '写作分析 · 可操作示例'),
      component('voice', 'profile', '这一段的写作方向', { eyebrow: 'NARRATIVE STYLE PROFILE', name: '克制，但让细节有重量', subtitle: 'Restrained Prose · Concrete Detail', tags: ['具体动作', '稳定视角', '适度留白', '短句落点'], summary: '不是每个环节都写得一样重。当前重点是“{{focus}}”，其余内容为它提供方向和压力。' }),
      prose('optionsIntro', '两种方案，改变的是读者先看见什么', '信息优先更利于交代任务；感受优先更利于建立紧张。并不是哪种一定更好，而是要与这一段的目的保持一致。'),
      component('alternatives', 'comparison', '同一个场景，两种推进方式', { items: [
        { label: '方案 A · 信息优先', title: '先让读者知道要去哪里', detail: '把任务、路线与装备交代清楚，再进入出发动作。适合读者需要迅速理解局面的段落。', tone: 'blue' },
        { label: '方案 B · 感受优先', title: '先让读者感到出发的压力', detail: '从等待、声音或一次停顿切入，信息随行动逐步显露。适合把注意力留在人物身上的段落。', tone: 'green' }
      ] }),
      prose('rhythmIntro', '这一版的叙事节奏', '下面只表示叙事关注度，不是字数、时长或精确配额。重点变化后，整份示例会重新生成，避免说明文字与节奏图各说各话。'),
      component('rhythm', 'rhythm', '章节结构示意', { note: '定性示意：一笔带过 / 适度展开 / 重点描写。', items: [
        { label: '收拾物资', emphasis: 'brief' }, { label: '任务说明', emphasis: 'moderate' }, { label: '离开诊所', emphasis: 'brief' },
        { label: '等待', emphasis: waiting ? 'focus' : 'brief' }, { label: '装甲车出现', emphasis: waiting ? 'moderate' : 'focus' }, { label: '装车出发', emphasis: 'moderate' }
      ] }),
      prose('continuous', '让正文保持连贯', waiting
        ? '门外一直没有动静。她把背包的扣带收紧，又松开，指尖停在那一道旧裂口上。走廊尽头的钟走过一格，声音比她想象中更响。\n\n有人从屋里问要不要再等五分钟。她没有回头，只把门推开了一点。冷风挤进来，桌上的纸翻过半页。'
        : '她把最后一卷绷带塞进侧袋，扣上背包。走廊里的灯灭了一盏，门外仍是灰白的晨雾。\n\n履带的声音先抵达。窗框轻轻震动，水杯里的波纹碰到了杯沿。她抬起头，看见装甲车从雾里露出半边轮廓。\n\n没有人再问出发的时间。她拉紧肩带，跟着前面的人走了出去。'),
      prose('writingClose', '需要控制的，不只是长短', '保留一个明确的变化点，让前面的细节为它蓄力。完整创作或翻译要求仍以连续正文为主；这里只用少量视觉帮助你判断结构。')
    ]
  };
}

export function progressExample({ total = 10, drafted = 6, reviewed = 3 } = {}) {
  if (![total, drafted, reviewed].every(Number.isInteger) || total < 1 || total > 1000 || reviewed < 0 || drafted < reviewed || drafted > total) throw new Error('总量需为 1–1000 的整数，并满足 0 ≤ 已核对 ≤ 已成稿 ≤ 总量。');
  return {
    schemaVersion: 1, contentId: `progress-v3-${total}-${drafted}-${reviewed}`, title: '先分清“成稿”和“核对”，再谈进度', facts: {
      total: { value: total, unit: '章' }, drafted: { value: drafted, unit: '章' }, reviewed: { value: reviewed, unit: '章' }, remaining: { value: total - drafted, unit: '章' }
    }, blocks: [
      prose('progressStart', undefined, '这是一组可修改的演示数据：共 {{total}}，其中 {{drafted}} 已成稿，{{reviewed}} 已核对。已核对是已成稿的子集，不能把两者相加当作完成量。', '项目进展 · 可操作示例'),
      component('stages', 'progress', '当前阶段进度', { total: fact('total'), unit: '章', stages: [
        { id: 'drafted', label: '已成稿', value: fact('drafted') }, { id: 'reviewed', label: '已核对', value: fact('reviewed'), subsetOf: 'drafted' }
      ], note: '两个阶段共享同一个总量；子集不是额外完成量。', details: ['尚有 {{remaining}} 未成稿。', '这些计数不说明具体哪些章节已完成，也不代表已定稿。'] }),
      prose('historyIntro', '时间线，只保留已经给出的状态', '示例没有提供真实日期或章节名称，因此不补造时间，也不把未完成章节编成一份具体清单。下面区分当前记录和计划中的下一阶段。'),
      component('history', 'timeline', '从当前记录到下一阶段', { note: '演示状态；日期未提供，时间待定。', items: [
        { title: '记录成稿数量', detail: '已确认 {{drafted}} 成稿；其余 {{remaining}} 尚未成稿。', status: '当前记录', tone: 'blue' },
        { title: '记录核对数量', detail: '其中 {{reviewed}} 已核对；与成稿阶段存在包含关系。', status: '当前记录', tone: 'green' },
        { title: '继续推进与核对', detail: '需要先确认具体章节和质量标准，再制定针对性的安排。', status: '下一阶段 · 时间待定', tone: 'orange' }
      ] }),
      prose('progressClose', '条件变了，所有表达一起变', '在预览上方改总量、成稿或核对数量，点击“更新完整快照”。正文、计数、分母、阶段条和时间线都由同一组 facts 更新；不只改某一条进度条。')
    ]
  };
}

export function causalExample() {
  return { schemaVersion: 1, contentId: 'causal-v3', title: '把模板之外的反馈关系画出来', facts: {}, blocks: [
    prose('causeStart', undefined, '这张图表达一种待核实的流程假设，不把相关性直接说成已经证实的因果。结构化路径可表示回路，而不需要执行 SVG 或公式字符串。'),
    { id: 'loop', kind: 'diagram', title: '需求澄清与返工的反馈回路', description: '箭头表示假设中的影响方向；不是数据测量，也没有精确强度。', viewBox: { width: 400, height: 430 }, elements: [
      { id: 'unclear', kind: 'rect', x: 65, y: 30, width: 270, height: 65, label: '需求尚不清晰', tone: 'blue', fill: 'soft' },
      arrow('first', 200, 95, 200, 151),
      { id: 'redo', kind: 'rect', x: 65, y: 155, width: 270, height: 65, label: '实现后出现返工', tone: 'orange', fill: 'soft' },
      arrow('second', 200, 220, 200, 276, 'orange'),
      { id: 'lessTime', kind: 'rect', x: 65, y: 280, width: 270, height: 65, label: '澄清时间被挤占', tone: 'green', fill: 'soft' },
      { id: 'feedback', kind: 'path', tone: 'neutral', dashed: true, commands: [{ op: 'M', values: [65, 312] }, { op: 'L', values: [29, 312] }, { op: 'L', values: [29, 62] }, { op: 'L', values: [59, 62] }] },
      arrow('feedbackTip', 43, 62, 64, 62, 'neutral'), text('feedbackLabel', 200, 394, '回路提示：先留出澄清时间', 'neutral', 20)
    ] },
    prose('causeClose', undefined, '下一步需要观察真实案例，确认哪一环节成立。图帮助提出问题，不替代证据。')
  ] };
}

export const exampleFactories = { learning: learningExample, writing: writingExample, progress: progressExample, causal: causalExample };
