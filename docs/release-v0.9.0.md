# ChatUI V2 源码交付：插件 0.9.0 / Renderer 1.5.0

日期：2026年10月7日。

## 本版改动

- 普通回答新增 `render_html`：语义 HTML → 服务端净化 → 客户端再次净化 → 消息内真实 DOM。
- 复杂交互继续 `render_response`，保留旧输入、16 类组件及状态行为，补充归一化输出 schema。
- 原生折叠、标题、列表、引用、代码、表格与上下标；透明阅读界面、深浅主题和局部横向滚动。
- 完整可读文字兜底；重复结果与主题变化不重建 HTML；两种模式切换清理旧挂载与回调。
- `ui://chatui/response-v2.html` 避免沿用旧资源缓存；旧 URI 可读，旧工具继续兼容。
- Skill、MCP 指令与示例同步双路径；中文速度矢量材料原样加入。
- 不执行模型 JavaScript/CSS，不扩大 CSP，不新增模型调用、远程图片或跨会话状态平台。

## GitHub 交付

沿用现有私人仓库 `JessToX/ChatUI`，源码提交至原 `main` 分支。发布页为 [v0.9.0](https://github.com/JessToX/ChatUI/releases/tag/v0.9.0)，标记为预发布，以区别于完成真实宿主验收的版本。

发布附件：

| 文件 | 用途 |
|---|---|
| `chatui-0.9.0.zip` | 保留原身份的插件与 Skill 包 |
| `chatui-renderer-1.5.0-source.zip` | 单独可构建的 Renderer 源码，含 vendor kit、锁文件和预构建资源 |
| `chatui-0.9.0-release.json` | 版本、文件字节数、SHA256 与已完成／未完成状态 |

ZIP 不进入源码目录，通过 GitHub Release 附件交付。`scripts/package.py` 和 `scripts/package-renderer.py` 使用固定时间戳与排序条目生成包。原 0.8.0 及历史发布不覆盖、不删除。

源码包解压后进入 `renderer/` 构建。其 `docs/` 内附带本次状态、发布和更新说明。发布包排除凭据、私人部署绑定、依赖目录、构建缓存、聊天记录、用户截图和本机回滚备份。

## 用户要求后的处理

用户明确要求“不用测试，做好以后直接交付在 GitHub”，因此停止继续浏览器验收与 ChatGPT 连续对话测试。此前已发生的检查在 [状态记录](acceptance-v0.9.0.md) 中如实保留；不称最后整理后的全部文件已复测，不虚构自动调用率、性能或线上运行结果。

## 运行、更新与回滚

详见 [installation.md](installation.md)。需要分别更新**原 Renderer Site**与**原私人插件／Skill**，再让原连接重新发现工具；GitHub 上传不是这两项账户操作。

本机升级前成套备份仅本地保留于 `.local/backups/pre-html-v2-2026-10-07/`，不进入 GitHub。回滚时将匹配的 Renderer 1.4.0 与插件 0.8.0 一起恢复，避免新 Skill 调用旧服务不存在的 `render_html`。

**交付状态：V2 源码和安装包；原连接上线验收未完成。** 没有创建新插件、新 Site、平行连接，也未覆盖账户其他自定义指令。
