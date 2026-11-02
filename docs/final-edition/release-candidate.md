# ChatUI Offline Final Edition — Release Notes / Candidate

> **历史阶段记录，非当前安装/发布指南。** 下文版本、许可待定、CI/宿主状态及审批范围仅反映当时，不能作为当前结论。当前原创许可已为 MIT / Jess(T o X)，当前版本与范围见[发行说明草稿](../release-preparation/RELEASE-NOTES.md)。保留原阶段事实，不继承旧测试为新候选通过。

**DRAFT — NOT PUBLISHED**。Portable Plugin / Codex overlay **1.0.0**；Renderer / package-lock / MCP serverInfo **1.6.0**。源码包含 `83db0b5b` 的 Quiz 公开输出隔离和 `6639b8a3` 的每次交付身份绑定。最终 SHA 在 Source 的 `RC-SOURCE-MANIFEST.json` 和 Review 的 `RELEASE-NOTES.md`/`acceptance.json` 中绑定；本源码文档不嵌入包含自身的最终 commit 或 ZIP hash。

## 本地交付

| 候选制品 | 内容 |
|---|---|
| `ChatUI-Offline-Final-Source-Candidate.zip` | root/Renderer 锁文件、组件、生成器、测试、打包入口、公开文档和第三方 notices |
| `ChatUI-Offline-Final-Gallery-Candidate.zip` | 七个静态文件、G01–G08、完整 fallback、manifest/checksum/notices |
| `ChatUI-Offline-Final-Review.zip` | 最终 SHA 验收、命令/日志摘要、失败复测、代表截图、两个独立构建与 ZIP hash、已知限制 |

同名已存在时加后缀，绝不覆盖。旧 `e8a6a07d` Phase 3 ZIP 不含后续安全修复，不是 Final 资产。每包真实名称/字节/hash 由 Review 发行记录及外部交付 JSON 给出。Review 自身 hash 保存在外部交付记录，避免循环引用。

## 功能与修复

G01–G08 覆盖数学最优化、微积分、物理、哲学论证、长文、原生短答、TeX 降级和错误/Quiz 边界。复制含关闭章节和非当前 tabs 的完整安全正文。极端几何下溢输入拒绝；S01/A00 排除公开评分秘密与属性名/编码副本，`deliveryId` 绑定公开结果与可信组件评分 metadata。输入 schema、六工具、八 URI、`documentVersion: 1`、默认 `render_html` 和 additive Document 保持。

## 重建与支持范围

安装/构建步骤见 源码包 root 的 `README.md` 与 [Renderer README](../../renderer/README.md)。运行 Gallery：完整解包直接打开 `index.html`，或 `python3 -m http.server 4173 --bind 127.0.0.1 --directory .`。无模型/网络/CDN/私人绑定依赖。未安装依赖的 Source 可在全新目录按锁文件安装；已有账户配置不参与重建。

最终验收使用以下入口，先完成本地源码提交，再运行；源码 ZIP 没有 Git 身份，不能直接调用要求原提交身份的发行门槛：

```sh
python3 scripts/qa/package-phase3.py --offline-final --phase final --output-dir .local/offline-final/packages
python3 scripts/qa/verify-phase3-engineering.py --offline-final --phase final --source-zip .local/offline-final/packages/ChatUI-Offline-Final-Source-Candidate.zip --gallery-zip .local/offline-final/packages/ChatUI-Offline-Final-Gallery-Candidate.zip
python3 scripts/qa/run-phase3-browser.py --offline-final --expected-head "$(git rev-parse HEAD)" --gallery-zip .local/offline-final/packages/ChatUI-Offline-Final-Gallery-Candidate.zip
```

两个全新构建目录独立 locked install/generate/build，并从各自生成字节重包比较 Source/Gallery SHA256。正式 Gallery ZIP 新解包，Chrome file/HTTP 两模式至少 128 布局、32 交互/安全专项、54 自动无障碍检查。核心安全、数学、正文、兼容和构建未解释失败会阻断；旧日志不作本轮通过证明。

Safari/Firefox/人工 VoiceOver、真实 ChatGPT 宿主和生产默认路由迁移未验证。完整旧 envelope 重放为 LIMITATION，不能声称抗重放通过；客户端评分可由浏览器用户检查。见 [安全与限制](security-and-limitations.md)。本地测试的时序测量不是 FCP 或生产性能保证。

## 许可、回滚和停止点

项目授权未指定开放许可，待用户决定；没有新增项目 LICENSE。第三方运行时代码与安装/编译依赖分列于 源码包 root 的 `THIRD_PARTY_NOTICES.md` 和 [依赖清单](third-party-dependencies.json)。Git 历史及远端旧附件的公开准备风险随 Review 明示。

本轮仅本地候选，可在保留后续用户变更后用 `git revert <local-candidate-commit>` 回滚，不 reset 或删除私人资料。F1–F2 完成后停止等待 F3 独立审核；[后续发行与 Archive Notice](release-and-archive-checklist.md) 不构成远端操作授权。
