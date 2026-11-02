# Phase 2A — Intellectual UX 与三个可运行原型

日期：2026-10-11。授权起点 `145232f2c4f6efefa701557fe560eddc7e6d1b35`，分支 `codex/final-edition`。本轮完成 G01/G04/G05 真实纵向原型及 G06 原生对照，仅供本地视觉审核。设计依据见 [Intellectual UI / UX 规范](intellectual-ui-ux-spec.md)、[B1](b1.md)及 [Rich Document 契约](../rich-document-v1-spec.md)。

## 1. 结论与证据身份

实现、预提交核心回归与浏览器操作已通过。**最终本地提交的验收以 `.local/phase2a/acceptance/final-*/logs/results.json` 为准：`sourceSha` 必须等于当前 HEAD，状态必须为 `PHASE 2A CORE PASS`，且工作树干净。** 浏览器报告另记录确切资源 SHA256；只有与最终提交资源相同或在最终提交重跑，才可沿用其截图。本文不把起点 B1 的历史 PASS 当作本轮结果。

已完成的证据：预提交核心入口 `python3 scripts/qa/verify-phase2a.py --phase precommit`；浏览器入口 `python3 scripts/qa/run-phase2a-browser.py`。证据均写入新的带时间戳目录，不覆盖历史失败记录。报告、源码及复现脚本进入本地提交；本机日志、截图与校验用 ZIP 留在忽略的审查目录，不纳入发行 allowlist。包检查创建的是本地测试制品，没有发布。

三种 fixture 均经 `normalizeDocument → validateDocumentView → mountExplanation`；G01/G04 复用 `mountChatUI` 组件，G05 复用 compositor 内的 tabs/collapse 运行时。未增加第二套渲染器、通用计算器、数据库或任意代码执行。G05 代码是可读示例，页面不会执行。

## 2. 变更及取舍

| 源文件 | 实际改动与原因 | 契约影响 |
|---|---|---|
| `renderer/lib/document.css` | 780px 上限、桌面 18px/1.7、窄屏 16px/1.7、28/24/20px 标题；callout 改为透明底；表格/代码/公式局部滚动；44px 控件及可见焦点 | 只在 Document 资源加载，选择器限定 `.cui-rich-document` |
| `renderer/lib/explanation-renderer.js` | 四个以上可见 H2/H3 生成静态提纲；完整复制、手动选择回退、关闭/Escape/焦点与异步生命周期保护 | 功能仅在 Document 模式出现；保留原 compositor |
| `renderer/lib/response-text.mjs`、`response-normalization.mjs` | 将原有纯 fallback 序列化代码原样提取，共享给服务端与可信浏览器代码；原导出保留 | 复制与服务端完整 fallback 使用同一个函数；不读取 `innerText` 或信任工具 `content` 作为复制来源 |
| `renderer/lib/widget-bridge.js` | Document 校验失败时保留最多 300 字符的错误原因，通过 `textContent` 显示 | 旧模式提示不变，无 stack 或 HTML 执行 |
| `renderer/examples/intellectual.mjs` | 正式 G01/G04/G05 输入与纯文本 G06 | 现有 DSL、预算及数值安全限制不变 |
| `renderer/preview/*` | `phase=2a` 展示四个样例；G06 不创建 iframe；选例/刷新/重置更换 frame 身份 | 本地宿主拒绝旧 frame 消息和状态回写；生产路由不变 |
| `renderer/scripts/generate-widget.mjs`、`generate-preview.mjs` | document 资源包含共享 fallback；确定性生成三个原型和原生对照 | 所有 public/generated 资源通过生成器更新 |
| `renderer/tests/document-reading.test.mjs`、`intellectual.test.mjs` | 新增 21 项内容、复制、隐私、拒绝及生命周期回归 | 未删除测试或放宽校验 |
| `renderer/scripts/phase2a-*-checks.js`、`scripts/qa/*phase2a*.py` | 可复现浏览器/核心验收，记录命令、环境、退出码、资源和截图 hash | 只访问本地 HTTP，未接触私人宿主 |
| `scripts/release-allowlist.json`、README 与本阶段文档 | 显式加入所需公开源码、fixtures、生成资源、测试与文档 | 所选内容及包内相对链接继续闭合；配置助手原有独占创建规则保留 |

排版取舍：正文连续推进，仅独立比较等对象使用边界；标签与编号承担认知层次。目录使用真实列表，避免与标题自带编号重复。18px 正文、中性比较卡及较轻的 callout 是设计选择；没有用户研究证据证明理解速度或学习效果已经提高。

## 3. 预览与用户任务

从仓库根目录运行 `python3 -m http.server 4173 --bind 127.0.0.1 --directory renderer/public`。当前生成文件需要 HTTP；`file://` Gallery 留在 Phase 2B。

| 样例 | 本地 URL 路径 | 已操作行为 |
|---|---|---|
| G01 数学 | `/preview.html?phase=2a&example=document-g01` | 键盘调节 h/r；图形、当前高度和面积同步；寻找最优、检查滑块边界；刷新恢复与重置 |
| G04 哲学 | `/preview.html?phase=2a&example=document-g04` | 比较 A1/A2/A3 与 B1/B2/B3；用 Enter 展开、关闭针对具体推论的反例；定位未解决问题 |
| G05 研究 | `/preview.html?phase=2a&example=document-g05` | 八节静态提纲；方向键切换解释；定位证据/限制；完整 Clipboard 写入及失败手动复制 |
| G06 原生 | `/preview.html?phase=2a&example=native-g06` | 一句原生文本，没有编译 View、iframe 或新组件 |

使用 `theme=light` / `theme=dark`、`width=320/390/768/1024` 切换主题和宽度；`bare=1` 隐藏开发工具条。样例由仓库自编，不含用户记录或聊天资料。G04/G05 的合成来源、事实/价值判断、证据支持范围与限制均明确标注。G06 是路径对照，未修改账户侧自动路由，也没有声称已在真实 ChatGPT 对照实验中获胜。

## 4. Golden 与安全操作

G01 独立 oracle 为等边三角形外接圆关系。`r=2 cm`：最优高度 `h=3 cm`，边长/底边 `2√3 cm ≈ 3.4641016151377546 cm`，面积 `3√3 cm² ≈ 5.196152422706632 cm²`。真实浏览器从初始 `h/r=1` 用方向键到 `1.5`，保存的高度为 3、半底边为 1.7320508075688772、面积为 5.196152422706632，单位为 cm。固定推导正文逐字保持。

Home/End 实际到 `.05/1.95`，未声称覆盖解析退化端点 `0/2`。B1 原下溢反例 `radius=2e-162,heightRatio=.05` 在新增 fixture 编译与既有 MCP/组件路径中继续拒绝。浏览器注入非法 View 时显示“圆半径必须为可计算的正数”，清除旧 SVG/滑块，保留可读 fallback；后续合法 View 可以恢复。没有夹取最小正面积或保存错误零值。

完整复制重新从已验证 View 序列化；G05 真实 Clipboard 文本共 3,577 字符，与编译所得 fallback 全等，包含关闭的 `[SYN-E05]`、两个标签页 `[SYN-E04-A/B]`、八节、表格、公式、代码及文末限制。复制不把当前实验状态写成固定题设。故障注入明确模拟 Clipboard 拒绝：未显示成功，readonly 全文获得焦点并全选 0–3577，Escape 关闭并返回复制按钮。Quiz 正确键和解析在提交前后都不进入全文复制，相关检查在独立运行时测试中通过。

G05 本地 iframe 实测 `scrollHeight=clientHeight=5399`（390px 浏览器中的开发预览），滚动由外层页面承担，因此只提供静态提纲；没有假定位按钮、父 DOM 操作或“已定位”反馈。

## 5. 当前实测矩阵

环境：macOS 26.6.2 arm64、Node 24.20.0、npm 12.0.2、Python 3.9.6；Chrome 154.0.8037.98。锁文件未变；root SHA256 `34974e3cda1d449611fd4178ad4d5df2bf0c0995d45a999ba087984d352482cf`，Renderer `bb3af1b3b02ed994d4aaed57999018f0119aa45b339c929387159bcc819bd37e`。下列数字来自本轮运行；最终提交绑定采用第 1 节 final 报告。

| cwd | 命令/操作 | 实测结果 | 日志名 |
|---|---|---|---|
| root、renderer | 各自 `npm ci --ignore-scripts --no-audit --no-fund` | PASS；锁定安装 | `root-install.log`、`renderer-install.log` |
| root | `npm run test:components` | PASS 82/82 | `components.log` |
| root | `CHATUI_TEST_TEMPLATE_PATH=plugins/chatui/skills/chatui/assets/component-kit.html npm run test:components` | PASS 82/82 | `canonical-components.log` |
| root | `node --test tests/test_math_physics_golden.mjs`；同命令分别设置 canonical/vendor 模板路径 | PASS 各 8/8 | `golden-compact.log`、`golden-canonical.log`、`golden-vendor.log` |
| renderer | `npm test` | PASS 188/188，含新增 21 项 | `renderer-tests.log` |
| renderer | `node --test tests/math-physics-golden.test.mjs` | PASS 3/3 | `golden-renderer.log` |
| root | `python3 -m unittest discover -s tests -p 'test_*.py'` | PASS 85/85 | `python.log` |
| renderer | `./node_modules/.bin/tsc --noEmit --incremental false` | PASS | `typescript.log` |
| renderer | `npm run lint` | PASS，0 error，2 既有实验 warning | `lint.log` |
| renderer | `npm run build` | PASS | `build.log` |
| root | `python3 scripts/build_component_templates.py --check` | PASS | `component-generation.log` |
| root | `node renderer/scripts/check-generation.mjs` | PASS，相同环境重复两次字节一致 | `generation.log` |
| root | `python3 scripts/sync-plugin-metadata.py --check`；`python3 scripts/validate.py` | PASS | `metadata.log`、`validate.log` |
| root | `python3 scripts/verify-source-packages.py --output-dir <新建本轮目录>` | PASS；精确 inventory、重复 ZIP、敏感排除与相对链接闭包 | `packages.log` |
| renderer | `node scripts/rc-cold-warm.mjs` | PASS，330 次编译/0 失败；不是宿主时延 | `cold-warm.log` |
| 全新解包的 renderer | README 首段：`npm ci --ignore-scripts` → `node scripts/prepare-local-config.mjs` → `npm test` → `npx tsc --noEmit --incremental false` → `npm run lint` → `npm run build` | PASS；188/188；lint 0 warning | `standalone-readme-quickstart.log` |
| 同上 | `node scripts/check-generation.mjs`；`node --test tests/math-physics-golden.test.mjs` | PASS；canonical/vendor及共用资源与monorepo逐字节一致 | `standalone-generation.log`、`standalone-golden.log`、`resource-equality.json` |
| 本地浏览器 | G01/G04/G05 × 2 主题 × 4 宽度 | PASS 24/24；主体溢出 0；主要操作目标≥44px | `visual.log` |
| 本地浏览器 | 6 组核心交互、G06 两主题 | PASS；无 pageerror，真实 Clipboard 与失败回退分别验证 | `interaction.log`、`visual.log` |
| 人工读屏、私人宿主、Safari/Firefox | 未执行 | UNKNOWN | 不以自动语义测试替代人工验收 |
| `file://` Gallery、完整 G01–G08/64 场景 | 本阶段未执行 | NOT RUN | 属于 Phase 2B |

完整命令、cwd、显式环境、耗时、退出码与最终 SHA 位于每次 `results.json`，日志文件与其同目录。打包只选择显式 allowlist；新增共享 serializer、fixture 和测试均进入 standalone。旧工具、八个 canonical/alias URI、默认 `render_html` 路由、TeX 降级、预算、Quiz 隔离、配置助手及文档闭包继续由完整核心套件保护。版本仍为插件 0.9.1、Renderer 1.5.0、documentVersion 1。

## 6. 视觉审查包与已知限制

本机 `output/playwright/phase2a/` 保存 59 张 PNG：before 16 张、after 43 张。after 包括 24 张完整布局、12 张阅读视口、2 张原生对照、5 张交互/错误/复制证据。hash 清单在浏览器 `results.json`；最终提交绑定记录另外核对 before 和 after。

| 对照/操作 | before 文件 | after 文件 |
|---|---|---|
| G01 桌面连续阅读 | `before/same-input-g01-light-768-reading.png` | `after/g01-light-768-reading.png` |
| G04 窄屏比较 | `before/same-input-g04-dark-390.png` | `after/g04-dark-390.png` |
| G05 长文阅读 | `before/same-input-g05-light-768.png` | `after/g05-light-768.png` |
| G01 最优状态 | 既有组件复用 | `after/g01-optimum-interaction.png` |
| 非法半径拒绝 | 本轮新增可读错误提示 | `after/g01-rejected-input.png` |
| G04 键盘展开反例 | 既有 disclosure 复用 | `after/g04-counterexample-keyboard.png` |
| G05 隐藏解释与手动复制 | B1 无完整复制控件 | `after/g05-alternative-tab.png`、`after/g05-manual-copy.png` |

before 分两组：4 张起点 B1 既有样例原态；12 张把相同 G01/G04/G05 编译输入交给精确 B1 资源的同输入对照。后者只借新 fixture 对比外观，不声称这些 fixture 在 B1 原提交已存在。before 静态资源保存在 `.local/phase2a/before/public`。

已测改善：桌面正文从16px变18px；阅读宽度≤780px；所有被测窄屏无整页横向溢出；长代码、表格和公式局部滚动；复制覆盖隐藏内容；重置/换例拒绝旧frame操作。标准主题 token 的静态 sRGB 对比度计算：正文浅/深15.91/16.87、辅助文字6.30/9.21、蓝badge4.68/5.00、绿badge4.63/7.15，均≥4.5；这不是对任意宿主自定义颜色的保证。

需要用户视觉判断：长文提纲在窄屏占用的首屏高度、28/24px 标题密度、中性比较卡与透明 callout 的偏好。没有完成真人任务研究或人工读屏。私人 ChatGPT 的主题覆盖、Clipboard 权限、滚动与端到端体验保持 UNKNOWN。

本轮发现并修复两处体验问题：目录重复编号；非法 View 被拒绝后笼统 fallback 隐藏具体半径原因。浏览器 harness 初次运行还暴露了三处测试准备问题：状态字段应读 `component`、等待真实 auto-height 消息完成、清除前次保存的 disclosure 状态；已修正 harness，并保留失败日志。没有修改独立数学 expected 来迁就实现。monorepo 两条既有实验 lint warning、安装中的既有依赖 deprecation、框架静态分类提示仍单独记录；standalone lint 无 warning。未发现仍未解释的硬门槛失败。

## 7. 本地提交、回滚与停止点

最终提交 SHA 从 `git rev-parse HEAD` 及最终报告读取，避免提交内自引用。差异范围是 `git diff 145232f2..HEAD`。只在隔离分支创建本地提交，main/RC4/原工作树未修改。

回滚方式：工作树干净时，对本轮提交执行 `git revert <Phase-2A-commit>` 生成可审阅的反向提交；或另建只读审查工作树指向 `145232f2`。保留本轮证据，不用 `reset --hard` 覆盖用户后续改动。没有生产迁移需要回滚。

Phase 2A 到此停止。若用户视觉审核通过，下一步可单独批准 Phase 2B：完整 G01–G08 离线 Gallery、`file://`/HTTP 双模式、64 布局与浏览器/人工可访问性矩阵。私人宿主测试、默认路由迁移、部署、Release、归档仍需对应的后续授权。
