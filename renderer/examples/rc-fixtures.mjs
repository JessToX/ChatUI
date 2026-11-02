import { compileDocumentInput } from '../lib/document-normalization.mjs';
import { documentFactories } from './documents.mjs';
const directive = (type, data, body = '') => `:::${type} ${JSON.stringify(data)}\n${body}\n:::`;
export const calculus = { contentId: 'rc-calculus-v1', title: '微积分合成验收', source: String.raw`## 微积分：从导数到积分
对 $f(x)=x^3$，导数 $f'(x)=3x^2$ 表示局部变化率。

$$\int_0^1 3x^2\,dx=1$$

:::callout {"tone":"key","title":"检查区间与常数"}
定积分累计区间内的变化。求不定积分时必须保留积分常数。
:::

$$\int 3x^2\,dx=x^3+C$$

由 $F'(x)=f(x)$ 得到 $\int_a^b f(x)\,dx=F(b)-F(a)$。
最后检查：定积分结果是 1，不定积分是一个函数族。` };
export const physics = { contentId: 'rc-physics-v1', title: '物理合成验收', source: String.raw`## 恒力与变力
在质量恒定的直线模型里，$F=ma$。当合力恒定，$a=F/m$。

$$v(t)=v_0+at$$

$$x(t)=x_0+v_0t+\frac12at^2$$

` + directive('comparison', { items: [{ label: '恒力', detail: '加速度恒定，速度随时间线性变化。', tex: 'a=F/m' }, { label: '变力', detail: '先建立随时间的加速度，再积分。', tex: String.raw`v(t)=v_0+\int_0^t a(s)\,ds` }] }) + '\n\n最后检查单位、初值和模型适用范围。' };
export const project = documentFactories.project(); project.contentId = 'rc-project-v1';
export const quiz = documentFactories.quiz(); quiz.contentId = 'rc-quiz-v1';
export const broken = { contentId: 'rc-malformed-v1', source: '## 失败保护验收\n前面的正文和 $x^2$。错误公式：$\\frac{x}{$。后面的正文必须保留。\n\n' + directive('comparison', { items: [{ label: '坏公式', mathLabel: '合成错误公式', tex: String.raw`\unknownCommand{x}` }, { label: '好公式', tex: 'E=mc^2' }] }) + '\n\n文档结束标记 RC-END。' };
export const long = { contentId: 'rc-long-v1', title: '长篇阅读合成验收', source: Array.from({length:16},(_,i)=> `## 第 ${i+1} 节：理解变化\n\n` + '这是一段用于阅读验收的合成说明。我们先写清楚对象、变量、条件与初始值，再讨论推导中每一步保留的意义。读者应能够从连续正文走向局部公式，再回到解释，避免把一张组件误当成完整回答。检查模型边界能够避免把局部结论误用到新的条件下。'.repeat(4) + '\n\n' + directive('callout',{tone:'note',title:`第 ${i+1} 节检查`}, '本节只描述合成内容。公式 $f(x)=x^2$ 与导数 $f\'(x)=2x$ 对应。') ).join('\n\n') + '\n\n## RC-LONG-END\n长篇阅读结束。' };
export const fixtures = { calculus, physics, project, quiz, long, broken };
export const responseFor = input => compileDocumentInput(input).response;
