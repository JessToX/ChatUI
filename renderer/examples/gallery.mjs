// Fixed, authored teaching material for the local offline Gallery.
// These inputs enter the existing compiler at build time; they do not emit HTML.
import { g01, g04, g05, nativeControl } from './intellectual.mjs';
import { g09, g10 } from './iteration-one.mjs';
import { computeInclineForces } from '../lib/physics.mjs';

const directive = (type, data) => `:::${type} ${JSON.stringify(data)}\n:::`;

export function g02() {
  return {
    contentId: 'gallery-g02-v1',
    title: '变化有多快？从圆锥注水到换元积分',
    source: String.raw`这两个固定例题展示怎样从关系式得到变化率，再用求导核对积分。公式来自显式题设，不调用通用求解器，也没有需要改变题设的滑块。

## 01 · 圆锥注水：先确定模型

静止圆锥的底面半径 R=3 m、高 H=6 m，水以恒定流量 Q=2 m³/s 注入，没有流出。当前水深 h=2 m。水面保持水平，圆锥尖端在下；模型只讨论 0<h<H。由相似三角形，水面半径 r_w=h/2，当前 r_w=1 m。

\[
\frac{r_w}{h}=\frac{R}{H}=\frac12
\]

\[
V=\frac13\pi r_w^2h=\frac{\pi h^3}{12}
\]

## 02 · 相关速率：保留单位和瞬时条件

对时间求导，而不是把当前 h=2 过早代入关系式：

\[
Q=\frac{dV}{dt}=\frac{\pi h^2}{4}\frac{dh}{dt}
\]

\[
\frac{dh}{dt}=\frac{4Q}{\pi h^2}
\]

\[
\left.\frac{dh}{dt}\right|_{h=2}=\frac{2}{\pi}\,\mathrm{m/s}
\]

**固定结论：dh/dt=2/π m/s≈0.6366197724 m/s。** 另一条独立核对路径是体积守恒：当前水面面积为 π·1²=π m²，单位时间进入的体积除以该面积，得到同一个高度变化率 Q/π。当前水体积 V=2π/3 m³，水面半径变化率 dr_w/dt=1/π m/s；不要把体积单位写成长度单位。

## 03 · 换元积分：再用链式法则回验

这里 x∈R 且无量纲。令 u=x²，则 du=2x dx。这个步骤不需要除以 x，也不声称 x² 在整个实数域有唯一反函数。

\[
\int 2x\cos(x^2)\,dx=\int\cos u\,du
\]

\[
\int 2x\cos(x^2)\,dx=\sin(x^2)+C
\]

\[
\frac{d}{dx}\bigl(\sin(x^2)+C\bigr)=2x\cos(x^2)
\]

**回验包含 x=0：** 两边在 x=0 都是零，不能为了换元而排除这个点。C 是任意积分常数；上面的导数关系对所有实数 x 成立。

## 04 · 边界与适用范围

圆锥在 h=0 时，水面面积为零，当前相关速率表达式奇异；不要在零高度直接使用它。到 h=H=6 m 满水时停止这个“只有注入、没有流出”的模型。当前 2/π 是 h=2 m 的瞬时速率，不是整个注水过程中不变的高度速率。

本例到此结束。先检查水面半径和单位，再用体积守恒核对圆锥结果；用链式法则核对积分，而不是把公式排版成功当作推导正确的证据。`
  };
}

export function g03() {
  const { calculation: _calculation, ...forces } = computeInclineForces({
    massKg: 2, gravityMps2: 10, inclineDeg: 30, contentId: 'gallery-g03-incline', body: '质量 2 kg 的物块'
  }).config.data;
  void _calculation;
  return {
    contentId: 'gallery-g03-v1',
    title: '运动与受力：把数值放回模型条件',
    source: String.raw`下面是两个独立的固定物理题。先读初始条件与坐标约定，再操作真实运动实验和受力图；不要把它们拼成同一个运动过程。

## 01 · 匀加速运动：先确定初始位置

一维运动采用 SI 单位：x0=0 m，v0=20 m/s，a=-10 m/s²，观察区间 0≤t≤2 s。正方向是位置增大的方向；负加速度表示速度沿负方向变化，不等于物体立即沿负方向运动。

\[
v(t)=20-10t\quad(\mathrm{m/s})
\]

\[
x(t)=20t-5t^2\quad(\mathrm{m})
\]

**固定结论：t=1 s 时，v=10 m/s，x=15 m。** 独立核对位置的方法是计算速度图下面积：前一秒的梯形面积为 (20+10)×1/2=15 m。t=2 s 时，v=0 m/s，x=20 m；速度图前两秒的三角形面积也是 20 m。

## 02 · 当前运动实验

实验初始选在 t=1 s。先只移动时间滑块，核对 t=0、1、2 s 的读数；再改变初速度或加速度，观察新实验状态。改变控件后，上面的固定结论仍属于原题设，不会自动变成新条件下的结论。重置恢复 v0=20 m/s、a=-10 m/s²、t=1 s。

` + directive('motion-lab', { initialVelocity: 20, acceleration: -10, duration: 2, time: 1, unit: 'SI' }) + String.raw`

## 03 · 光滑斜面：只画真实作用力

这是另一道题：静止、光滑的斜面上放置 m=2 kg 的物块，采用题设 g=10 m/s²，斜面向右上升，θ=30°。仅有重力与支持力，没有摩擦或外加力。全局 +x 向右、+y 向上；局部 +x′ 沿斜面向右上，故物块的沿面加速度方向是负 x′。

\[
N=mg\cos30^\circ=10\sqrt3\,\mathrm{N}
\]

\[
|F_{\mathrm{net}}|=mg\sin30^\circ=10\,\mathrm{N}
\]

\[
|a|=g\sin30^\circ=5\,\mathrm{m/s^2}
\]

**固定结论：支持力 N=10√3 N，合力大小 10 N，加速度大小 5 m/s²，方向沿斜面向左下。** 全局支持力分量为 (−5√3,15) N；重力分量为 (0,−20) N；二者相加得合力 (−5√3,−5) N。合力与分量是已有真实力的计算结果，不是第三个作用力。

` + directive('force-diagram', forces) + String.raw`

可切换坐标投影、显示或隐藏合力，核对数据表与箭头；切换显示不改变质量、g 或坡角。沿面方向的加速度为 −5 m/s²，其大小为 5 m/s²，两个表述并不矛盾。

## 04 · 定义域与自检

运动实验只展示有限时间内的匀加速模型，不模拟碰撞或复杂轨道。本斜面结论只适用于静止光滑平面上的重力与接触模型，不适用于有摩擦或额外拉力的情况；也不把题设 g=10 悄悄换成默认值。

本例到此结束。先区分速度、加速度与各自单位，再区分真实力、合力及坐标分量。`
  };
}

export const boundedBadTex = String.raw`\frac{x}{`;
export function g07() {
  return {
    contentId: 'gallery-g07-v1',
    title: '一处公式排版失败，正文仍应完整可读',
    source: String.raw`安全降级示例开始。这里使用一条有界、非禁止的坏 TeX，检验排版失败时是否保留原式和整篇文字；它不是允许执行命令的入口。

## 01 · 正常公式仍正常显示

\[
E=mc^2
\]

这条公式用于排版对照，不在本示例中讨论它的物理适用条件。

## 02 · 有界坏 TeX 保留原文

下面故意少写一个右花括号。它没有链接、HTML、样式、加载或宏定义命令；解析失败时应显示可读降级，并保留原 TeX，不能吞掉后面的文字。

\[
` + boundedBadTex + String.raw`
\]

坏公式后面的正文仍然存在。局部公式排版失败不等于整篇文档被拒绝，也不说明原 TeX 已被修正。

## 03 · 其他公式与尾部保留

\[
1+1=2
\]

正常公式、首段和最后一段都应保留。禁止命令走硬拒绝路径，由 G08 的固定边界检查单独演示，不与这里的安全降级混在一起。

安全降级示例结束。完整复制应包含原始坏 TeX、两条正常公式和这句末尾文字。`
  };
}

export function g08Quiz() {
  return {
    contentId: 'gallery-g08-quiz-v1',
    title: '真实小测验：提交后才显示评分',
    source: `测验开始。先选择一个选项，再提交；可以重试。本题是固定合成计数，不来自任何用户记录。\n\n` + directive('quiz', {
      questions: [{
        id: 'independent-counts', prompt: '两组记录分别有 4 条和 3 条，彼此没有重叠，共有多少条？',
        options: [{ id: 'a', label: '5 条' }, { id: 'b', label: '7 条' }, { id: 'c', label: '8 条' }],
        correct: 'b', explanation: '两组互不重叠时才能直接相加；4+3=7。'
      }]
    }) + `\n\n测验结束。未提交时只显示题干和选项；复制不会包含评分键或解析。`
  };
}

function g08Checks() {
  const input = (id, source) => ({ contentId: `gallery-g08-${id}`, source });
  return [
    { id: 'illegal-dsl', label: '非法 DSL 指令', expected: 'compile-rejection', input: input('illegal-dsl', ':::script {}\n:::') },
    { id: 'dangerous-key', label: '危险对象键', expected: 'compile-rejection', input: input('dangerous-key', ':::profile {"name":"边界样例","__proto__":{"polluted":true}}\n:::') },
    { id: 'unsafe-url', label: '危险 URL', expected: 'compile-rejection', input: input('unsafe-url', directive('media-panel', { items: [{ title: '边界样例', body: '这条地址必须被拒绝。', alt: '固定地址边界检查', sourceLabel: '合成测试地址', sourceUrl: 'javascript:alert(1)' }] })) },
    { id: 'budget-exceeded', label: '正文预算超限', expected: 'compile-rejection', input: input('budget-exceeded', 'x'.repeat(32769)) },
    { id: 'forbidden-tex', label: '禁止 TeX 命令', expected: 'compile-rejection', input: input('forbidden-tex', String.raw`\[\href{https://example.invalid}{x}\]`) }
  ];
}

export function createGalleryScenarios() {
  return [
    {
      id: 'G01', title: '圆内接等腰三角形最优化', mode: 'document',
      goal: '区分固定最优推导与当前实验，核对精确值、近似值和单位。',
      instructions: '移动 h/r 滑块到 1.5，观察真实图形与面积；用方向键及 Home/End 操作，再重置。',
      expected: 'r=2 cm 时，h=3 cm、b=2√3 cm、Amax=3√3 cm²；初始 h/r=1 的面积为 4 cm²。',
      limitations: '解析定义域为 0<h<2r；滑块只覆盖 0.05≤h/r≤1.95。显示舍入用≈，离线演示不代表真实宿主验收。', input: g01()
    },
    {
      id: 'G02', title: '圆锥相关速率与换元积分', mode: 'document',
      goal: '在固定条件下核对变化率、单位和链式法则回验。',
      instructions: '先由相似三角形确定水面半径，再用体积守恒核对相关速率；读到最后的定义域说明。',
      expected: 'R=3 m、H=6 m、Q=2 m³/s、h=2 m 时 dh/dt=2/π m/s；积分为 sin(x²)+C，回验包含 x=0。',
      limitations: '固定推导没有装饰性滑块；不新增通用积分求解器。零水深奇异，满水停止该模型。', input: g02()
    },
    {
      id: 'G03', title: '匀加速运动与光滑斜面', mode: 'document',
      goal: '用真实运动和受力组件核对单位、坐标及独立物理标准值。',
      instructions: '先只改变运动时间，核对 0/1/2 s；再切换受力投影与合力显示。重置恢复初始实验。',
      expected: '原题设 t=1 s 时 v=10 m/s、x=15 m；m=2 kg、g=10 m/s²、θ=30° 时 N=10√3 N、合力10 N、加速度5 m/s²。',
      limitations: '两个题目相互独立。斜面仅有重力与接触力；运动控件改值后不改写固定题设结论。', input: g03()
    },
    {
      id: 'G04', title: '哲学论证与针对性反例', mode: 'document',
      goal: '分开事实判断与价值前提，找出 A3/B3 的隐含前提及针对它们的反例。',
      instructions: '按 A1–A3、B1–B3 阅读，用 Tab 到反例 summary，再用 Enter 或 Space 展开与收起。',
      expected: '两种立场不设默认胜者；反例与尚未解决的问题都属于完整文档与复制内容。',
      limitations: '人物和情境是合成思想实验，没有哲学家引文、经验研究或可信度评分。', input: g04()
    },
    {
      id: 'G05', title: '八节合成研究长文', mode: 'document',
      goal: '在长文中追踪证据编号、计算与限制，并完整复制所有阅读材料。',
      instructions: '展开默认收起的静态章节概览；用方向键/Home/End 切换 tabs，展开审计细节，再复制完整文档。',
      expected: '八节正文、表格、代码、公式、SYN-E05 和两个 tabs 都在完整 fallback；复制失败提供只读全文。',
      limitations: '所有数字与证据均为合成材料；静态概览不声称定位、研究效果或用户理解度已验证。', input: g05()
    },
    {
      id: 'G06', title: '简单原生短答对照', mode: 'native-reference',
      goal: '说明短确认无需富文档工具，保留直接阅读的静态文本参考。',
      instructions: '阅读下面的短答参考；本场景没有组件、iframe 或装饰性控件。',
      expected: '静态原生文本参考视图：已收到。下一步先核对题设，再检查结论。',
      limitations: '这是本地文本参考，不是真实 ChatGPT UI 或 MCP widget；未测试真实原生路由。', text: nativeControl.text
    },
    {
      id: 'G07', title: '安全数学降级', mode: 'document',
      goal: '区分有界非禁止坏 TeX 的安全降级与禁止命令的硬拒绝。',
      instructions: '核对正常公式、坏公式原 TeX、坏公式后的正文与文档末尾，再检查完整复制。',
      expected: '恰有一处有界坏 TeX 降级，两条正常公式继续显示；首尾正文及原 TeX 完整保留。',
      limitations: '局部排版失败不等于修正原式。禁止命令由 G08 真实拒绝，不能用安全降级放行。', input: g07()
    },
    {
      id: 'G08', title: '错误、安全边界与测验隔离', mode: 'boundary',
      goal: '辨认真实编译拒绝、客户端 View 拒绝、安全原生 fallback 与未提交测验隔离。',
      instructions: '阅读各项边界检查结果与明确标注的原生 fallback；在下面的小测验选择、提交，再重试或切换场景。',
      expected: '五类非法输入被真实编译拒绝；篡改 View 被客户端拒绝；工具不可用显示完整安全原生 fallback。测验必须真实提交才评分。',
      limitations: '非法输入不是成功文档。工具不可用是受限本地故障模拟；没有调用 MCP 或真实 ChatGPT 宿主。',
      checks: g08Checks(),
      clientRejection: {
        mutation: 'invalid-callouts',
        input: { contentId: 'gallery-g08-client', title: '客户端拒绝的安全回退', source: '客户端回退开始。\n\n这是先经过真实编译的固定合法文档；视图随后被故意篡改。拒绝后保留这份同源安全全文。\n\n客户端回退结束。' }
      },
      toolFallback: {
        label: '工具不可用 · 安全原生 fallback（本地故障模拟）',
        input: { contentId: 'gallery-g08-tool-fallback', title: '工具不可用时仍可读的全文', source: '原生 fallback 开始。\n\n工具不可用时，显示与同一固定输入对应的完整安全文字。它不声称富文档渲染成功，也不输出危险输入或内部异常。\n\n原生 fallback 结束。' }
      },
      quizInput: g08Quiz()
    },
    {
      id: 'G09', title: '参数、图形与结果表的组合 Document', mode: 'document',
      goal: '用同一实验状态核对图形、数值、表格与语义。',
      instructions: '输入 1.5 和 1.2345，检查图形与结果表；尝试空值和越界值，再重置并展开推导。',
      expected: 'q=1.5 时 h=3 cm、b=2√3 cm、A=3√3 cm²；重置恢复 q=1、A=4 cm²。',
      limitations: '固定最优推导不随实验改写；复制是初始文档。真实宿主状态恢复未验证。', input: g09()
    },
    {
      id: 'G10', title: '基础输入表单与提交快照', mode: 'document',
      goal: '让输入、选择、校验、提交和重置形成可操作闭环。',
      instructions: '先提交空表单，再填写所有类型并提交；修改、恢复、重置，检查焦点与状态。',
      expected: '必填错误可定位；提交产生带类型的快照；修改后回到草稿；重置恢复初始值。',
      limitations: '提交不写服务器。草稿保存在 private widget state，只有显式提交可进入模型上下文；宿主同步待测。', input: g10()
    }
  ];
}

export const galleryScenarios = createGalleryScenarios();
