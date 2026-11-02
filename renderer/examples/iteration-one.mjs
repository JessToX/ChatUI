export function g09() {
  return {
    contentId: 'gallery-g09-iteration1-v1', title: '圆内三角形：固定推导与当前实验',
    source: String.raw`这篇数学 Document 将连续正文、公式、可操作参数、图形、结果表和折叠推导放在同一阅读流中。

## 固定题设

圆半径固定为 r=2 cm，求圆内接等腰三角形的最大面积。顶点在圆顶，底边为水平弦，高度为 h。令 q=h/r。解析定义域为 0<q<2。

\[
A(q)=r^2q\sqrt{2q-q^2}
\]

原题的最优值固定在 q=3/2，此时 h=3 cm、底边 b=2√3 cm，最大面积 Amax=3√3 cm²。下方实验不会改写这个结论。

## 当前实验

初始 q=1，h=2 cm、b=4 cm、A=4 cm²。可拖动滑块，也可精确输入 q=1.5 或 1.2345。图形、读数和结果表使用同一份当前状态。空值或越界输入会提示错误，并保留上次有效图形。重置回 q=1。

:::geometry {"radius":2,"heightRatio":1,"unit":"cm"}
:::

当前实验不等于原题已改写；比较实验结果与上面的固定最大值即可检验模型。结果表明确标为“当前实验结果”，所有显示舍入都使用约等号。

:::collapse {"summary":"推导与限制（固定题设）"}
在正数定义域内，最大化 A 等价于最大化 A²。令 f(q)=q²(2q−q²)，则 f′(q)=2q²(3−2q)。在 0<q<2 内，导数在 q=3/2 处由正变负；边界面积趋于零。

\[
A_{\max}=\frac{3\sqrt{3}}{4}r^2=3\sqrt{3}\;\mathrm{cm}^2
\]

滑块只覆盖 0.05≤q≤1.95，避免退化端点。直接输入使用同一范围。本文只研究上述固定圆与等腰三角形模型，没有声称适用于任意多边形。
:::

完整文档到此结束。全文复制保留题设、初始实验结果和折叠推导；它不会冒充当前操作状态的导出。`
  };
}
export function g10() {
  return {
    contentId: 'gallery-g10-iteration1-v1', title: '实验记录：填写、校验与提交快照',
    source: `## 记录当前观察\n\n这个合成表单适合收集一次实验的名称、样本数、观察方式和备注。提交会在当前界面生成带类型的快照，不写入服务器。编辑中的值仅用于界面恢复；显式提交后，宿主支持时可把快照同步给对话。\n\n:::input-form ${JSON.stringify({ fields: [
      { id: 'title', type: 'text', label: '实验名称', required: true, maxLength: 80, hint: '例如：三角形面积观察' },
      { id: 'samples', type: 'number', label: '样本数量', value: 4, required: true, min: 1, max: 100 },
      { id: 'method', type: 'select', label: '观察方法', required: true, options: [{ value: 'direct', label: '直接观察' }, { value: 'compare', label: '对比记录' }] },
      { id: 'condition', type: 'radio', label: '条件', value: 'fixed', options: [{ value: 'fixed', label: '固定题设' }, { value: 'trial', label: '当前实验' }] },
      { id: 'checked', type: 'checkbox', label: '已核对单位', required: true },
      { id: 'notes', type: 'textarea', label: '观察记录', maxLength: 300 }
    ], note: '提交只生成当前界面的快照；修改后需要重新提交。' })}\n:::\n\n## 操作与恢复\n\n先提交空表单，焦点应转到第一个错误。补齐必填项后提交，检查数字与布尔值。修改任一字段会撤销已提交状态；重置恢复初始草稿。Gallery 的“重新载入”可验证本页内恢复。全文复制保留初始表单定义，不包含操作后的草稿或提交结果。\n\n完整表单示例到此结束。`
  };
}
