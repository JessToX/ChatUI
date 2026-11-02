# 双路径工具契约 · 0.9

连续自足的原生正文为主；必要局部辅助默认 `render_response`，简单回答无需工具。HTML/Document/Component/Explanation 保留兼容及显式请求用途，不再把普通正文强制装进 iframe。why 按题目与指代解释知识点；探索状态只是在来源匹配时可采用的补充事实。

## render_html 输入与输出

```json
{"contentId":"details-v1","html":"<details><summary><strong>点我展开</strong></summary><p>如果这句话展开出来了，就成功。</p></details>"}
```

必填 `contentId:string`（1–200字符）、`html:string`；可选 `title:string`（1–200字符）、`theme:"native"`、`fallbackText:string`。未知字段拒绝；请求体上限256KiB，超限报错不截断。内容变化用新 contentId。title 仅元数据，不自动重复插入。未提供 fallbackText 时从净化后的 HTML 解析生成完整文本，包括闭合折叠内容。

工具输出：`structuredContent:{schemaVersion:1,mode:"html",contentId,html,theme:"native",title?}`，html 已经服务端 sanitize-html 净化；`content:[{type:"text",text:完整兜底}]`。声明对应 outputSchema。失败返回 `isError` 与文字，没有伪成功视图。

客户端 DOMPurify 再次独立净化，插入 DocumentFragment 成为真实 DOM。白名单与服务端共享；去掉脚本、事件、内联样式、srcdoc、图片、表单、iframe、SVG等。标签、属性、class 边界见 [HTML 样例](html-examples.md) 和 Skill。链接仅绝对 https/http/mailto，补安全 rel 后复用宿主打开流程。没有模型代码、运行时 CDN 或新增网络／frame权限。

简单向量可用 `<span class="vector">v</span><sub>LG</sub>`，可信 DOM 装饰与 CSS 线条避免组合箭头缺字，兜底为 `vec(v)`。旧 `v⃗` 正文／行内代码兼容处理，字面代码块不改写；复杂公式仍整轮使用 `render_response`。`derivation` 为轻量正文区，details 展开间距独立于首尾段落重置。

两条路径共用 `ui://chatui/response-v7.html`；`response-v6.html`、`response-v5.html`、`response-v4.html`、`response-v3.html`、`response-v2.html` 与 `response-v1.html` 保留可读别名。MIME为 `text/html;profile=mcp-app`，`_meta.ui.resourceUri` 与兼容元数据键都指向V7。HtmlSurface位于既有App iframe的作用域容器，外层透明，没有嵌套iframe或主页面注入。校验／净化／挂载失败显示完整文字兜底。重复结果与主题切换保留已展开状态；新内容重建；HTML不新增跨会话持久状态。

## render_response 输入与输出（保持兼容）

直接传入对象，不套 `config`：

```json
{"schemaVersion":1,"contentId":"progress-snapshot-1","facts":{"done":{"value":6,"unit":"项"},"total":{"value":10,"unit":"项"}},"blocks":[{"id":"intro","kind":"prose","text":"当前已完成 **{{done}}**，总计 {{total}}。"},{"id":"progress","kind":"component","type":"progress","data":{"value":{"fact":"done"},"total":{"fact":"total"},"unit":"项","label":"已完成"}},{"id":"next","kind":"prose","text":"其余条目的身份和截止日期尚未提供。"}]}
```

`schemaVersion:1`；`contentId` 是题设快照身份；可选 `title`；`facts` 即使为空也传 `{}`；`blocks` 有序且 `id` 全局唯一。服务端验证、一次展开事实、解析安全 Markdown、编译 TeX，返回带 `viewVersion:1` 的归一化结构和同源完整可读文本。此结构化路径的客户端不执行 Markdown／TeX 解析器、模型代码或额外模型调用。

每组 1–64 块、总计至多 96 块、组合至多四层；输入 256 KiB、归一化视图 512 KiB；每段正文 12000 字符、单个 TeX 2400 字符、每次至多 64 个 TeX。超限请缩小本轮范围，不用多次调用模拟逐字流式。

## 内容块

| kind | 必要内容（另有 id、可选 title） |
|---|---|
| prose | `text` 安全 Markdown；可选 `eyebrow` |
| heading | `text`；可选 `level:1..4` |
| list | `items:string[]`；可选 `ordered` |
| quote | `text`；可选 `citation`（普通文本，不伪装原生引用） |
| code | `code`；可选 `language` |
| math | `tex` 或旧 `math` 二选一；可选 `label/detail/tone` |
| component | `type` 和现有组件 `data` |
| diagram | `description,viewBox,elements`；可选观察状态 |
| group | `layout:"stack"或"parallel"`, `blocks` |
| collapse | `summary,blocks`；可选 `open` |
| tabs | `items:[{id,label,blocks}]`，2–8 项；可选 `initialTab` |

Markdown 支持段落、标题、列表、引用、强调、删除线、代码、表格和无凭据 HTTPS 链接；任意 HTML 都是文字。图片语法生成带说明的来源链接，不自动加载远程图。内联公式 `$…$` 或 `\(…\)`，独立公式 `$$…$$` / `\[…\]` 或 `math.tex`。用 Markdown 分段而不是巨型字符串配样式代码。

TeX 在服务端以 `trust:false`、有限宏展开和尺寸转换为经校验 MathML。不能提供 HTML/CSS/URL/宏定义/加载命令。`answer` 的 `data.tex` 以及 `comparison/timeline/steps/reveal-steps` 的 `items[].tex` 也可替代对应 `math`；其他位置不接受 tex。旧结构化 MathML 继续可用。

组件类型和数据规则保持 [现有契约](components.md)。`progress` 的旧 `value/total` 与新 `stages/total` 互斥；阶段共用分母，`subsetOf` 表示包含而非可加比例。总量未知、为零或超过已知范围时用文字说明。模板外图只接受受限图元，禁止原始 SVG 字符串、CSS、脚本和任意表达式；[旧图元示例](explanation-examples.md) 的 diagram 块也可直接放入统一入口。

## 双路径与失败

普通回答一次 `render_html`；复杂交互整轮一次 `render_response`，直接生成内容块；渲染成功后不重复整篇原生答案。`render_component`、`render_explanation` 及旧 URI 留作兼容，不是普通回答的竞争入口。专项计算能力见下文，仅其明确适用的任务例外。

字段错误最多修正一次；不可用或持续失败时提供完整原生可读答案。模型不能凭工具返回就声称 iframe 已经成功显示。客户端验证失败时也会安全显示工具同源文本，不执行其中的 HTML。

## 光滑斜面计算入口

`render_incline_forces` 必填 `contentId,massKg,gravityMps2,inclineDeg`，可选 `title,body`，直接传题设参数：

```json
{"contentId":"smooth-m2-g10-a30","massKg":2,"gravityMps2":10,"inclineDeg":30,"title":"光滑斜面的真实受力","body":"2 kg 木块"}
```

质量和g须已知且为正，没有默认g。角度[-90,90]，正值向右上升，负值向右下降，局部+x沿该有符号向右切线。固定平面，物体初始静止或沿面运动且只有重力／支持力才适用；不用于摩擦、额外外力、加速或弯曲平面、冲击、初始法向运动。0°合力为零，±90°是支持力零的竖直极限。

使用返回的 `data.calculation` 和工具文字解释同组重力、支持力、合力及加速度，不再手算一套向量或追加默认参数的同题实验。未知量保持未知，方向图按 [物理约定](physics.md) 制作。

## 状态与宿主边界

同一快照按块 id 和指纹更新：未变控件保留选择、焦点与真实操作状态。`contentId` 或 facts 变化隔离旧状态；已更改的块不恢复旧答案。历史消息不被新回复远程改写。

本地选答、计分、展开、标签页、提示与已有计算规则即时响应；只有需要新推理的操作才发后续消息。不支持发送时提供可复制问题，发送未确认先避免重复。原生引用与文件由宿主保留必要衔接。首版仅完整工具结果到达后绘制，不能承诺原生 Markdown 首字速度或 100% 自动调用。

## 通用 scene 原型（须先确认会话工具 schema 已提供）

当内容需要新的图文结构或联动表达，使用 `render_response` 的 `scene` 块，由模型规划布局、图元、标签和必要控件。不要将能力范围固定为专用组件菜单，也不以字符画代替请求的矢量图。结构为 `{kind:"scene",id,description,givens,state,derived,root}`，精确字段见工具 schema。行/列/响应式网格采用浏览器布局，图元采用可信 SVG；文字和安全数学记法的 parts 绑定相同派生值。不可变题设与探索状态分开，表达式是有界无环数据树，不是 JavaScript。控件仅操作当前视图，重挂载恢复初始值，不自动写模型上下文或持久化。当前测试 Site 仍是旧版时，不声称新能力可用。
