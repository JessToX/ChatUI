# Phase 2A.1 — Intellectual UI 定向精修

> **历史阶段记录，非当前安装/发布指南。** 下文版本、许可待定、CI/宿主状态及审批范围仅反映当时，不能作为当前结论。当前原创许可已为 MIT / Jess(T o X)，当前版本与范围见[发行说明草稿](../release-preparation/RELEASE-NOTES.md)。保留原阶段事实，不继承旧测试为新候选通过。

日期：2026-10-11。分支 `codex/final-edition`，起点 `91a79f01811fbb17d533c3cc17ab799df4597961`，B1 数值安全基线 `145232f2c4f6efefa701557fe560eddc7e6d1b35`。历史 [Phase 2A 报告](phase2a.md)与 `output/playwright/phase2a/` 的 59 张截图保留原件；本轮只实施获批四项精修。现行规则见 [Intellectual UI 规范](intellectual-ui-ux-spec.md)。

## 1. 最终提交与证据门槛

最终本地 SHA 从 `git rev-parse HEAD` 读取，避免文档内自引用。**只有 `.local/phase2a1/acceptance/final-*/logs/results.json` 的 `sourceSha` 等于最终 HEAD、状态为 `PHASE 2A.1 CORE PASS`、工作树干净，且浏览器报告资源 hash 与提交逐字节相同，才能采用本报告的通过结论。** 浏览器结果、命令、环境与失败记录分别保存在 `.local/phase2a1/browser/<UTC时间>/`。完整命令与日志引用由各次 JSON 记录；未运行的检查不得借用历史数字作为证据。

## 2. 四项问题、最小修复与用户效果

| 项目 | 发现的问题与实施决策 | 改动位置 | 实际验证入口 |
|---|---|---|---|
| P1-A 章节提纲 | 以当前可见 H2/H3 计数，≥6 节才显示；使用默认收起的原生 details/summary。G01/G04 无提纲，G05 为“章节概览 · 8 节”。静态列表无定位链接，概览不写入保存状态或复制正文 | `explanation-renderer.js`、`document.css` | 4/5/6/8 边界、隐藏 tab/折叠、展开/收起、换文档与恢复、复制和 teardown |
| P1-B 短公式与滚动提示 | G01 的 h、b、A 通式和 A 数值拆四个短 display，关键结论不依赖横滚。display 公式/表格/代码仅可见且确实溢出时显示下方提示并启用 region/Tab；共享观察器和既有内容更新负责重测，未溢出无提示或额外停靠 | `intellectual.mjs`、compositor、CSS | 320/390 关键式实宽；24 布局实测；公式/表格/代码分别原生触摸与键盘滚动、选中文本、宽度/主题更新；生命周期测试 |
| P1-C 论证结构 | 只在 comparison 原有纯文本 detail 添加空行，文档范围 pre-line 分开“前提 A1/B1、理由 A2/B2、推论 A3/B3”；保留隐含前提与针对性反例。不改 schema 或解释模型 HTML | fixture、文档范围 comparison CSS | 六节点阅读顺序、390px A→B、768px等权两列、键盘反例、完整复制 |
| P2-D 几何标注 | 圆外尺寸括号覆盖 A→D 并标 h=AD；窄屏保留 r，按有向关系显示 h−r/r−h。显示值实际舍入时用≈，朗读用“约”，明确 x 与 b=2x；未改变公式、原始状态和数值拒绝 | canonical `component-kit.html` | 独立 golden、四绘图宽度×五比例；浏览器深浅×320/390×五比例的边界/文本碰撞测量 |

所有 compact、vendor 和 HTML/MJS 派生资源通过 `build_component_templates.py`、`generate-widget.mjs`、`generate-preview.mjs`、`generate-rc-fixtures.mjs` 更新，没有手改派生文件。版本、依赖与两份 lock 文件未升级；默认工具与路由未迁移。

## 3. 数学、完整内容与生命周期

固定题设仍为 `r=2 cm`，独立等边三角形 oracle 仍给出 `h=3 cm`、`b=2√3 cm`、`Amax=3√3 cm²`。真实键盘从 h/r=1 到1.5，派生状态保留 `5.196152422706632`，显示为 `面积 A ≈ 5.2 cm²`；半底边 x≈1.73 cm、底边 b=2x≈3.46 cm。Home/End 为 .05/1.95，不冒充解析退化端点 0/2。

原反例 `radius=2e-162,heightRatio=.05` 及整个允许区间的可靠表示门槛继续拒绝。四 MCP 路径、三模板、合法 tiny/large、连续域阈值及保存/恢复由原 B1 正式回归覆盖；浏览器伪造非法 View 仍移除 SVG/滑块并保留具体半径错误。没有夹取极小面积或保存错误零值。

完整复制仍使用已验证 View 的共享 serializer。G05 实际 Clipboard 与服务端 fallback 全等、3,577 字符，包含关闭的 SYN-E05 和两个 tabs；不包含提纲或滚动提示。G04 复制保留全部六节点和两反例。Clipboard 故障注入保留完整 readonly 文本、全选、Escape 与返回焦点；Quiz 的评分键/解释隔离以及迟到复制回调继续由正式测试保护。

概览仅属于当前挂载；更换文档、重新挂载或恢复私有组件状态不会转移概览展开状态。滚动测量只观察文档自己的有限容器和内容节点，不访问 parent DOM；销毁取消 RAF、断开观察器及字体/resize 监听。短 inline math 仍沿用原有行内布局，本轮滚动提示限定 display 公式、文档表格和代码。

## 4. 浏览器证据与同输入对照

开发预览仍通过本地 HTTP：运行 `python3 -m http.server 4173 --bind 127.0.0.1 --directory renderer/public`，访问 `/preview.html?phase=2a&example=document-g01`（或 document-g04/document-g05），用 `theme` 与 `width` 参数切换。新图仅写入 `output/playwright/phase2a1/`。

同输入 Before 使用提交 `91a79f0` 的精确 public renderer、host 与 CSS，在4175端口装载最终的三份编译 fixture；After 使用当前资源。输入字节全等，G01/G04/G05 sourceHash 分别为 `f9e9c88620ed781a`、`7fd88901afce5999`、`11ed6bf1cda0c78f`。**G01/G04 文案有改动；这些最终输入不冒充已存在于旧提交。旧 Phase 2A 原态图只作为历史参考，不能与不同输入混作配对。** 同输入截图覆盖深浅主题×390/768。

| 审核对象 | Before（phase2a1目录） | After（phase2a1目录） |
|---|---|---|
| G01 阅读 | `before/same-input-g01-light-390-reading.png` | `after/g01-light-390-reading.png` |
| G04 六节点 | `before/same-input-g04-light-768.png` | `after/g04-light-768-argument.png` |
| G05 首屏 | `before/same-input-g05-light-390-reading.png` | `after/g05-light-390-outline-closed.png` |
| G05 展开 | 同输入默认 Before | `after/g05-light-390-outline-open.png` |
| G01 短式与最优图 | 同输入默认 Before | `after/g01-light-390-key-formulas.png`、`after/g01-optimum-interaction.png` |
| 宽内容提示 | 同输入 Before | `after/g05-light-390-scroll-hint.png` |
| 反例与复制失败 | 既有运行时仍复用 | `after/g04-counterexample-keyboard.png`、`after/g05-manual-copy.png` |

同输入实测 G05 正文起点：390px 从533.56px到243.59px，768px从378.80px到205.80px；概览高度从343.97/227px到54px。这是布局位置测量，不是理解速度或任务完成率。24 个完整布局覆盖 G01/G04/G05 × light/dark ×320/390/768/1024；正文整体横向溢出≤1px测量容差。四个关键最优 display 在320/390完整可见。768/1024全部样例没有无意义提示。焦点及44px操作尺寸同时检查；静态截图不代替动态事件证据。浏览器最终复测 `.local/phase2a1/browser/20261011T065750Z/results.json`：10组交互、20个几何标注组合、24布局、12组同输入Before全部PASS，记录96张新图和73份public资源hash。公式/表格/代码分别验证了真实方向键滚动及Chromium原生触摸手势；独立DOM Range选择分别取得52/76/397字符且无提示混入。Range是浏览器选中文本检查，不冒充人工拖拽或设备触摸。完整文档复制另有真实Clipboard读回验证。

## 5. 当前测试矩阵与复现

环境：macOS26.6.2 arm64、Node24.20.0、npm12.0.2、Python3.9.6，Chrome154.0.8037.98。所有数量以本轮 final JSON 与相应原日志为准。预提交完整复测 `.local/phase2a1/acceptance/precommit-20261011T065720Z/logs/results.json` 已通过19项核心与3项standalone检查；最终提交验收另运行相同完整入口，见第1节SHA硬门槛。

| 检查 | 命令（root或renderer） | 本轮预期/已记录的证据 |
|---|---|---|
| 定向正式资源 | `node --test renderer/tests/document-reading.test.mjs renderer/tests/intellectual.test.mjs tests/test_math_physics_golden.mjs` | 已实测42/42：reading20、fixture11、golden11 |
| 核心入口 | `python3 scripts/qa/verify-phase2a.py --iteration phase2a1 --phase final` | 19项核心+3项全新standalone；必须FINAL PASS且SHA匹配 |
| compact/canonical | `npm run test:components`；设置canonical模板路径同命令 | 85/85各一次，日志components/canonical-components |
| golden三模板 | `node --test tests/test_math_physics_golden.mjs`；分别canonical/vendor环境 | 11/11各一次；含原B1拒绝和新增标注断言 |
| Renderer | `npm test`（renderer）与独立golden | 198/198；golden3/3，日志renderer-tests/golden-renderer |
| Python | `python3 -m unittest discover -s tests -p 'test_*.py'` | 85/85，含配置独占创建、symlink与相对链接检查 |
| 类型/lint/build | tsc无增量、`npm run lint`、`npm run build` | 日志typescript/lint/build；warning单独保留 |
| 生成/元数据/插件 | 两次generation、component --check、metadata --check、validate | 日志generation/component-generation/metadata/validate |
| 发行/敏感排除 | `verify-source-packages.py`及allowlist | 精确inventory、相对链接闭合、源码字节、重复ZIP、凭据/绑定排除 |
| RC编译 | `node scripts/rc-cold-warm.mjs` | 330编译、0失败；不外推宿主耗时 |
| 全新standalone | 按包内README安装→placeholder→test→tsc→lint→build；再generation/golden | 新目录与公共placeholder，无私人绑定；资源与monorepo逐字节一致 |
| 浏览器入口 | `python3 scripts/qa/run-phase2a-browser.py --iteration phase2a1` | 交互、24布局、12组同输入Before；资源/截图hash记录 |
| 人工读屏、Safari/Firefox、私人宿主、理解度 | 未运行 | UNKNOWN，不以Chromium或截图外推 |
| Phase2B完整Gallery/file:///64布局 | 未开展 | NOT RUN |

工程套件由共享 runner 记录每条命令、cwd、显式环境、耗时、退出码及日志。浏览器每次报告保存失败和复测，不覆盖旧目录；成功报告的资源在最终提交后核对git blob和本机文件hash。完整核心结果不能用旧Phase2A/B1 PASS替代。

## 6. 失败、warning、限制与回滚

首版尝试将结论放入 aligned 多行公式，触发既有 MathML 深度预算；已改为四个独立短式，没有放宽安全限制，失败日志为 `.local/phase2a1/logs/content-aligned-depth-failed.log`。首轮浏览器读到缓存旧资源导致近似标记断言失败；资源HTTP hash核对后在验收脚本禁用缓存。接着旧 `summary:first` 选择到了短文隐藏概览，Enter作用于仍聚焦的外层重置按钮，导致frame销毁；改为明确 `.cui-collapse > summary`，并等待资源装载完成。均保留当次FAIL，不删除断言迁就实现。完整 Renderer 首轮198项中1项失败：旧测试的通用 `details` 选择器命中新增概览，而非作者正文折叠；改为明确 `.cui-collapse` 并增加已保存正文展开状态的断言，198/198复测通过，日志 `.local/phase2a1/renderer-tests-disclosure-selector-retest.log`。20组合浏览器检查又真实发现320px、h/r=.5的“r − h”与右侧x重叠；修复仅在offset与x的标注行接近时，将offset放入两个x之间的空隙并以现有背景色细描边保护字形；增加280/320/390绘图宽度断言。全部组合复测结果以最终浏览器JSON为准，原FAIL保留。

monorepo两条既有实验lint warning、既有依赖deprecation和框架静态分类提示如实留在日志；standalone lint 无warning。私人宿主滚动、主题、Clipboard权限、人工读屏与用户理解度未知。原生G06仍为本地对照，不是实际ChatGPT原生验收。没有完成Phase2B，不声称file://交互Gallery可用。

本轮commit的回滚使用 `git revert <Phase-2A.1-commit>`，先确认工作树干净，保留旧Phase2A证据与用户后续改动。未改生产，因而没有生产迁移回滚。

## 7. 审核包与停止点

`ChatUI-Phase2A1-Review.zip` 只包含准确SHA的README、报告和设计说明安全副本、精选同输入Before/After及窄屏/交互原图、测试摘要、manifest及可选静态图片索引。同名目标存在则使用-v2，不覆盖。原图字节、路径/符号链接安全、相对链接、敏感排除和全新解压检查由打包记录验证；最终ZIP大小与SHA在交付消息给出，避免包内自引用。

本地视觉准入建议仅在所有最终硬门槛PASS后成立；剩余标题密度、G04卡片节奏和G05窄屏概览偏好由用户审核决定。可在审核通过后单独授权Phase2B完整G01–G08双模式Gallery与64布局，但本轮到此停止，没有push、部署、发布、私人宿主操作或归档。
