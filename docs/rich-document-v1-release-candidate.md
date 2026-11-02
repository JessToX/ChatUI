# Rich Document v1 Release Candidate Hardening

下文保留 RC4 时点的历史报告。历史证据仅在 monorepo 留存，不属于此源码包，也不作为当前 B1 证明；当前工程检查见 [B1](final-edition/b1.md)。

**结论：READY WITH DOCUMENTED LIMITATIONS。** 候选版本 Rich Document v1 RC4；拟发布插件 0.10.0，documentVersion 1，Renderer API/package 仍为 1.5.0。隔离诊断版本 1.5.1-rc.4 不是生产 package 版本。生产默认 Skill、routing、部署与受众均未修改。此结论仅覆盖本轮三项 hardening，不授权部署。

## TeX 首次失败定位与修复

前轮首错 `TeX 公式无效或超出安全限制` 对应旧代码 server compile 内 KaTeX catch，发生在 client mount 之前。原测试聊天已按授权删除，原始参数无法逐字回放，因此不能宣称已找到当时的具体坏命令。本轮用未闭合 `\frac{x}{` 和未知命令复现同类异常，并保留 cause/stage 诊断。

本轮还真实复现了另一条链路：模型给 TeX 额外 Markdown 转义（例如 `\\,`），KaTeX 生成带 `linebreak="newline"` 的 mspace，随后 MathML 白名单拒绝。此错误属于 MathML validation，不能与前轮 KaTeX catch 混为同一原因。没有证据表明原首错来自资源缓存、client mount 或 host lifecycle。诊断初期 metadata 缺失是本轮 bridge 未赋值的仪器缺陷，已修复；不是 host 丢弃 metadata 的证据。

文档路径现在对有界、非禁止命令的单个坏公式降级为安全 MathML mtext，显示“公式排版失败，保留 TeX：”及原 TeX；前后正文、其他公式、组件继续显示。custom mathLabel 不会覆盖完整可读 fallback 中的 TeX。client view 被拒绝时，完整文本 fallback 同样保留公式与正文，并不泄露 Quiz 答案。旧 render_response 严格错误行为保持；禁止命令、超限输入和总预算仍拒绝。

5 个独立 Node 进程、330 次编译、0 次丢失正文/不符预期 fallback：每进程首个 calculus 是编译器 cold，其他首轮 fixture 是 calculus 之后的首次使用，随后各 10 轮 warm。真实 host RC4 坏 TeX 4/4 保留全文、4 个 math 节点、2 个文字 fallback 与结尾标记；其中 compileNumber=1 的新实例及同一已有实例 compileNumber=2 均实测。正常 RC4 五场景 5/5 sourceHash 匹配、无公式 fallback。早期额外转义造成两次降级及一次有效但语义改变的源输入，已列入原始测量；不能据 UI 挂载成功宣称公式 authoring 100% 正确。

## Quiz 刷新边界

判分正确、2/2 得分、重新作答清空均通过。已判分刷新、部分作答刷新、离开后重开、新 Surface 使用同题，以及最终 RC4 判分后刷新，均安全回到未作答：无勾选、无分数、无解析，未污染新题。基线 render_response 的错误选择实际得到 0/2。

本地 identity/private envelope 验证与恢复测试通过；真实 host 有 legacy state API，刷新后也报告存在 state，但没有可靠回放可恢复的私有 Quiz envelope，restoreEvents=0。定位边界在 host→widget 的状态交付/回放，内部 shape 与时序无法进一步区分，不能据此声称 ChatGPT 全局禁止持久恢复。**v1 已知限制：刷新或重开会丢失作答进度，安全回到未作答。** 没有新增 localStorage、数据库或复杂持久化层。

## 真实 chatgpt.com 实测

最终 RC4：Calculus（多 TeX + callout）、Physics（推导 + comparison）、Project（profile/progress/timeline）、Quiz、长篇文档均成功，**5/5（100%，样本量 5）**。长篇 source 8,964 UTF16 / 24,242 UTF8，16 段、16 callout、32 公式，结尾标记和完整就绪状态均确认。故障注入另计 4/4。全阶段 33 次工具调用均有可见 Surface，但包括早期 authoring 降级，不能合并成“33/33 无错误”。

下表单位秒，T0 为接受 Send；首次可见使用资源内 two-rAF paint proxy，精确肉眼首帧并不可测。input 是 widget 收到完整 tool-input 通知的时刻，**不是模型内部完成参数生成时刻**。document 完成是 renderer ready；host 整轮结束另列轮询区间。

| RC4 场景 | input 完整交付 | tool-result 交付 | 首帧 proxy | document 完成 | renderer 耗时 | host 整轮完成区间 |
|---|---:|---:|---:|---:|---:|---:|
| Calculus | 7.753 | 7.755 | 7.774 | 7.760 | 0.0049 | 9.002–11.111 |
| Physics | 12.440 | 12.441 | 12.462 | 12.446 | 0.0049 | 15.456–17.571 |
| Project | 11.020 | 11.021 | 11.051 | 11.036 | 0.0158 | 15.291–17.400 |
| Quiz | 20.702 | 20.702 | 20.721 | 20.705 | 0.0025 | 23.785–46.013 |
| Long | 15.708 | 15.708 | 15.734 | 15.840 | 0.1318 | 15.717–17.841 |

内容匹配比较：同一 fixture 的正文/数据分别交给 document、render_response、render_html；15/15 挂载成功。HTML 是同信息静态近似，不具有等价 MathML、Quiz 判分或组件交互。下表为首帧 proxy 秒；document 使用 RC3 的首次正常匹配输入，基线仍为同隔离 candidate 引擎中的原工具。最终 RC4 再次全场景确认。不能混用 RC4 重复运行来宣称速度优势。

| 场景 | document | render_response | render_html |
|---|---:|---:|---:|
| Calculus | 9.336 | 21.685 | 10.581 |
| Physics | 25.467 | 15.054 | 11.298 |
| Project | 8.482 | 12.238 | 7.514 |
| Quiz | 15.284 | 11.955 | 7.169 |
| Long | 81.136 | 85.928 | 85.047 |

完整 input/result/renderer/可见与整轮区间见 `rich-document-v1-rc-host.json`。physics-html 和 quiz-html 的旧观察器记录无效，使用 retest；calculus-warm-1 的 host 首帧观察器捕获旧 run，不能使用该值。模型 Extra High、上下文/缓存/重复运行与 polling 间隔均影响时间；本测试不是随机性能实验，无普遍提速承诺。远端 normalizationMs 全为 0：Workers 时钟在同步 CPU 工作中冻结，不能解释为零编译成本；本地 compiler 时间另记。[Cloudflare Performance and timers](https://developers.cloudflare.com/workers/runtime-apis/performance/)。服务端和浏览器时钟未经校准，不将两者相减推算精确网络时间。

## 验证、证据与发布边界

Renderer 160 tests、组件 74 tests、40 个浏览器布局检查（无溢出、透明背景、就绪）、330 次 cold/warm 编译全部通过。TypeScript、build、lint 通过；lint 仅两项已有 persistent-gate warning。review-only 0.10.0 插件包验证：56 files、2 implicit skills、1 App。

最后隔离部署 source `3e43b2e6b62ec8215ae830c27fff64938b404c68`，deployment `PUBLIC_DEPLOYMENT_ID`，version `PUBLIC_PROJECT_ID~PUBLIC_VERSION_ID`。早期 staging 打包在全局 crypto.randomUUID 上失败，已移到 fetch 生命周期并成功重新部署。以上均是既有 owner-private 隔离站点，不是生产部署。公开源码仅保留非功能部署占位符，具体私人 project/deployment/version 标识不进入发行包。

必要工程证据已保存；本阶段精确清单中的 4 个测试聊天全部删除，逐一重开回首页、清单链接消失。历史 DIL 与普通个人聊天未操作。原 DOM/截图/删除清单保留本地 `output/playwright/rich-document/rc/`；版本化测量已去掉聊天 URL/ID。

完整生产补丁与 rollback 见 `rich-document-v1-production-migration/README.md`。**当前仍保持旧生产默认。** 限制包括数学 authoring 可能错误、坏公式显示 TeX fallback、Quiz 不保证跨刷新恢复、性能观察边界及 v1 原有预算/组件范围。现有证据支持有这些明确限制的生产候选，不能支持无条件 READY FOR PRODUCTION。
