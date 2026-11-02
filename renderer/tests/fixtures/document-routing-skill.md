---
name: chatui
description: 在测试环境用一个 Rich Document 连续呈现正文、数学、视觉结构和交互。简短回答及明确纯文本请求保留原生回复。
---

# ChatUI Rich Document v1 — TEST ONLY

这是隔离测试配置，未替换生产 Skill。自然追问继承相关已知条件。

先在工具参数 source 内准备本轮正文，不在工具调用前输出一份完整原生讲解。成功后原生消息仅保留必要的引用、文件或短衔接，不再重复同一回答的摘要、表格或公式块。追问继承最近确认的条件；条件变化用新 contentId，不口头改写旧消息。本规则需要真实宿主 A/B 验收；本地契约检查不能证明模型遵从。

- 简短确认、短事实、逐字翻译、只用纯 Markdown：原生回复。
- 较完整的讲解、分析、比较、进度梳理：优先一次 `render_document`。
- 单独测验、图表或实验：可用独立结构化组件。
- 给定数值的图表必须用数据驱动的 line-chart 组件（文档或结构化入口），不能改成图片生成或静态图像；测验必须有真实选择与提交计分。
- `render_html` 保留为兼容/特殊语义文档入口，`render_response` 保留为兼容/高级结构化入口。

调用 `{contentId, source, title?, theme?:"native"}`。正文直接写 Markdown：标题、段落、列表、引用、强调、HTTPS 链接、围栏代码和静态表格。数学写 `\(TeX\)` / `\[TeX\]`；兼容 `$TeX$` / `$$TeX$$`。原始 HTML 只按字面文字显示，不写 JS、CSS 或原始 SVG。

TeX 的反斜杠只做一次 JSON 序列化转义；数学定界符内不要额外转义下划线、逗号或命令。若有界公式排版失败，文档逐公式保留原始 TeX 和提示，其余内容继续显示。禁止命令和总量限制仍拒绝。

Quiz 的选择与判分在当前挂载内有效；v1 不承诺 ChatGPT MCP Apps 刷新或重开后的可靠恢复。宿主没有回放有效、身份匹配的私有状态时回到未作答，不从模型上下文推断或恢复答案。

指令严格从行首开始：

```text
:::callout {"tone":"key","title":"核心结论"}
普通 Markdown 正文。
:::

:::progress {"label":"已收到","value":6,"total":10,"unit":"份"}
:::
```

JSON 可以跨行；关闭后指令正文另起一行。callout 的 tone 为 key/note/warning/success，title 可省略。callout 和 collapse 必须含 Markdown 正文，不能嵌套指令。collapse 选项 `{summary,open?}`。tabs 选项 `{items:[{label,body},...]}`，body 仅为 Markdown，共 2–8 项。

其他指令无正文，使用现有组件数据字段：

- progress：`{value,total,label?,unit?,note?,details?}` 或 `{total,stages:[{id,label,value,subsetOf?}],unit?}`；不得合计包含阶段。
- profile：`{name,eyebrow?,subtitle?,tags?,summary?}`。
- comparison：`{items:[{label,title?,detail?,tex?,mathLabel?,tone?}]}`，1–4 项。
- steps/timeline：`{items:[{title,detail,date?,status?,tex?,mathLabel?,tone?}]}`；时间、状态必须有依据。
- quiz：`{questions:[{id,prompt,options:[{id,label}],correct,explanation}],followUp?}`，1–12 题；correct 指向选项 id。不要在提交前正文泄露答案；fallback 服务端隐藏评分键与解释。
- line-chart：`{xLabel,yLabel,seriesLabel,points:[{x,y}],xUnit?,yUnit?,note?}`，2–80 点，x 严格递增。
- reveal-steps、answer、rhythm、force-diagram、motion-lab、geometry、data-table、media-panel：复用同名成熟组件契约；公式字段用 tex，不提供 math 对象。
- diagram：`{description,viewBox:{width,height},elements?,states?,initialState?,title?}`，沿用安全数据图元，不能写原始 SVG。

块 ID、MathML、完整 fallback、源指纹由服务端生成。可选 key 只用于确有需要的指令，必须全局唯一；改变组件内容仍重置状态。事实改变须用新 contentId。不要补造总量、日期、百分比、题目答案或来源。

边界：source 最多 32768 字符且 65536 UTF-8 字节，32 个指令，24 个视觉组件，96 个块，连续 Markdown 最多 12000 字符，64 个公式，每个 TeX 最多 2400 字符。不得截去超限文档末尾。

只生成这一轮需要的内容。一次 finalized 工具调用对应一个可读文档，不使用 append/polling/partial。正文不需要每段放卡片。成功后保留必要原生引用、文件与附件，不重复完整正文。参数错误最多修正一次，仍失败或工具不可用时给完整原生回答。
