# 安全 HTML 可执行样例

参数直接传给 `render_html`，不套 config。无需完整网页、脚本或样式。以下示例用于开发与宿主验收，不是线上通过记录。

- [最小可点击折叠](examples/html-details.json)：必须成为能打开、关闭的原生 DOM，不是源码文字。
- [中文速度矢量](examples/html-velocity.json)：保留原有中文内容、三个下标和折叠解释；简单向量使用稳定的 `vector` 标记，推导使用轻量正文样式。
- [阅读／对比／代码／宽表格](examples/html-reading.json)：class 仅用稳定词汇，长代码和表格局部滚动。

普通追问示例：

```json
{"contentId":"why-negative-html-v1","html":"<p>因为把向上定为正方向，重力加速度向下，所以这里的加速度为负。<strong>负号描述方向</strong>，不表示大小为负。</p>"}
```

“改成表格”使用 `<table><thead>…</thead><tbody>…</tbody></table>`；“补充代码”使用 `<pre><code>` 并把代码中的 `<`、`>`、`&` 转义。不生成脚本、style、事件属性或未知 class。“考考我”转为整轮 `render_response` 的真实 quiz，不能用 HTML 表单模仿。

标题仅是元数据，需要显示时写入 HTML。fallbackText 可省略；显式文字不会按 HTML 处理。渲染成功不重复整篇回答；不可用或一次修正仍失败时给完整原生 Markdown。

## 简单向量与数学边界

```html
<p><span class="vector">v</span><sub>LG</sub> = <span class="vector">v</span><sub>LP</sub> + <span class="vector">v</span><sub>PG</sub></p>
```

`vector` 只包单个向量符号，下标放在外面。箭头由可信 CSS 线条绘制，不依赖字体的 Unicode 组合箭头字形，也不新增字体／脚本网络请求。无 UI 的同源兜底记作 `vec(v)`；显示 DOM 保留组合标记以便复制。已有正文或行内 code 中的 `v⃗` 会在净化后兼容处理，`pre`、`kbd`、`samp` 中的字面代码不改动。

复杂分式、矩阵、长推导及 TeX／MathML 仍整轮使用 `render_response`，不能把 TeX 字符串或 `<math>` 塞进 `render_html`。`derivation` 仅使用轻量侧边线与较小内边距；原生 details 展开后 summary 与正文保留独立间距。
