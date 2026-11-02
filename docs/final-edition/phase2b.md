# Phase 2B — 离线 Intellectual Gallery

日期：2026-10-11。分支 `codex/final-edition`；授权起点 `be6e0ae2d4446e9a8df709c7f19d18e6fb93bf8c`。本阶段只进行隔离本地开发、验收、提交和两个审核交付物。设计延续 [Intellectual UI 规范](intellectual-ui-ux-spec.md)、[Phase 2A.1](phase2a1.md)、[B1 数值安全](b1.md)和 [Document 契约](../rich-document-v1-spec.md)。

## 1. 结论与最终身份

结论采用 **CORE PASS WITH DECLARED LIMITATIONS**，范围仅为本地 Chromium 离线 Gallery 和工程检查。这个结论必须同时满足：最终工程 `results.json` 状态为 `PHASE 2B ENGINEERING PASS`、SHA 等于最终 HEAD、工作树干净；浏览器完整矩阵、专项交互和 fresh standalone 双模式实测 PASS；交付验证证明采集、最终提交和实际解包的资源字节相同。任何硬门槛 FAIL 都撤回本结论。精确最终 SHA 由提交后的交付记录与两个包内元数据提供，不在本文硬编码自身 commit。

Safari 自动化因现有 Remote Automation 关闭而 UNKNOWN，没有更改浏览器设置；Firefox 未安装，UNKNOWN；人工 VoiceOver 未运行，UNKNOWN。实际 ChatGPT 宿主、原生路由、跨宿主恢复、用户理解度均 NOT RUN。本轮不声称 FULL PASS 或读屏全面支持。

原始证据保存在隔离工作区 `.local/phase2b/{engineering,browser,delivery}/`；截图在 `output/playwright/phase2b/`。这些不进入源码发行 allowlist；Review ZIP 只包含必要的结构化摘要、公开文档可读副本及真实截图。历史 B1/2A/2A.1 结果不是本轮通过证明。

## 2. 构建与运行架构

可信生成器 `renderer/scripts/generate-gallery.mjs` 将固定 `examples/gallery.mjs` 输入交给原 `normalizeDocument → validateDocumentView`，生成完整安全 fallback 和预编译 View。正常文档使用已有 compositor、canonical 组件代码与双重客户端校验。G06 不调用编译器；G08 分别展示真实编译拒绝、客户端校验拒绝和明确标注的工具不可用本地模拟。

`renderer/public/gallery/index.html` 自包含 classic script、数据和 Renderer。它不依赖 fetch、跨文件 ES module、MCP、在线编译、CDN、模型调用或聊天存储。附带 `fixtures.json` 与 `renderer.html` 是可审计资源副本，运行不请求这些文件。依赖 notices 来自当前锁定构建库的实际 license，生成时间和性能计时不混入普通资源。

Gallery 只替换原资源中的生产 bridge 为独立受限 adapter；原 `widget-bridge.js` 的协议、认证及生产行为不变。原 Preview 保留为 HTTP 开发宿主，不能冒充离线 Gallery。compositor 的必要适配是可选可信 `host.copyText` 与 `host.scheduleBatch`：Gallery在opaque frame屏幕外RAF暂停时仍完成分批挂载和高度通知。生产 bridge 不提供这些hook，仍使用原Clipboard与RAF路径。

frame 使用 `srcdoc`、`sandbox="allow-scripts"`，没有 `allow-same-origin`。CSP 禁止连接、外部资源、表单与 base URL；禁止链接自动导航。opaque origin 的 `null` 不作身份。父/子双方检验当前 `event.source`、独立 channel、随机 nonce、严格操作字段；请求 ID 单调并只接受当前待处理复制。父只允许复制当前场景完整安全文本，不接受伪造文本。场景切换删除旧 frame、移除旧监听并清理待处理请求；旧实例与迟到异步操作不能改变新场景。

嵌入 JSON 转义 `< > &`、script 终止标记和 U+2028/U+2029，插入模板使用函数替换，保留 `$&` 等字面输入。bootstrap 解析后从隐藏 DOM 移除；Quiz 评分键和解析只留可信运行时闭包及授权 init，不出现在复制、未提交 UI 或状态消息。Quiz 不向父页面发送状态，不存储，跨场景/刷新安全重置。离线固定评分必须随本地源码交付，不能宣称对下载源码检查者保密。

## 3. 八个固定场景

| 场景 | 实际类型与用户任务 | 正确预期与边界 |
|---|---|---|
| G01 | 真实 Document + geometry，键盘调节 h/r | r=2 cm，最优 h=3 cm，b=2√3 cm，A=3√3 cm²；初始比例1，滑块 .05–1.95；h=AD、单位与≈延续2A.1 |
| G02 | 真实 Document，圆锥相关速率和换元积分 | R=3 m,H=6 m,Q=2 m³/s,h=2 m 给出2/π m/s；sin(x²)+C，链式法则包含x=0；没有装饰性滑块 |
| G03 | 真实 Document + motion-lab/force-diagram | t=1 s 给v=10 m/s,x=15 m；m=2 kg,g=10,θ=30°给N=10√3 N，合力10 N，加速度5 m/s²；两个独立题目 |
| G04 | 合成思想实验 + comparison/collapse | A1–A3/B1–B3、事实/价值、针对性反例、未解决问题；真实键盘折叠，无伪造引用 |
| G05 | 八节合成研究长文 + tabs/collapse | ≥6节显示默认收起静态提纲；中英文术语、表格、代码、公式、证据与限制；完整复制包括关闭与未选部分 |
| G06 | 静态原生文本参考，无 iframe | 简单短答无需 Document；不是 ChatGPT UI、MCP widget 或真实原生路由测试 |
| G07 | 真实 Document + 一处安全数学降级 | 有界非禁止坏 TeX 原文保留，首尾正文和另外两条公式完整；禁止命令另走G08硬拒绝 |
| G08 | 拒绝/原生 fallback 展示 + 独立正常 Quiz | 5类编译拒绝、client View 拒绝、工具不可用本地模拟、真实选择/提交/计分/重试；危险输入不作成功文档显示 |

G01–G03 的 expected 来自既有独立 `math-physics-golden.json`，不从被测函数生成。B1 原 `radius=2e-162,heightRatio=.05` 及整个连续滑块域的可表示门槛保留，三模板、四 MCP 路径、保存/恢复回归仍执行；绝不夹取面积或修改正确公式。G03 支持力是实际重力/接触力的计算结果，合力不是第三个作用力；投影切换不改题设。

## 4. 双模式与交互验收

运行包解压后直接打开 `index.html`；或在其目录运行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory .
```

再打开 `http://127.0.0.1:4173/index.html`。不需要安装依赖。源码 standalone 仍按 `renderer/README.md` 的原样 shell：locked install → 安全公开 placeholder → test → tsc → lint → build；最终类型检查与构建只在全新 allowlist 解包、公开placeholder中进行，原隔离工作区可能存在的hosting/env不进入这个环境。

实际 Chromium 为 Chrome154.0.8037.98，macOS26.6.2 arm64，Node24.20.0/npm12.0.2/Python3.9.6。G01 先独立完成 file/HTTP 垂直切片通过后才扩展八组。浏览器脚本打开真实 `file://`，未绕过安全限制；同一候选字节在 loopback HTTP 做同样核心操作。运行期间除入口导航无资源请求；不把静态闭包检查当作双模式通过。

| 硬门槛 | 证据范围 |
|---|---|
| 64布局 | G01–G08 × light/dark ×320/390/768/1024，各模式64；共128实测记录。G06是原生文本，G08是非正常边界状态，均非空白widget |
| 内容与布局 | 场景身份、真实就绪/拒绝、首尾内容、整页无横溢；公式/代码/表格允许测量后的局部滚动。深浅主题、单列顺序、单位、标签、焦点和44px目标 |
| 数学/物理 | 独立golden、G01键盘最优/边界/恢复、G03运动与投影；极端数值与旧MCP路径由正式工程回归补充 |
| Quiz | 未提交评分隔离、真实选择/计分/重试、跨场景/刷新重置；不传模型上下文 |
| Clipboard | 真实写入成功后才报告；失败/不可用提供同源只读完整文本、全选、Escape和焦点返回；关闭与未选内容包括在内 |
| 安全/生命周期 | source/nonce/schema/请求ID/旧实例、伪造文本与消息、dangerous keys/URL/预算、禁止TeX、客户端拒绝、迟到复制 |
| 键盘/自动语义 | Tab、方向键、Enter/Space、Escape、Home/End、局部滚动；标题、标签、math与details/tab语义、reduced motion；仅声明实际记录的路径 |
| 人工读屏/其他浏览器 | VoiceOver UNKNOWN；Safari自动化UNKNOWN；Firefox UNKNOWN；不以截图或aria检查代替人工读屏 |

最终当前资源实测：128/128布局（每模式64）、2个G01垂直切片、每模式9项交互+7项安全（合计32项专项）全部PASS，144张新截图。完整矩阵和专项每项的 PASS/FAIL/UNKNOWN 由浏览器 `results.json` 与 Review `acceptance.json` 保留。自动化语义与实际键盘分开记录。人工视觉审核是代表截图检查，不能外推成人工读屏或理解度。

## 5. 工程、独立解包和确定性

主入口为 `python3 scripts/qa/verify-phase2b-engineering.py --phase final`；浏览器为 `python3 scripts/qa/run-phase2b-browser.py`。final 必须 locked install 和干净 HEAD；新生成器纳入 `check-generation.mjs` 和 `npm run build`。

| 命令/范围 | 本轮验收 |
|---|---|
| 根组件 compact/canonical | 各85项，数学标准包含B1连续域、三模板与状态 |
| 三模板golden/Renderer golden | 各11项/3项；与数学oracle一致 |
| Renderer `npm test` | 219项：既有198项、Gallery fixtures13项、Gallery host security8项 |
| Python unittest | 90项，含allowlist、ZIP、配置独占创建、symlink、链接 |
| TypeScript/lint | fresh公开placeholder环境无类型错误；monorepo既有实验2条lint warning；standalone排除实验，无warning |
| 生成/元数据/validate | canonical/compact/vendor闭包、4个确定性生成器两次、metadata与旧工具URI检查 |
| 330 RC compile | cold/warm330次、0失败，只测编译，不是宿主端到端时延 |
| source package + fresh README | allowlist源包重复字节一致；新目录原样安装/公开placeholder/test/tsc/lint/build/generation/golden；Gallery7文件与monorepo相同 |
| 两个交付ZIP | 重复打包字节相同、固定时间、无重复条目、路径逃逸/symlink/敏感内容排除；实际新目录解包，checksum、链接、PNG解码与入口检查 |

锁文件哈希保持 root `34974e3cda1d449611fd4178ad4d5df2bf0c0995d45a999ba087984d352482cf`，Renderer `bb3af1b3b02ed994d4aaed57999018f0119aa45b339c929387159bcc819bd37e`。完整命令、退出码、测试数量、warning和日志SHA由每次新的工程JSON记录，不使用旧通过数量补证。

最终runner包含17项核心检查与3项fresh standalone检查。较早的原工作区TypeScript检查会解析Vite配置中的hosting JSON导入，可能读取原绑定；没有手动打开、打印或复制该配置，但不能把那次执行声称为隔离验证。该轮结果保留并另记`acceptedForDelivery=false`，不用于最终验收；最终runner删除原工作区tsc，只在公开placeholder的新目录执行实际tsc和build。

性能软目标以具体资源和浏览器挂载完成回调测量；不是首像素。普通确定性资源不包含benchmark/timing。原resource224 KiB、Gallery2 MiB、mount50/200ms等仅作软比较，实际字节和样本由生成manifest/browser metrics记录。最终Gallery index300590bytes、可信Gallery Renderer200171bytes、七文件总599391bytes，均在对应软大小目标内。既有response资源236314bytes高于224KiB软目标6938bytes，其HTML sanitizer资源未用于Gallery；本轮仅增加可信hook，未以删功能降低大小。cold/warm采用真实wall clock，不用冻结的Workers零值；未观察宿主时间为UNKNOWN。

## 6. 采集身份、失败复测与限制

每次浏览器采集独立记录 `captureGitHead`、`captureWorktreeDirty`、`fixtureHash`、`rendererResourceSHA256` 和全部Gallery文件hash。提交前截图保留真实旧HEAD/dirty状态，不把它改成最终commit；提交后交付校验将这些字节与git blob及新解包逐一比较，再添加 `finalCommitSHA/finalResourceVerification`。原始捕获元数据不会被改写。

首个G01浏览器断言错误地要求近似UI显示5.196/3.464，现有2A.1合法舍入显示5.2/3.46。失败日志保存，测试改为读取真实操作state与独立精确golden对比，并单独核对≈和UI舍入；runtime和正确golden未改变。布局首轮只完成6项后浏览器中断，不能把后续数组占位当已完成；QA选择器和offscreen screenshot采集方法也单独保留失败。真实实现缺陷集中修复一轮：继承操作名toString/constructor导致消息schema异常（现以own属性匹配拒绝）、PNG仅CRC/zlib接受无IHDR/坏scanline（现实际解码RGB/RGBA像素）、八场景工具条使opaque frame初始屏幕外RAF暂停（Gallery可信timer调度与高度通知不依赖RAF）。新增失败回归分别保存message-inherited-failed、png-decode-failed、offscreen-batch-failed及对应retest日志；不删除失败测试或改变正确golden。打包还严格要求file/http完整检查集合、64唯一布局全部PASS，slice-only报告不能被包装成CORE PASS。第二轮集中修复G03“读图说明”summary实际高度23.92px低于44px：只在Document范围给.cui-data>summary增加最小高度与padding。保留相同fixture/light390旧资源FAIL截图及最终After，同输入资源身份分别记录；从最终Renderer仅移除该CSS规则重建的Before资源hash与原采集13ac3b记录一致，原采集不是最终commit截图；新增44px失败回归先FAIL后PASS。其他G08字数阈值/parent pointer与捕获等待race属于QA适配，按具体首尾完整性与实际焦点Enter检查。HTTP专项另遇QA先等待overflow类再滚入offscreen frame的顺序超时：提示只在可見paint后测量，调整为实际滚入再等待，原FAIL保存；同资源全量复测通过，未再修改运行时。最终完整复测记录优先，不批量更新截图掩盖回归。

既有warning是monorepo实验lint2条、locked依赖deprecation和框架静态分类提示。没有新增依赖、通用CAS、学科组件或第二套Renderer。新Gallery有明确沙箱/消息专项回归。原工作树私人未跟踪实验目录未修改。

交付复核还发现macOS系统临时目录`/var`指向`/private/var`，校验将已resolve的文件与未resolve的目录比较，误判合法解包为越界。失败日志和跨平台alias回归先FAIL后PASS保留；QA打包器只将新临时目录也resolve，仍拒绝真实越界链接和ZIP symlink，不改变产品资源。最终交付改用修正后干净提交并重新执行工程和新解包双模式验收；首次未完成打包的候选文件保留，正式交付使用版本后缀。

## 7. 交付与停止

Gallery Candidate ZIP 是可运行产品：index、完整安全预编译fixtures、可信Renderer、README、notices、manifest和checksum。Review ZIP 是证据：精确最终SHA的README、本报告和设计安全可读副本、代表真实截图、完整结构化验收摘要、manifest，以及运行ZIP精确文件名与SHA。

`scripts/qa/package-phase2b.py` 只读最终通过证据并在Downloads新建两个ZIP；同名已存在时加版本后缀，绝不覆盖。审核包文档中的仓库专用链接转成可读标签，移除机器路径；原日志和私人配置不进入交付。原图不重绘，保留来源相对路径、大小和SHA256。最终包大小/hash/新解包路径见本地delivery JSON与交付消息。

回滚可在确认干净工作树后 `git revert <Phase-2B-local-commit>`，保留本轮失败证据及用户后续改动。没有生产迁移，因此没有生产切换回滚。完成后立即停止审核；Phase3需另行批准真实宿主验收、人工VoiceOver及可用其他浏览器、用户理解测试和后续迁移方案。本轮不实施Phase3/4，不push、部署、发布、改连接、PR、tag或Archive。
