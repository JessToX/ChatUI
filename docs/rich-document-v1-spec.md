# ChatUI Rich Document v1 实现契约

本分支实现一份 finalized `render_document` 输入、一份归一化视图、一个文档阅读面。复用安全 Markdown、KaTeX→受限 MathML、组件验证器、统一 compositor 和本地交互状态。未使用 DIL、部分参数、append 或轮询。

## 公开输入与输出

输入 `{contentId:string,source:string,title?:string,theme?:"native"}`，拒绝额外字段。contentId/title 为 1–200 个 UTF-16 码元的非空文本；title 是元数据，不自动生成正文标题。事实／条件变化必须新 contentId，不更新历史消息。

输出 structuredContent 为现有 response View 加 `mode:"document"`、`documentVersion:1`、16 位 sourceHash、callouts 映射。sourceHash 是两个 32 位内容散列拼接，用于身份判断，不是密码学完整性保证。content[0].text 是同源完整可读 fallback，涵盖闭合折叠和所有 tabs，测验提交前不包含评分键和解释。新资源 `ui://chatui/document-v1.html`；旧 `renderer-v3`、`explanation-v2`、`response-v2` 与 HTML 模式保留。

## Rich Markdown 语法

普通正文使用现有 Markdown：标题、段落、强调、列表、引用、HTTPS 链接、代码和静态表格。数学支持 `\(TeX\)` / `\[TeX\]`、`$TeX$` / `$$TeX$$`；代码围栏内不提取数学或指令。原始 HTML 显示为字面文字。字符串 `{{name}}` 保留字面文本，不隐式转为旧 facts 插值。

指令必须从列 1 开始，类型为小写字母／连字符：

```text
:::callout {"tone":"key","title":"关键结论"}
普通 Markdown。
:::
```

JSON 可跨行，闭合 JSON 后正文另起一行。结束符必须独占一行且准确为 `:::`。反引号或波浪线围栏保护内容。v1 不支持嵌套指令；无效、未知或未闭合指令整份拒绝，给出行号，不吞掉剩余内容。可选 `key` 为 1–80 个码元的非空、全局唯一字符串；内容改变仍改变生成 ID。

| 指令 | 参数／正文 | 支持状态 |
|---|---|---|
| callout | tone 可选 key/note/warning/success；title 可选；Markdown 正文 | 完整，语义色与 note role |
| collapse | summary 必填；open 可选；Markdown 正文 | 完整，本地展开恢复 |
| tabs | items 2–8 项，每项 label/body；body 仅 Markdown | 完整，键盘与本地恢复 |
| progress | value/total 或 total/stages；subsetOf 表示包含 | 现有严格组件，不合计包含阶段 |
| profile | name，eyebrow/subtitle/tags/summary 可选 | 现有组件 |
| comparison | items 1–4 项；label/title/detail/tex/mathLabel/tone | 现有组件与安全数学 |
| steps / timeline | items；title/detail/date/status/tex/mathLabel/tone | 现有组件 |
| quiz | questions 1–12 项；id/prompt/options/correct/explanation | 真实选择→提交计分→重试→恢复 |
| line-chart | labels，2–80 个严格递增 x 的 points，可选 units/note | 现有折线图 |
| diagram | description/viewBox，安全 elements/states/initialState | 现有受限数据图元，无原始 SVG |
| reveal-steps / answer / rhythm | 同名成熟字段，数学用 tex | 现有组件 |
| force-diagram / motion-lab / geometry | 同名成熟参数及单位 | 现有组件／实验，不执行表达式 |
| data-table / media-panel | 同名成熟本地数据字段 | 现有组件；media-panel 是文字资料面板，无远程图片执行 |

除 callout/collapse 外，指令不接正文；tabs 正文位于 JSON body。组件只允许各类型的显式字段，不允许 author-supplied math/fact 对象。确切可执行契约以 `document-normalization.mjs` 的字段表及既有组件验证器为准；语法并未放宽旧组件的数据边界。

## 预算与安全

source 最多 32768 UTF-16 码元且 65536 UTF-8 字节；最多 32 指令、24 视觉组件、96 总块；连续 Markdown 最多 12000 码元；64 公式，每个 TeX 2400 码元，指令 JSON 12000 码元。嵌套指令深度为零，callout/collapse/tabs 只容纳正文。请求继续受原 256 KiB 硬边界约束。超限整份拒绝，不截断尾部。

服务端拒绝危险对象键、额外字段、非有限／越界数据、非法关系与不安全 URL；KaTeX 使用 trust:false、strict:error、maxExpand:128、maxSize:4，并把结果重新转为受限 MathML。客户端再次验证完整视图，只从可信代码创建 DOM，不执行源 HTML/JS/CSS/SVG。新工具沿用 Sites 已认证用户头、Origin／Content-Type／体积校验。源与答题状态不会存入服务端数据库。正确答案需传给本地组件才能本地评分，不能把客户端数据视为考试防作弊边界。

## 身份与恢复

生成块 ID = 类型、可选 key、规范化内容的指纹加同内容出现序号。前插不相关正文不会改变未变化的测验身份；组件内容或 contentId 改变会重置相关状态。重复完全相同块按出现顺序区分。散列碰撞不是被密码学排除的事件，v1 的状态身份限于当前内容快照。

## 路由与兼容

生产默认路由尚未修改。隔离入口显式 documentRouting:true；较完整讲解／分析／比较／进度优先 render_document；短确认、短事实、短逐字翻译、明确纯文本／Markdown 保持原生；独立专业交互可用成熟结构化工具。HTML 和 response 原契约、历史 URI 与行为保持；复杂兼容输入依旧走旧验证器。

模型参数错误最多修正一次，持续失败给完整原生 fallback；成功不重复整篇正文，保留必要原生引用、文件与附件。Skill、描述、初始化指令的完整生产迁移存放于 `docs/rich-document-v1-production-migration/`，未经批准不得应用。
