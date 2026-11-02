# Rich Document v1 验收包

> **历史阶段记录，非当前安装/发布指南。** 下文版本、许可待定、CI/宿主状态及审批范围仅反映当时，不能作为当前结论。当前原创许可已为 MIT / Jess(T o X)，当前版本与范围见[发行说明草稿](release-preparation/RELEASE-NOTES.md)。保留原阶段事实，不继承旧测试为新候选通过。

下文保留 RC4 时点的历史报告。历史证据仅在 monorepo 留存，不属于此源码包，也不作为当前 B1 证明；当前工程检查见 [B1](final-edition/b1.md)。

## 交付范围与结论

分支 `codex/rich-document-v1` 已完成从紧凑 Rich Markdown 到现有安全 response View 的编译、单文档渲染、成熟组件与真实交互，以及 additive MCP 工具／资源。生产 Skill、公开默认路由和生产 Sites 未切换。本包记录本地与既有私人实验站点的验收结果，并提供精确生产迁移补丁，等待批准。

一个 finalized 工具调用显示一个宿主 App 阅读面。文档正文透明、最多 780px 阅读宽度；普通段落无卡片，语义提示与交互组件局部成块。宿主自己的一个 App 标题接受为既定约束，没有修改 parent DOM。

## 实现与提交

- `52727ab`：编译器、预算、文档输入／输出 schema 与安全视图验证。
- `6e177e3`：现有 compositor 集成、限定 CSS、新资源、五类合成 fixture 与交互测试。
- `528ec0f`：additive `render_document`、隔离路由、测试 Skill、真实 MCP staging worker；保留 `{{name}}` 字面文本。
- `b24761d`：匹配载荷基线、三入口并排预览、40 项响应式证据与预览资源换载修正。
- `8ffc970`：保留 Markdown 缩进与 literal 指令代码，并细化数值图表的模型可见语法及路由，新增实际缺陷回归。
- 本报告及 production migration 作为独立最终提交，实际 SHA 见交付时 git log。

没有合并 main 或改生产部署绑定。主要改动位于 `renderer/lib/document-*.mjs`、`response-normalization.mjs`／`response-validation.mjs`、`explanation-renderer.js`、`widget-bridge.js`、`document.css`、`mcp.mjs`、生成器、tests／examples／preview；生成资源由脚本重建，不手改。完整语言、支持矩阵、预算、身份与恢复规则见 [实现契约](rich-document-v1-spec.md)。

## Checkpoint 1：最小文档

803 个汉字的合成教学样例含标题、自然段、列表、短引用、代码、三处行内数学及一个块公式、两个 callout。字符统计是 1083 UTF-16 码元／2829 UTF-8 source 字节。lexer 正确隔离代码围栏、跨行 JSON 和指令正文；原始 HTML 为文字，不执行 JS/CSS/SVG。未知／未闭合／嵌套／超限输入拒绝整份文档，不吞尾部。

## Checkpoint 2–3：结构与交互

五类样例覆盖教学、profile/progress/steps/timeline、数学 comparison/collapse/tabs、quiz、line-chart/安全 diagram/motion-lab。保留所有成熟组件的现有验证与数据驱动行为。

本地测试真实选择、提交计分、重试、collapse 和 tabs 键盘操作、restore envelope、组件内容改变重置、前插正文保持未变题目身份、客户端错误保留完整同源 fallback。完整题目答案只在提交后显示；供本地评分的客户端数据不是防作弊边界。

真实宿主五类文档均已显示，测验实际选择后为 2/2 正确，重试清除选择和反馈；折叠展开与物理标签切换已操作；进度显示 received6/10、checked3/10 及包含关系；运动实验 t 调到 1s，显示 x=15m、v=10m/s。跨刷新恢复未通过：刷新聊天后宿主未回传题目状态，显示回到未作答。恢复实现能够消费合法 host.widgetState，本地恢复测试通过，但不保证当前宿主跨刷新持久化。

## 安全、兼容与自动检查

- Renderer：153 tests passed，根组件：74 tests passed。
- `npx tsc --noEmit --incremental false` 通过。
- `npm run lint`：0 errors，2 个原 persistent-gate 实验警告。
- `npm run build`：完整 vinext build 通过。
- 新 worker 的本地 Workers 运行时收到原样 canonical 输入，HTTP200、5 个顶层块、安全文档输出。
- 旧工具 input/output schemas、数学、组件、认证、完整 fallback 与资源别名保持，旧 `render_response` 和 `render_html` 的真实宿主合成样例均已显示；未打开私人历史消息验证历史数据，兼容结论来自原 regression fixtures 和实际旧入口。
- `git apply --check` 对精确生产补丁通过；review-only 插件包 0.10.0 通过包装验证：56 files、2 implicit skills、1 declared App dependency。

原生产目录的 portable0.9.1 与 legacy overlay0.9.0 本来不一致，`scripts/validate.py` 在原目录报告 version/description/interface 三项失败。本分支没有修改原生产元数据；待批准补丁会同步它们，临时包验证通过。不能声称现有生产包验证已通过。

## 本地布局与视觉证据

40 次浏览器布局：五类文档 × light/dark × 320/390/768/1024px。实际 iframe 宽度与请求一致，页面级 overflow=0，状态错误为空，外层透明。公式／代码／表格允许局部滚动。完整 DOM 尺寸与时序见历史证据 `rich-document-v1-visual.json`。

本地 mount 0.4–17.2ms，两个 requestAnimationFrame 的绘制机会指标 16.9–31.9ms；这些是桥接收到 finalized 结果之后的局部指标，不是模型输出时间、浏览器精确首像素或真实宿主端到端延迟。

`renderer/public/document-comparison.html` 展示同内容的 HTML静态参考、紧凑 response 与 Rich Document。教学、进度、比较、测验两套主题并排截图保存于本地 output。历史产品风格只引用已有 [visual-spec-v0.7](visual-spec-v0.7.md) 的层级、密度、节制颜色与连续正文规范，没有重新分析 DIL，未访问或删除私人历史参考聊天。视觉判断：新入口更连续且正文更紧凑；不是对历史 DIL 的像素等价证明。

## 载荷与服务器性能

测量对象为压缩后的完整工具参数 JSON，文本／数据匹配，不包含网络包装。compact response 是真实编译中间输入，不人为增加空块；granular response 是逐 Markdown token 的旧结构基线；HTML 为静态可读近似，数学保留 TeX 文字，测验／图表／实验不具等价功能。

| 样例 | document UTF8 | compact response | granular response | HTML静态 | document/compact |
|---|---:|---:|---:|---:|---:|
| 教学 | 2941 | 3290 | 3558 | 3038 | 89.39% |
| 进度 | 1105 | 1365 | 1374 | 767 | 80.95% |
| 比较 | 812 | 1145 | 1154 | 655 | 70.92% |
| 测验 | 769 | 887 | 896 | 484 | 86.70% |
| 图表／实验 | 630 | 775 | 798 | 411 | 81.29% |

按完整工具参数计，优选 ≤70% 目标未达到；相对紧凑结构化输入减少 11%–29%，教学相对 granular 减少约17%。若只统计裸 source，与 compact response 完整参数相比，教学／进度／比较／测验／图表分别为 85.99%／69.74%／60.44%／73.06%／64.65%，其中三类低于70%，但 canonical 教学仍未达到目标。部分 HTML 静态输入更小，应保留这一事实。未安装可核实的 tokenizer，不报告估计 token，也不把字节减少直接当作模型时间改善。

服务端各样例 10 次预热后 100 次规范化的 p50/p95，以及完整参数码元、view 大小见历史证据 `renderer/public/examples/document-benchmark.json`。教学 normalized view 5563 UTF8 字节；view 变大是安全数学与结构展开，并非模型需书写的载荷。编译开销处于亚毫秒量级，没有证据表明它主导实际聊天的数秒级等待。

## 隔离部署与真实宿主性能

复用原 owner-private `ChatUI Single Persistent Surface Gate`，保持一个 owner 白名单、0 groups／0 external visitors／0 automations，不变生产绑定或受众。source SHA0e146e95174de84a7ff52a4f6440b0c8e0645edd，部署成功记录见历史证据 `rich-document-v1-staging.json`。没有创建新站点；原实验数据库绑定保留，文档功能不写数据库。

构建阶段遇到并修正两项 packaging 问题：继承本机 node_modules 产生 macOS-only workerd lock，改为独立干净 lock；远端要求 dist 中附 hosting 元数据，构建器复制既有实验 metadata。修正后原样构建、save version、private deploy 成功。

同一个测试聊天／同一模型设置，教学三入口的宿主 `Worked for` 显示：document复测20s、response22s、HTML静态16s；测验8s、比较20s、进度14s、图表18s。该 UI 字段是回合工作时长代理，不能当作第一可见文档时间。每入口仅一次有效样例，非随机、无 p50/p95，不足以证明 meaningful latency improvement；HTML 功能也不等价。

首次 canonical document 调用返回 TeX INVALID_ARGUMENT；实际失败参数未能提取，不能断言根因。最小公式与完整 source 复测显示成功，同 source 在本地编译和 Workers 中均成功。保留失败截图与记录，未降低安全规则。T0→工具返回、T0→首像素、完整输出精确分段仍 UNKNOWN；自动观测晚于显示，只记录上界，不填造精确值。生产验收需关注这一首次失败和模型 JSON/TeX 传参稳定性。

## 路由回归

静态策略测试覆盖用户要求的十项；它们只验证配置。真实模型测试最后有十项符合预期，完整记录见历史证据 `rich-document-v1-routing.json`，均为单个样本，不能声称稳定成功率。较完整请求限定实验 App，没有指定渲染工具；短原生答复遵照例外。短答／短翻译／纯 Markdown 保持原生，较完整数学／比较／进度优先 document，独立测验／图表可用成熟结构化入口。浏览器实际验收使用隔离 MCP initialize 和工具描述，未把本地测试 Skill overlay 安装进生产。未限定 App 的换元首测选了生产 render_html，限定后为实验 render_document；数值图表首测误用了图片生成，修正测试路由／source 语法说明并刷新工具后，在带实验 App chip 的新聊天复测选择 render_component line-chart，数据表准确为三个给定点。复测同时改变了 App 选择上下文，不能把成功单独归因于文字修正，也不能隐去两次偏离。

最后一条样本的实际选择如下，完整记录保留初始失败：

| 任务 | 预期 | 最后实际选择 |
|---|---|---|
| 结果确认 | 原生 | 原生 |
| u substitution 解释 | Rich Document | render_document，明确实验 App 后 |
| related rates | Rich Document | render_document |
| Romanesque/Gothic 比较 | Rich Document | render_document |
| 短逐字翻译 | 原生 | 原生 |
| 项目进度 | Rich Document | render_document |
| 五题测验 | 文档或独立测验 | render_document + quiz5 |
| 给定速度图 | 文档或独立图表 | render_component + line-chart，修正后新聊天 |
| 纯 Markdown | 原生 | 原生 Markdown |
| 明确 ChatUI 讲解 | Rich Document | render_document |

## 测试聊天清理

只有本轮新建的合成验收聊天纳入清理。截图／DOM／时序和 registry 保存为本地 output 文件，不提交私人 sidebar、cookie、认证 token 或用户历史聊天。Created2 / Deleted2 / Remaining0。两个确认对话的标题与本地 registry 的精确 URL 一致；逐个删除后复开原 URL 均重定向首页，当前列表未找到这两个精确链接。最近聊天分页仍显示 Unable to load history（Retry 后同样），因此没有宣称全账号历史扫描成功；清理结论限于这两个精确目标。未触碰任何历史 DIL、课程、翻译、学习或日常聊天。站点、数据库、MCP 连接和实验 source 保留。

## 生产迁移与回滚

[精确补丁与说明](rich-document-v1-production-migration/README.md) 包含生产 main/progress Skill、agent 默认提示、plugin／legacy overlay 元数据、renderer契约参考和 MCP route 开关。discovery-before/after 保存完整工具描述和 initialize 前后值；旧 schemas 不变。新资源 document-v1 additive；旧 URI 保留。提案插件0.10.0，服务 serverInfo 沿用1.5.0以保持原测试契约，文档协议独立 documentVersion1。

生产目标已只读核对为现有 ChatUI Renderer（version number9），MCP https://chatui-renderer.[author redacted].chatgpt.site/mcp，App 依赖与仓库一致；1 个 owner 用户、0 groups／external／automations，未执行生产写操作。确切身份与权限摘要见历史证据 `rich-document-v1-production-migration/deployment-target.json`。

批准后先把本分支 additive 文档代码加旧默认路由保存为 compatibility-baseline 版本，再应用补丁、运行回归和包装、向既有生产部署绑定保存／部署新默认路由版本并刷新生产工具；占位 hosting 配置和实验站点不能替代生产绑定。当前尚无生产 release ZIP 或生产部署，避免把待审文件误当已发布插件。

回滚至上述 compatibility-baseline，并恢复迁移前 Skill 与描述；baseline 保留 additive document-v1 资源和工具，使新文档消息仍能读取。若直接恢复更早、不含 document-v1 的原服务器，无法保证新消息历史读取。不能以删除旧 URI、实验站点或数据来回滚。

本地证据目录：`output/playwright/rich-document/`，包含40布局截图、light/dark三入口并排图、host挂载／评分／图表／失败截图、DOM 与 cleanup-registry。新聊天 URL 只保存在本地 registry，不进入提交。

## 已知限制与批准范围

单次 finalized 宿主约束：输入与编译完成前不能持续显示正文，无 partial/progressive/append。只能做到一个宿主 App 阅读面，不能移除宿主标题。超限拒绝，完整大文档应由模型分清本轮范围。sourceHash 非密码学散列。原生引用和附件仍由宿主承载。当前宿主跨刷新答题持久化未通过，真实 latency improvement 未证明，≤70% 优选载荷目标未达，首轮 TeX 拒绝原因未定。

提交生产批准时应明确接受这些限制；未经明确批准，不更新生产 Skill、工具默认描述或生产 Renderer／Plugin。
