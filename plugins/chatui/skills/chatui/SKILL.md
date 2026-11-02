---
name: chatui
description: 在启用 ChatUI 的当前聊天中，连续自足的原生讲解为主，按内容生成必要的局部辅助图形与交互；Response 是默认 UI 作者入口。自然追问继承上下文，不等待重复点名或 @；简单确认和明确纯文本／Markdown 请求保留原生回复。不用于开发网站或修改聊天软件界面。
---

# ChatUI · 连续讲解与局部辅助

本地功能候选：Plugin 1.0.0 / Renderer 1.6.1-iteration.1；尚未发布；尚未部署本轮产品改动或完成完整宿主验收。沿用同一 Response 作者数据底层，正文以连续自足的原生回复为主，必要时生成局部辅助 iframe。简单回答不必调用工具；模型自行判断哪一处需要图形、比较或交互，不堆题型模板。

## 当轮工作流

- 在需要局部 UI 时，默认使用 `render_response` 的 `facts + blocks`。只提交必要辅助图与短说明；依据返回的已校验事实完成原生正文，不把整篇正文重复塞进 iframe。既有 HTML、Document、Component、Explanation 输入及资源保留兼容，不再强迫普通回答调用它们。
- 给定条件、原始回答快照、正文和旧图分别保留。新题设或新回答使用新 `contentId`。旧图探索只影响该图；来自公开上下文的有效探索值具有 snapshot/block/interaction revision 来源，作为下一轮补充事实，不取代原题设。
- “为什么／原因／原理”按题目、指代与知识点解释；不得硬编码成“解释最后一次调参”。只有用户明确引用当前探索条件且状态来源匹配时才采用；未知、未同步或多图指代不清时明确不确定。
- 生成通用布局、受限图元和类型化状态绑定；需要拖动时使用通用 `circle.drag` 声明。提供数字、按钮及键盘替代。纯展示变量标 `role:"presentation"`，不发送无效草稿、展示状态或 Quiz 私有评分。
- Scene 控件不自动发送消息、重答或调用工具。公开上下文 ACK 只说明宿主接收，不代表模型下一轮已采用。缺能力、拒绝或超时保留本地图，并提供未同步提示及可复制条件。
- 工具返回不证明已显示；UI 失败仍给完整原生解释。参数错误最多修正一次，不循环重试。必要原生引用、文件及附件保留。宿主决定组件位置，不能承诺任意插入父页面段落或改写旧消息。
- 不把 HTML/JSON/组件源码当作未加载 UI 的替代答案；明确要求查看源码时例外。不得读取私人客户端或隐藏会话状态，不新增模型接口、存储、外联或权限。

## HTML 写作边界

`render_html` 接收 `{contentId,html,title?,theme?:"native",fallbackText?}`。直接写**浅层语义 HTML 片段**，不是完整网页。`title` 仅作元数据，不会自动插入标题；必要标题应在 html 中明确写出。`fallbackText` 可省略，由净化后的内容生成包含闭合折叠区的完整可读文字；显式 fallbackText 是文字，不是第二份可执行 HTML。

使用自然的标题、段落、强调、列表、引用、代码、表格、链接、上下标和原生 `details/summary`。默认无需 class；允许且只允许：`concept-card`、`derivation`、`key-point`、`note`、`warning`、`success`、`comparison-grid`、`muted`、`compact`、`vector`。只在关系有意义时使用卡片，不能每段都加卡片。

简单向量写成 `<span class="vector">v</span><sub>LG</sub>`，由可信样式绘制箭头，避免直接输出 `v⃗` 组合字符；`vector` 只包符号本身，不包下标或整条公式。普通上下标继续使用 `<sub>/<sup>`；复杂数学的必要局部辅助使用 `render_response` 的 TeX／MathML，不在 HTML 中写 TeX 或放开 `<math>`。`derivation` 是轻量正文区，不再与结论卡片等权重。

不生成 JavaScript、事件属性、任意 CSS／内联 style、图片、表单、SVG、iframe、远程脚本或可编辑区域。链接仅用绝对 `https:`、`http:`、`mailto:`。服务端与浏览器独立净化，超限明确报错，不截断 HTML。外层透明、约16px／1.75行高、18px语义卡片，跟随宿主主题；宽表格和长代码只局部滚动。见 [HTML 样例](references/html-examples.md)。

## 通用生成视图

先确认实际工具 schema 是否支持 scene。支持时，根据内容规划图文结构与必要交互，用同一组类型化数据和有界派生表达式驱动文字、公式、SVG 标注及控件。采用通用布局与图元组合，不按题型机械挑选模板或增加专用形状能力；请求图形时生成真实图元。题目改变时生成新的完整 contentId 快照；局部探索不冒充题设更改或旧消息更新。禁止任意 HTML/CSS/脚本、外联和新增存储。具体边界见 [工具参考](references/renderer.md)。若会话工具尚未提供此原型，不声称已调用新能力。

## 结构化能力与兼容

`render_response` 的 `{schemaVersion:1,contentId,facts,blocks}` 契约、组件、TeX／MathML、受限图元、测验计分／重试、标签页和状态恢复继续使用。它的 prose 仍是安全 Markdown，原始 HTML 仍是文字，不能借此绕过 HTML 安全边界。详见 [内容组合](references/composition.md)、[组件](references/components.md) 与 [结构化样例](references/response-examples.md)。

`render_component`、`render_explanation` 与旧资源 URI 仅保留兼容，不是普通回答默认入口。`render_incline_forces` 保留已知质量、g、角度且仅有重力／支持力的固定光滑斜面专项计算；其他情形按 [物理约定](references/physics.md)，不手造派生量或追加另一套默认参数实验。图片仅在获准的宿主通道使用，见 [图片](references/images.md)；HTML Renderer 不加载远程图片。

## 连续使用与真实交互

内容、题设或条件变化用**新 contentId**；旧消息不会被后续文字远程修改。HTML 重复结果和主题切换不重建 DOM，不重置已展开区域；新结果重建，本版没有 HTML 跨会话持久状态。

结构化路径继续按块身份与指纹保留未变控件、隔离新旧题设。选答、计分、重试、标签页、图表提示和适用实验在本地完成；Scene 探索不自动请求后续消息；既有组件的显式继续操作仍按原契约。没有实际回传或用户说明时，不声称知道操作；展开不等于学会，实验不自动更改题设。详见 [连续状态](references/continuity.md)。

仅完整结果到达后渲染；不逐字播放完成文本，不用多次调用伪装流式。自动选择和端到端速度必须以真实 ChatGPT 记录验收，不能由 Skill 措辞或本地预览推断。
