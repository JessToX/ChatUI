# 真实 ChatGPT 合成宿主验证方案 — 未执行

本文件仅是后续方案。当前候选的离线结论见 [Phase 3](phase3.md)。真实连接/Skill/MCP/默认路由修改需用户另行授权；本轮不访问私人聊天或账户配置，不部署。

授权后先记录测试账户/合成环境、批准的候选 SHA、三包 hash、原连接版本与旧资源 hash，隔离合成数据；保留既有生产路由和部署配置。确认回滚入口可用后，才更新专用合成连接。每项必须记录实际宿主版本、输入、工具结果/完整 native fallback、资源 URI/hash、交互与刷新身份。

| 合成路径 | 验证方法与通过条件 |
|---|---|
| 原生 / HTML / structured / additive Document | 短答/确认/明确 Markdown 留原生；HTML 普通内容；旧 structured 专业交互；显式 Document G01–G08；不以离线 Gallery 冒充宿主 |
| 当前默认路由 | 初始化/MCP 描述/Skill 三处一致，`render_html` 继续默认；若后续单独批准 Rich Document 默认迁移，才应用 review 草案 |
| 数学与正文 | 用冻结 independent golden 核验数值/单位，全文首尾、关闭折叠/所有 tabs 复制完整，坏 TeX 有界保留，危险输入严格拒绝 |
| Quiz | 提交前 UI/模型上下文/复制无评分键；提交/重试/重置；刷新/新场景安全重置；不得宣称可抵抗本地源码检查 |
| 刷新与生命周期 | 实际资源缓存/旧 URI、新 iframe 身份、迟到回调/复制授权，恢复不串内容；未验证持久恢复时声明 safe reset |
| 旧接口 | 八个可读 URI、四个 discovery、旧 tools/schema/fallback 与过去样例；documentVersion 1不变 |
| 故障 | 工具不可用、参数错误一次修正后仍失败、编译拒绝、客户端拒绝分别取得完整原生正文，不重复虚构成功 |
| 宿主 UI 协作 | 深浅主题、窄宽/缩放、焦点与键盘、真实剪贴板成功/拒绝、滚动所有权及可访问文本；人工读屏另记 |

以后默认迁移是独立批准动作：先审查仓库既有 migration 草案，只修改明确授权的 Skill、tool description 和初始化指令，不改 schema、URI、bridge 或内容预算。灰度专用合成环境成功后再申请生产授权。任一硬失败撤回候选并恢复原路由/旧连接版本及资源 hash，验证旧路径重新可用；不能以 fallback 隐藏安全/数学/正文失败。

结果只可能为实测范围内 PASS、FAIL 或 UNKNOWN。宿主通过不自动授权 push、部署到别处、公开发布或归档；各动作见 [独立授权清单](release-and-archive-checklist.md)。
