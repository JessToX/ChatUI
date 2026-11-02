# 待批准的生产迁移

下文保留 RC4 时点的待审提案，不是当前实施指令。历史证据及补丁仅在 monorepo 留存，不属于此源码包，也不作为当前 B1 证明；当前工程检查见 [B1](../final-edition/b1.md)。Phase 1 已在隔离候选分支修正 overlay 元数据，下文原始元数据不一致描述仍记录当时状态；没有因此批准或执行生产迁移。

本目录是可审阅补丁，不会自动应用。`production.patch` 精确变更两个生产 Skill、agent 默认提示、插件／旧 overlay 元数据、统一契约参考和生产 MCP 入口。运行前先 `git apply --check docs/rich-document-v1-production-migration/production.patch`。批准后才应用、运行完整验证、打包生产插件并部署到既有生产绑定；不能使用隔离站点或占位 hosting 配置替代生产绑定。

工具描述和 initialize 指令的精确前后值见 `discovery-before.json` / `discovery-after.json`；只有 documentRouting 开关改变描述和指令，旧输入／输出 schema 不变。新 render_document 与新 URI 已在本分支以 additive 方式实现。

回滚：生产批准后，先把 additive 文档代码加旧默认路由保存为独立 compatibility-baseline 版本，再保存／部署本补丁启用的新默认路由。回滚使用这个 baseline，并恢复原 Skill 包／工具目录；本补丁可 `git apply -R`。baseline 保留 document-v1 资源和工具，避免让新消息丢失资源。若直接恢复更早、尚无 document-v1 的原部署，不能保证新文档历史读取；不得把这种恢复称为无损回滚。不要删除旧 URI 或实验基础设施。

当前生产目录本来存在 0.9.1 portable 与 0.9.0 overlay 的版本／描述／interface 不一致，原验证器因此失败。本提案将两份元数据同步为 0.10.0；只在临时 review-only 包验证，生产目录保持原样。

生产目标已只读核对：ChatUI Renderer，Site PUBLIC_PROJECT_ID，当前版本序号9，https://example.invalid/chatui/mcp App 依赖与本仓 `.app.json` 一致。owner-private custom：1 用户、0 groups、0 external、0 automations。详见 deployment-target.json；未获取生产写凭证或执行保存／部署／权限修改。批准后复用该目标与原 metadata，不创建新生产 Site 或更改受众。 公开源码中的 Site ID 与 MCP URL 仅为非功能占位符；实际生产绑定只保留在私人运行环境。

注意 discovery-before 是本分支 additive 代码保持旧路由的 compatibility-baseline，不是宣称当前生产部署已经有 render_document。numeric chart 路由额外明确使用数据组件，避免模型改成图片生成。

## RC4 最终候选

发布结论 `READY WITH DOCUMENTED LIMITATIONS`，详见 [最终 hardening 报告](../rich-document-v1-release-candidate.md)。拟发布插件 **0.10.0** / Rich Document v1 **RC4**，Renderer API/package **1.5.0**；诊断版本 1.5.1-rc.4 仅用于隔离环境。

`full-production.patch` 包含基线 commit **302847a** 到最终候选的 renderer 源代码，以及本目录的 8 文件 routing/Skill 提案。它是供审阅的完整源码 diff；测试脚本与隔离 staging worker 不是生产入口。请仅在该基线或等价 checkout 应用，先 `git apply --check`。`production.patch` 仅含默认迁移层，可应用到已有 additive 实现的候选分支。两者都尚未应用到生产。

## 批准后的 rollback procedure

1. 备份当时真实生产 Skill/plugin 包、部署 version_id、App metadata 和工具目录；不要用当前 overlay 的版本号代替实际备份。
2. 先保存并验证 additive renderer + 旧默认 routing 的独立 compatibility-baseline，记录真实返回的 version_id。该版本必须保留 document-v1 工具、URI 和本轮安全 fallback。当前尚无这个生产 baseline，不能编造其 ID。
3. 再应用 routing/Skill 提案，发布 0.10.0 并部署到既有生产目标；生产入口不启用 staging diagnostics。
4. 发生回归时重新部署步骤 2 的确切 baseline，恢复步骤 1 的 Skill/plugin 包和工具目录，刷新工具发现并用旧工具、新 document 历史做 smoke check。源代码只反向撤销 `production.patch` 的迁移层；不要反向撤销 `full-production.patch` 删除新资源。
5. 生产当前序号 9 的旧版本可能不支持 document-v1，不能把直接退回该版本称为新历史无损回滚。整个 procedure 未在生产执行。

已知限制：Quiz 刷新/重开安全重置未作答；有界坏 TeX 保留为可读原文；数学 authoring 和内部 host 计时不保证可观测/正确。原 v1 限额与组件范围保持。完整报告列出实测边界与比较条件。
