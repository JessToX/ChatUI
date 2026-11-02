# ChatUI Final Edition — Phase 3 本地候选验收

> **历史阶段记录，非当前安装/发布指南。** 下文版本、许可待定、CI/宿主状态及审批范围仅反映当时，不能作为当前结论。当前原创许可已为 MIT / Jess(T o X)，当前版本与范围见[发行说明草稿](../release-preparation/RELEASE-NOTES.md)。保留原阶段事实，不继承旧测试为新候选通过。

日期：2026-10-11。授权起点 `49cb452f47008a9f89002cace50c34d862a07d4f`；分支 `codex/final-edition`。本轮仅执行最终整理、工程强化、离线验收和本地 RC 打包。**Local RC ≠ Published Release ≠ Host Validated ≠ GitHub Archived**。

候选结论以本轮最终 SHA 的工程、实际 ZIP 双模式浏览器及交付验证共同裁决：全部离线硬门槛 PASS 才是 **RC READY — OFFLINE VERIFIED WITH DECLARED LIMITATIONS**；未解释的安全、数学、正文、兼容、构建或包完整性失败则为 **RC BLOCKED**。本文不能替代提交后结果记录。

## 基线、身份与范围

只读预检确认起点 SHA 精确一致、工作树干净、main 位于独立原工作树。附件所写 `docs/phase2b.md` 的实际文件为 [Phase 2B](phase2b.md)。已阅读 [B1](b1.md)、[Phase 2A](phase2a.md)、[2A.1](phase2a1.md)、[Intellectual UI 规范](intellectual-ui-ux-spec.md)、[Document v1 契约](../rich-document-v1-spec.md)和 [Renderer README](../../renderer/README.md)。Phase 2B 外部审核仅独立复核结构、hash、内容与静态沙箱，没有重跑浏览器交互；历史结果均不算本轮 PASS。

| 项目 | 冻结基线 |
|---|---|
| portable / overlay | 0.9.1 / 0.9.1 |
| Renderer / serverInfo | 1.5.0 / 1.5.0 |
| root lock SHA256 | `34974e3cda1d449611fd4178ad4d5df2bf0c0995d45a999ba087984d352482cf` |
| Renderer lock SHA256 | `bb3af1b3b02ed994d4aaed57999018f0119aa45b339c929387159bcc819bd37e` |
| Document / default | `documentVersion: 1`；`render_html` 默认；Document additive |
| 环境 | macOS 26.6.2 (25G83) arm64、Node 24.20.0、npm 12.0.2、Python 3.9.6 |
| 浏览器 | Chrome 154.0.8037.98；Safari 27.0；Firefox 未安装 |
| 历史结果 | Phase 2B CORE PASS WITH DECLARED LIMITATIONS；本轮开始时新验收 UNKNOWN |
| warnings | response 236314 bytes 超 224 KiB 软目标；实验 lint 2 条；locked dependency deprecation；框架静态分类提示 |

独立 oracle 与固定 G01–G08 工厂冻结：`math-physics-golden.json` SHA256 `2e156308edb021ea8e1499e9b6147be0aa0054ea11e7b9ff179225c9eb114961`；`gallery.mjs` 为 `2c1411801234097f684b2f8f481c3b95295190a00c1b882346adafb16fd741b5`；`intellectual.mjs` 为 `d40faf8e874a82d227510fff0652b89b4cf1ed4c8206cae0a84fa5ee787fa518`。expected 不从生产计算生成。

源码文档不能包含自身最终 commit 或包含自身的 ZIP hash，否则循环改变身份。最终精确 SHA、当前 locks、每条命令/退出码/数量/日志 hash、三包字节及 SHA256 由提交后 `engineering/.../logs/results.json`、`browser/.../results.json`、`delivery/.../delivery.json` 与 Review 包内验收/发行清单绑定；这些原始记录保存在 `.local/phase3/`。Source 的外部生成 manifest 带有精确提交身份；Gallery manifest 固定资源 hash，再由 Source manifest 与最终浏览器/交付记录绑定提交。预提交截图必须保留真实 capture HEAD/dirty，不能改写为最终采集。

## 变更与契约

| 文件组 | 必要性与影响 |
|---|---|
| manifest、overlay、package/lock、生成版本、README/Skill、metadata 检查 | 同步本地候选 Plugin 1.0.0 与 Renderer/serverInfo 1.6.0；没有依赖升级和实际安装 |
| MCP 契约测试 | 区分 discovery 四个主资源与八个实际可读 URI；固定旧 schema、fallback 和默认路由 |
| Phase 3 QA | 从实际 ZIP 新解包执行全套工程与双模式浏览器，无原绑定读取；新增自动语义/键盘/缩放与真实性记录 |
| allowlist、source/review packager、第三方 notices | 补齐 root 组件/Python/生成入口、锁文件和公开文档；确定性、路径、敏感排除、相对链接与许可验证 |
| 四份候选文档 | 明确安装、回滚、宿主未来验证与各发布/归档授权边界 |

旧工具与专业 schema、错误完整 fallback、Document 协议、URI、opaque sandbox、生产 bridge 不变。`render_document` 没有变为实际默认。复制包含关闭 disclosure 和所有 tabs，Quiz 的正确答案/解析不进入提交前 UI、复制或发往父级/模型的状态消息；可信初始化向 iframe 提供本地评分数据。离线固定评分键随源码交付，源码检查者能找到该键。

## 可重跑验收与证据

先使用锁定候选生成资源，再打包；final 必须干净提交。命令中的路径由当次 package report 给出，不能套用历史结果目录。

下列 final 身份/打包入口在获授权的 Git checkout 执行，需要 HEAD/branch/clean/blob 证据。Source ZIP 不含 `.git`；其 root/Renderer 安装、测试、构建与生成入口可以独立运行，不能把 bare ZIP 伪装成具有原提交身份的 Git checkout。

```sh
python3 scripts/qa/package-phase3.py --phase final --output-dir .local/phase3/packages
python3 scripts/qa/verify-phase3-engineering.py --phase final --source-zip .local/phase3/packages/ChatUI-Final-RC-Source.zip --gallery-zip .local/phase3/packages/ChatUI-Final-RC-Gallery.zip
python3 scripts/qa/run-phase3-browser.py --gallery-zip .local/phase3/packages/ChatUI-Final-RC-Gallery.zip
```

| 门槛 | 当前候选必须取得的证据 |
|---|---|
| compact / canonical 组件 | 全量 `npm run test:components`；实际通过数记录于 final 工程 JSON |
| 独立 golden | compact/canonical/vendor 各全量；Renderer golden；G01–G03 数值、单位、固定题设与当前状态 |
| B1 | 原 `radius=2e-162,heightRatio=.05` 拒绝；连续域、三模板、四 MCP 路径、保存/恢复；不夹取面积 |
| Renderer / Python | 新解包完整 `npm test` 与 `unittest discover`；原回归不删除、不弱化 |
| standalone README | 第一段 shell 原样 locked install → public placeholder → test → tsc → lint → build |
| 生成与元数据 | canonical/vendor 相同；各生成器两轮确定性；fresh 和候选资源逐字节相同；candidate metadata |
| RC compiler | 新解包 330 次，0 failure；cold/warm 原始样本另存 |
| 来源与包安全 | final SHA/clean；重复打包字节相同；精确 allowlist；ZIP slip/symlink/重复路径；敏感内容；文档链接闭包 |
| Chrome 双模式 | 来自正式 Gallery ZIP；G01–G08 × 2 themes × 4 widths × file/127.0.0.1 HTTP = 128 布局，加原 32 专项与本轮定向检查 |
| 核心内容/安全 | G04 论证编号和反例；G05 八节/默认收起提纲/完整复制；G07 有界坏 TeX；G08 各拒绝/工具失败模拟/成功 Quiz；nonce/source/schema/request ID/迟到结果 |

本轮预提交实际结果：`engineering/precommit-3/logs/results.json` 的 16 项命令全 PASS；compact/canonical 各 **85/85**，三模板 golden 各 **11/11**，Python **113/113**，独立 Renderer README 全流程含 **221/221** 测试、TypeScript/lint/build PASS（standalone lint 0 warning），Renderer golden **3/3**，RC compile **330/330**，两轮生成、metadata、notices 和 fresh/candidate 资源相同。最终提交必须原样重跑这些门槛；预提交记录本身不证明最终 SHA。

预提交 Chrome 全量报告 `browser/20261011T110430Z-precommit-full-803000/results.json` 包含 **128/128** 布局、**32/32** 原专项、**54/54** 新自动无障碍和 **16** 有效挂载样本、**144** 截图。新增 ARIA snapshot 在随后独立 `precommit-aria-snapshot` 双模式再验 **54/54**，明确是浏览器可访问树而非 VoiceOver。最终报告使用冻结的同一检查脚本，在最终 SHA 的新解包重复完整覆盖。

本轮失败与复测：首个 fresh-source `precommit-1` 在许可审计入口失败，原因是 Source allowlist 漏选新增脚本，原 log 保留；补齐全部 QA/测试/requirements 后 `precommit-3` 全量通过。新 reduced-motion 测试第一次在 G03 的三个 slider 上遇到 QA strict selector 歧义，原 JSON/log 保留；使用真实时间标签后 focused、full 与 ARIA 双模式再验通过，没有修改生产 runtime。打包前公开测试源码中的故意 private-key/本机路径反例字面量会触发敏感扫描，改为运行时拼接相同反例，测试语义与拒绝规则均未放宽。独立审核进一步补齐内嵌 Facebook regenerator MIT helper 和 Sites 源码头版本归属，并强化 exact inventory 门槛；同属一轮集中工程强化，没有产品正确性失败被豁免。

失败的原始日志不能覆盖。最多两轮集中修复/复验；仍有硬阻断就停在 RC BLOCKED。QA 测量限制、脚本断言错误与产品错误分别说明，不用改 oracle 或限制来获得 PASS。详细本轮失败与复测说明随最终验收记录进入 Review。

## 浏览器、无障碍、性能和限制

Safari 当前 WebDriver session 拒绝，原因是现有 Remote Automation 设置关闭；没有修改设置。Firefox 当前未安装。两者为 **UNKNOWN / NOT RUN**，不能声明跨浏览器 PASS。VoiceOver 没有人工会话，**UNKNOWN**；自动 ARIA、键盘与可访问文本检查不代替人工读屏。真实 ChatGPT 宿主与用户理解度测试 **NOT RUN**。

自动无障碍检查覆盖被测主题的标题层级/landmark/名称、焦点、真实 Tab/方向键/Enter/Space/Escape、details/tabs/Quiz、44px 目标、reduced motion、文本对比、窄屏重排与所记录的缩放方法。支持声明只限实际测试覆盖；CSS zoom 如被使用须标明 surrogate，不能当作人工系统缩放/读屏验证。

资源实际 UTF-8 bytes、Gallery ZIP 与解包大小、cold/warm 编译以及 mount 完成回调/两次 RAF 的计时、CPU/内存/浏览器环境均进入最终 JSON。two-rAF 是挂载回调测量，**不是 FCP**；JSON 字节变化不是延迟收益。response 的 sanitizer、HTML surface 与既有完整组件带来预算开销；其 236314 bytes 超过 224 KiB 6938 bytes 为已声明软 warning，不能为此删除正确功能。无界处理、卡死或核心交互不可用仍为硬失败。

本轮实际测量环境为 **Apple M5 / 24 GiB**。预提交冷编译 5 样本 median **12.715 ms**、p95 **13.385 ms**；warm 300 样本 median **0.275 ms**、p95 **1.958 ms**。Chrome 16 个 mount 完成回调为 **0.4–28.9 ms**，没有超过对应 50/200 ms 软目标；不是普遍性能保证。Gallery ZIP **155507 bytes**、7 文件解包 **600183 bytes**，index **300590 bytes**、可信 Gallery Renderer **200171 bytes**。正式最终样本另记于最终工程/browser JSON，不复用这些计时作最终结果。

第三方 Source notices 对照全部 root 38、Renderer 948 个锁定 package 记录，区分安装/构建与实际嵌入：response 的 DOMPurify 3.4.16/其 MIT helper、vendored shadcn、Sites 0.2.0 源码头声明及其文件 hash；upstream 来源没有在本轮重新认证。Gallery 没有打包这些 npm 运行库。项目级许可证没有新增，许可选择待用户决定。

## 停止点

本地提交、最终 SHA 完整复验和三包交付后停止等待审核。未 push、创建 PR/merge/tag、部署、更新真实 ChatGPT 插件/Skill/MCP 连接、发布 Release 或 Archive；未进入 Phase 4。[Host 方案](host-validation-plan.md)和 [后续审批清单](release-and-archive-checklist.md)只供未来单独授权。
