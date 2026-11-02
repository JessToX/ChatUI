# 工程导航与维护入口

## 当前维护基线（2026-10-27 核对）

长期源码入口为本 Git 主线。整合前 HEAD 为 `64de415678943f75a0a347be849faf85f923bc2f`；2026-10-26 的维护文档、复制状态修复及回归测试已选择性整合；提交与同步状态以实际 Git 记录为准。维护时先检查 `git status --short --branch` 与 `git rev-parse HEAD`；HEAD 不包含未提交变化，不能单凭提交号识别当前测试对象。

此前文档提交 `afe181422d8a201131414145accb01d477b01ebf`（来源分支 `docs/offline-release-closeout-20261025`）、独立副本与本地 r2 源码包作为历史来源保留；分支名是否仍存在以实际 Git 引用为准。r2 的复制修复及直接回归已纳入本工作树，MIT 采用、图标排除、交付裁剪并未导入。r3已纳入8659a5e与打包时五文件增量，但不含后续验收文档更新。旧 ZIP 是不可直接编辑的历史快照，不包含当前全部维护文档；后续从主线生成新候选，不能反向覆盖源码或双向手工同步。现有 r1→r2 恢复补丁仍只适用于对应旧包。

当前产品行为、许可和验收证据见 [STATUS](release-preparation/VALIDATION.md)。下方折叠记录保留原始阶段语境；旧 SHA、待批准动作和测试计数不是当前执行计划。六工具的公开合成基础显示已有分层实测记录，未测交互/历史/协议与CI仍分别待验证，本地构建或生成通过不能替代它们。

## 分支与保全材料职责

以下为2026-10-27审阅时的核对快照及已批准清理结果，不替代之后的即时Git查询；未注明获批的材料不自动删除：

| 对象 | 当前关系 | 维护原则 |
| --- | --- | --- |
| `main` | 审阅基线为8659a5e；核对时原仓库只有这一条本地分支、一个注册worktree且无stash | 新源码继续在此审阅；HEAD不包含当前未提交文档/测试 |
| 原 `origin/codex/native-ui-iteration-1` | 18275b1是main祖先，独有提交0；已获批准并按精确旧SHA删除该远端分支 | 提交仍由main保留，可恢复分支；没有删除历史对象或推送工作区代码 |
| `origin/docs/offline-release-closeout-20261025` | 在8659a5e基线下，afe1814与main各有1个独有提交，分叉于64de415；独有提交只改README与旧阶段STATUS | README改动已纳入当前工作树；历史状态记录仍有审计价值，不blind merge或直接删除 |
| 独立文档副本 | 有独立Git目录，不是原仓库worktree；保留afe1814以及4处未提交文档差异 | 是历史保全/对照材料，不作为第二长期源码入口，不因清理分支顺手删除 |
| 保全引用、草稿备份、旧源码ZIP及恢复补丁 | 保存旧Mac/Windows状态或可验证恢复链；不等于活跃产品分支 | 先确认是否独有与是否可恢复，再决定清理；Git分支列表少不等于文件可全部删除 |

origin状态曾只读对照真实远端；之后只按批准删除上述native分支，读回核验main与文档分支SHA不变。未提交或推送工作区代码。目录名称、软件侧项目入口与Git分支是不同对象：移除一个项目入口不等于删除目录；不能凭“Recovery”标签推断其没有独有内容。

## 文档增量取舍（2026-10-27）

| 来源增量 | 与当前主线 / r3 的关系 | 取舍 |
| --- | --- | --- |
| afe1814 的 README 同步/验收边界更正 | 原修正已被主线覆盖；当前README又按六工具实测更新。r3带包级说明，是历史快照 | 保留当前文字，不回退为旧阶段“全部宿主未验收” |
| afe1814 的 STATUS 历史基线/测试/扫描边界 | 含64de415阶段的独有审计语境，当前验收已演进 | 摘要纳入STATUS历史折叠区，计数仍绑定旧基线；源提交保全后才可评估分支名清理，不将历史PASS移作当前PASS |
| 独立副本 README 的维护导航段 | 已在主线README采用，r3有对应快照版本 | 已覆盖，不重复复制 |
| 独立副本 ENGINEERING 的源/生成/构建/恢复说明 | 有用说明已纳入本主线；当前版本增加了8659a5e/r3与分支职责 | 保留当前版本；旧“需选择主线、r2修复未整合”只留原副本作历史，不应用到main |
| 独立副本 VALIDATION | 与主线工作树和r3字节相同 | 无新内容，无需再改或重复跑测试 |
| 独立副本 renderer/README | 对照时与主线字节相同，r3有包级历史链接裁剪；本次主线另更新当前验收与包/整仓许可边界 | 保留原维护命令改进，纠正过时的“一概未验收/许可待选”文字；不反向导入包级链接裁剪，不因重复内容删除副本 |

本轮文档整合未自动删除来源；独立副本、来源提交和旧包保留。已批准的native分支及Recovery可恢复清理另有记录，不应将本段解读为它们仍在原位置。Git独有提交数不会因手工整合等价文字自动归零，清理前仍须核对对象保全和未提交内容。

## 应编辑哪里

| 职责 | 手工维护的源文件 | 派生文件 / 检查入口 |
| --- | --- | --- |
| MCP 路由与工具契约 | `renderer/app/mcp/route.ts`、`renderer/lib/mcp.mjs` | `renderer/tests/` 中对应协议测试；固定诊断不是产品路由 |
| 校验、渲染和交互 | `renderer/lib/*validation.mjs`、`scene-runtime.mjs`、`scene-surface.js`、样式与 bridge 源文件 | `generate:widget` 生成 `lib/*.generated.mjs` 和四份 `public/chatui-*.html` |
| 通用组件 | `plugins/chatui/skills/chatui/assets/component-kit.html`、`component-examples.json` | `build_component_templates.py` 生成单组件模板；`generate:widget` 刷新 `renderer/lib/vendor/` 副本 |
| 插件描述与界面元数据 | `plugins/chatui/plugin.json` | `sync-plugin-metadata.py` 同步 `.codex-plugin/plugin.json` 的派生字段；不手工复制两套字段 |
| 示例、预览和 Gallery | `renderer/examples/`、`renderer/preview/`、`renderer/gallery/` | `generate:preview` 生成预览和输入示例；`generate:gallery` 生成 Gallery 七文件及校验清单 |
| 应用页面与静态源文件 | `renderer/app/`、`renderer/components/`、非生成静态资源 | `public/` 并非全为生成物；修改前查生成脚本的具体写入目标 |
| 检查与打包 | `tests/`、`renderer/tests/`、`scripts/qa/`、`scripts/release-allowlist.json` | 按变更选择 [验证入口](release-preparation/VALIDATION.md)，不要默认运行所有阶段脚本 |
| 本地诊断 / 实验 | `renderer/diagnostics/`、`renderer/experiments/`、`scripts/tunnel-*` | 固定场景、实验或历史证据；不作为普通开发启动入口，不自动开启凭据联调 |

生成脚本会在完整仓库中优先使用 canonical 组件，并刷新 vendor；只有独立 Renderer 构建缺少 canonical 时才使用随包 vendor。两者职责不同，不应直接删去其中一份或各自修改。普通示例工厂位于 `renderer/examples/`；插件参考示例中由 `generate:preview` 写入的文件也不是第二套实现。

## 编辑 → 生成 → 针对性检查

首次安装、解释器与锁文件要求沿用 根 `README.md`（完整仓库入口） 和 [Renderer 开发说明](../renderer/README.md)。以下命令按改动选择，不是要求每次全部执行；不调用 Tunnel 或真实宿主。

组件或插件元数据修改后，从仓库根执行相应一组：

```sh
# canonical 组件改变后：重建，再只读核对，再测组件
python3 scripts/build_component_templates.py
python3 scripts/build_component_templates.py --check
npm run test:components

# portable 插件元数据改变后：同步，再只读核对候选声明
python3 scripts/sync-plugin-metadata.py
python3 scripts/sync-plugin-metadata.py --check --candidate
```

交互、校验、组件或预览源文件改变后，从 `renderer/` 更新派生资源，再跑受影响测试。例如 Scene 修改：

```sh
npm run generate:widget
npm run generate:preview
npm run generate:gallery
node --test tests/scene.test.mjs tests/scene-vertical.test.mjs
```

需要构建验收时再执行 `npm run build`；它已经按上述顺序运行三个生成器，无需紧接着重复生成。类型检查可使用已安装的 `node node_modules/typescript/bin/tsc --noEmit --incremental false`，避免检查过程中隐式下载工具。其他变更对应的测试选择见 [VALIDATION](release-preparation/VALIDATION.md)。

`node scripts/check-generation.mjs` **会写文件**：每轮运行 widget、preview、RC fixtures、gallery 四个生成器，两轮比较输出字节；RC 输入会写到 `output/playwright/rich-document/rc/`。它不比较首次生成前的状态，不能单独证明原先检入的资源最新。执行前记录已有改动，执行后用 `git status --short` 和 `git diff --stat` 审阅新增的派生变化；不要用 reset、checkout 或 clean 消除差异。普通文档修改不需要生成或构建。

## 打包与恢复入口

| 目标 | 现有入口 | 使用边界 |
| --- | --- | --- |
| Plugin ZIP | `python3 scripts/package.py --help` | 仅插件目录，不是完整 Renderer 或 r2 源码包；实际打包会写新制品 |
| 旧阶段 RC 包 | `python3 scripts/qa/package-phase3.py --help` | `--phase final` 要求干净提交；默认有分支门禁，`--offline-final` 还有既定安全基线门禁，不为打包而改分支/绕过门禁 |
| 已验证 r1 / r2 / r3 源码快照 | 各自的 `SOURCE-MANIFEST.json`、`SHA256SUMS` 与对应 CHANGELOG | 与 Git 分支不等同；不会由当前仓库的打包命令自动复现全部许可和范围变换 |
| r1 → r2 恢复 | 已保留恢复材料中的 `README.md`、`source-r1-to-r2.patch`、`verify_recovered_sources.py` | 只适用于核对哈希后的 r1 包，在新目录应用和重新生成；不得直接套用到原 main |

本机材料的相对位置与哈希索引保存在本地交接说明中，不将工作区、缓存、依赖或原始证据当作源码包。依赖和生成物保留其既定忽略/allowlist 边界；Git ignore 不能证明某文件适合公开。

<details>
<summary>2026-10-21 至 2026-10-23 工程记录（历史原文，非当前状态）</summary>

## 2026-10-23 隔离候选状态（尚未应用）

本文件位于本地复核候选。主工作区与远端仍停在 `83a0452bbf83bbaabe0463c7d9bb06f03cde967b`；历史脱敏候选基点为 `036d7c65f43982730697bf1ed0c5a3adf5a00e88`，后续门禁/文档修补的确切提交与 tree 由本地候选收据记录。不能把此候选当成已推送、已部署或发布完成。

已完成的旧批次包括指定24个本地历史材料目标删除、7条旧引用移除和11个本地标签对齐；三份许可草稿仍保留。不要重复执行下文旧计划。本仓库未来署名已核为 JessToX 与 GitHub noreply。

独立复核确认正常可达历史仍有私人会话链接和任务标识。本隔离候选仅脱敏这些明确关联值，并修复发布门禁的 JSON 转义绕过；不全局替换未知 UUID。GitHub 基线未观察到 Actions/check-runs/statuses；此候选未运行外部 CI。reflog、不可达对象、其他本地归档和外部副本未清理。许可、素材出处及支持范围仍待决定。

以下为2026-10-21工程记录，已被上文状态取代，保留作历史背景；其中数量、SHA、待操作建议不是当前执行计划。

## 历史记录：保留但不提交的本地内容

此次核验初始为 1211 项：3 个 tracked 修改、1208 个 untracked。
- output/site-diagnostic-clean-0e4dfb-20261020T103919Z：1167 文件。含三个各371文件的构建/准备副本、8项 npm 缓存及分析、归档、脚本；保留原地，精确忽略该目录。
- output/host-ui-20261021：17项截图/测试证据；保留原地，精确忽略。
- docs/tunnel-preparation：9份原始 .log 和 verification.json；保留并忽略。8份 Markdown 交接记录继续显示，待逐文件审查，不一并隐藏。
- docs/native-ui-iteration-1 的两份未跟踪 patch：保留待审，不自动套用、不忽略。
- component-kit 2.html：与 canonical 内容不同，来源/必要性待确认，不当成可再生垃圾删除或忽略。
- 许可和公开范围草稿暂停推进，继续保留；Git ignore 不是公开发布 allowlist。

## Git 同步与隐私边界

已核实同一私有仓库的新 owner，origin 已迁移到 https://github.com/JessToX/ChatUI.git。
远端 main 为 668abc0，本地 main 为 6428ab0，领先6提交、落后0。fetch 因既有损坏 refs/stash 2 失败，随后只读 ls-remote 验证远端 SHA 与本地 origin/main 一致；没有修复或删除引用。

当前有效提交邮箱不是 GitHub noreply。HEAD 可达70提交的作者/提交者共140记录，2个不同邮箱值均非 noreply；6个未推提交共12记录使用同一非 noreply 邮箱。仅输出类别与数量，不公开邮箱值。网页隐藏邮箱不改写 Git 提交。

暂不新增提交或 push。下一步需确认账户提供的 noreply 地址及仅本仓库未来提交身份；6个既有未推提交若要去除邮箱，必须另行明确批准重写范围并先备份，不能凭本次整理授权 amend/rebase。远端既有历史也有邮箱风险；私有同步与干净公开快照是不同操作。

所有源文件、旧证据与草稿保留。没有删除、移动未知文件、改写历史或修改全局 Git 配置。

## 本轮实际检查

仅新增工程导航、README链接和精确证据忽略规则，没有产品行为更改。元数据一致性、17个组件模板检查、两轮205文件生成一致性、git diff --check 通过。原完整产品回归结果见 release-preparation/VALIDATION.md；本轮不将文档整理说成重跑完整功能回归。

6个待推提交涉及68个不同路径。定向文本扫描发现固定私有部署标识位于 docs/tunnel-preparation/DOCTOR-ONCE.md、RUN-APPROVAL.md、scripts/tunnel-doctor-once.py；测试文件 local-html-pilot.test.mjs 有邮箱形状文本，不能仅凭格式判定私人邮箱。扫描未命中所检查API token格式，不构成没有秘密的保证。公开快照仍排除部署绑定和本地诊断；私有推送也需先解决提交邮箱处理决定。

整理后19项可见changes：4个tracked修改、15个untracked；其中许可草稿与历史记录仍待审，不是假装工作区已经干净。1194项已辨认的本地证据/构建副本保留原地并被精确忽略。

## 进一步核验（未修改身份或历史）

GitHub Emails 页面确认隐藏邮箱与阻止暴露邮箱push均开启。账户提供的noreply已核实，需用户确认后才配置本仓库；不在工程文档记录私人邮箱或账号邮箱地址。

refs/stash 2 是41字节普通文件，名字含空格不合法，但内容是有效OID 715fb77031c809acbe969d0202c459cceb38ebb1，对应commit存在且有两个父提交。合法refs/stash可解析为11f41ffff9f362063b9a330c3c7cbb4eb8a68de1（没有同名loose文件），两者不同，不能覆盖合法stash。尚未修改引用。非法文件SHA256为2a40d9717c117b8720e0bd1b6f7c6212380be5760860f897db57ab92b7b3830d。

建议审批后：在本地私有备份目录复制非法ref原字节及相关reflog（若存在），对main/合法stash/恢复对象创建显式对象闭包bundle并verify、记录校验值；以refs/recovery/stash-duplicate保全该对象，再把非法文件移到refs之外的备份目录（不删除），不覆盖合法stash。随后只读检查引用并fetch。备份不可推送/公开，可能含历史私人数据。

6提交邮箱替换另行审批：保留原main对象、工作区和index摘要，显式bundle备份原main；按原顺序只重建这6个commit的author/committer邮箱及必要父OID，保留名字、时间、message与tree。逐个验证tree完全相同、基线仍668abc0、最后工作树不变，用compare-and-swap更新main；不使用会覆盖未提交文件的reset --hard，不改远端历史。签名若存在则先停止确认，不能声称重写后仍有效。旧邮箱仍存在于本地备份及已推远端祖先，本步骤不解决全部历史隐私。

### 剩余19项逐类结论

- .gitignore、docs/ENGINEERING.md：本轮工程整理，可精确提交；README.md混有暂停中的声明草稿，提交应仅选工程导航hunk或等待声明恢复审查。
- docs/release-preparation/VALIDATION.md、VALIDATION.md、VALIDATION.md、PUBLIC-SCOPE.md、PUBLIC-SNAPSHOT-PLAN.json：5项许可/隐私/公开范围准备，按最新要求保留暂停，不混入工程提交。
- docs/native-ui-iteration-1/form-sync.patch、resource-uri-site.patch：2项旧补丁，逆向check不适用当前树；包含已演进代码/旧Site路径，不能据此自动当成已应用或待应用。保留历史，不套用或删除。
- docs/tunnel-preparation/HOST-UI-DIAGNOSIS.md、MINIMAL-CONTROL.md、VERTICAL-LOCAL-CANDIDATE.md：3项阶段证据，含本机路径/会话关联标识类别，保留本地，不纳入公开快照。
- docs/tunnel-preparation/NEXT-PRODUCT-ACCEPTANCE.md、PRODUCT-CONTINUATION.md、PRODUCT-HANDOFF.md、R2-ACCEPTANCE.md、SIZE-NOTIFICATIONS.md：5项历史计划/验收/修复交接；无需恢复产品源码。与当前文档互补，不是自动发布证明。
- plugins/chatui/skills/chatui/assets/component-kit 2.html：1项历史canonical副本，blob 55b0fd84fa75d69c0a2994b9d82a70ba1aa81927 与HEAD祖先25次提交中的canonical完全一致。现canonical相对它增加296行删除25行，涵盖输入校验、图标签测量、Quiz恢复及生命周期修复；未发现只存在此副本的新增功能。保留待后续可逆归档，不作为第二入口。

实际检查了产品route→mcp模块、合成CLI→合成库、诊断候选→共享产品生成资源的依赖方向：职责不同，不应合并为重复入口。portable/overlay、canonical/vendor及生成资源一致性检查已通过，无需为目录外观进行大规模移动或重构。

## 已批准操作完成（2026-10-21）

本节覆盖上方“待审批”时点。仅本仓库user.name/email已改为用户批准的JessToX和GitHub noreply，未改全局。6个未推提交已逐个重建并验证tree/message/时间不变，作者与提交者名字/邮箱统一；main现为bb3147493347aec47113100aafaa0affad13745b。旧新映射：4496cf1→0e83b8e、315b4bb→ab530b1、3970a03→58273ab、e894548→cbf3921、bec10a6→d868283、6428ab0→bb31474。

本地.local/privacy-recovery-20261021（目录700，备份文件600）保存原ref字节、对象pack、manifest、映射、原状态与私有文档原文。pack已在独立bare验证库中index-pack，并验证原main、合法stash和恢复stash三个对象闭包可遍历。合法stash未变，非法ref原文件已移入该目录；refs/recovery/stash-duplicate保全原对象。fetch恢复成功，origin/main仍668abc0，ahead6/behind0。没有push；禁止push --all/--mirror或推送recovery引用。工作区在重写前后字节/状态一致；此后才作本节记载的脱敏。

扩大扫描读取5293文本文件：类别命中文件数为旧login32、姓名线索77、本机用户路径85、私人会话链接15、部署标识4、认证/查询串需人工判读9。类别可重叠，含生成副本和测试，不等于独立真实泄漏数量。未命中此次令牌/私钥及私人邮箱格式。扫描跳过32个既定私人配置边界、2个超8MB文件；二进制包含312PNG、46JPG、21ZIP、10TAR、4GZ、14无扩展文件，未做像素或解包内容审查。这不是完全安全证明。

四份未跟踪诊断记录HOST-UI-DIAGNOSIS、VERTICAL-LOCAL-CANDIDATE、MINIMAL-CONTROL、R2-ACCEPTANCE已移除会话URL、本机绝对根路径或证据标识，原文保全本地。插件portable作者/开发者显示名改为JessToX并同步overlay；不涉及第三方版权。metadata check与diff check通过。

已推私有祖先仍含历史邮箱/旧身份；当前tracked历史验收/迁移证据与运行器固定部署绑定也仍有隐私风险，不扩大本轮历史重写。原始截图/包/日志和恢复备份保持本地，不复制到公开候选。6提交的代码树未改，因此其中固定部署标识仍在；私有push不是公开发布，也并非绝对安全。待父任务明确具体推送范围后方可推送main；本轮不推、不新增许可决定。

## 最终工程提交归属

旧form-sync.patch、resource-uri-site.patch及已匹配历史blob的component-kit 2.html保留原路径，按精确路径忽略；不删除、不自动套用、不作为源码遗漏处理。8份阶段Markdown经审查/最小脱敏纳入工程交接，README仅暂存工程导航链接。许可相关README其余修改及release-preparation五项继续留在工作区暂停。

固定绑定风险涉及scripts/tunnel-doctor-once.py的Tunnel ID和组织ID，以及docs/tunnel-preparation/DOCTOR-ONCE.md、RUN-APPROVAL.md的相同目标说明。它们是路由/组织标识，不是API key或Bearer认证秘密，但可关联私人资源。tunnel-run-once.py导入doctor_common并复用该目标，硬编码是已验收单目标限制的一部分。当前不改为任意环境覆盖；否则会改变已批准运行的目标约束。后续可设计仅本地不跟踪配置＋无值样例，要求精确校验单目标、无凭据字段并保留显式批准模式，完成mock回归后再协调真实验收。此次只提出方案，不更改现有运行行为或连接。

本地恢复引用/对象和.local目录不在main的文件树；后续只允许明确推送main，不推all/mirror/recovery。旧6提交树中标识仍存在，本次没有扩大历史重写。拟推内容的二进制与文本清单以本地review报告为准；截图/归档不在此次新增提交清单，当前工作区忽略不等同从旧远端历史移除。

</details>
