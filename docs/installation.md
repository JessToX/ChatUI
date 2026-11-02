# ChatUI 0.9.0／Renderer 1.5.0：运行、更新、回滚

## 当前边界

源码和包不等于线上更新。查看 [acceptance-v0.9.0.md](acceptance-v0.9.0.md) 的实际记录。未完成原 Site 发布、原私人插件更新、连接刷新与新聊天验收前，不宣称完整 V2 已上线。

## 本地运行

1. Node.js 24；根目录及 `renderer/` 分别 `npm ci --ignore-scripts`。
2. 根目录执行 `npm run test:components`；Renderer 执行 `npm test`、`npx tsc --noEmit --incremental false`、`npm run lint`、`npm run build`。
3. 首次纯本地构建若缺少绑定，可复制 `renderer/hosting.example.json` 到 `.openai/hosting.json`。占位绑定绝不能发布，也不能覆盖已有真实绑定。
4. 静态预览：根目录执行 `python3 -m http.server 8765 --bind 127.0.0.1 --directory renderer/public`，打开 `http://127.0.0.1:8765/preview.html`。构建后服务可在 Renderer 目录 `npm start`。预览不会调用模型或发送消息到 ChatGPT。
5. 源码改动后通过 `generate:widget`／`generate:preview` 生成资源，不手改生成文件；`npm run build` 已包含这两步。

## 沿用原身份更新

1. **先成套备份。** 保留旧插件包、匹配 Renderer 源码／真实部署版本、原 App 与 Site 身份和当前访问范围。设备本地基线备份在 `.local/backups/pre-html-v2-2026-10-07/`；私人部署信息不放入发行包。
2. **更新原 Renderer Site。** 使用原 Site 的受支持发布通道及真实绑定；保留所有权和访问范围。不创建新 Site，不发布占位项目 ID，不自行改为公开访问。通道不可用则停止线上操作，明确记录为未完成。
3. **更新原私人插件。** 上传 `dist/chatui-0.9.0.zip` 到现有插件的更新通道，保持原插件 ID 和 `.app.json` App 连接。发布前读回当前 release，处理并发冲突；发布后读回 Skill、manifest、App 绑定和版本。不要创建同名替代插件。
4. **刷新工具目录。** 直接自定义 MCP 连接使用官方 Refresh；已发布插件按其版本更新流程更新。确认工具列表新增 `render_html`、保留 `render_response` 及旧工具，两个主入口使用 `ui://chatui/response-v2.html`。
5. **新聊天验收。** 显式 `render_html` 后，在独立新聊天测试普通隐式回答，以及“继续／为什么／改成表格／补充代码／考考我”和纯文本例外。逐项记录实际工具选择、结果、真实 DOM、错误、重复正文和计时，不能用 Connected 状态或本地通过代替。
6. `global-preference.txt` 仅作可选参考。若需更新，精确替换原 ChatUI 段落并保留其他指令；本次未自动修改账户偏好。

普通回答走 `render_html`；复杂交互及复杂公式整轮走 `render_response`；简单确认或明确纯文本／Markdown 保持原生。Skill 能指导选择，不能保证自动调用率。

## 成套回滚

- 如果新服务／资源或真实宿主验收失败，先撤销新默认规则或恢复旧 Skill，再将原 Site 恢复到匹配的 Renderer 1.4.0 部署，恢复原插件 0.8.0；保证规则不会要求不存在的 `render_html`。
- 全过程保持同一插件／App／Site 身份和原访问范围。回滚后刷新目录，在新聊天检查旧 `render_response` 可用以及旧组件行为。
- 本地源码恢复用备份 `source.tgz` 在独立目录检查，不盲目覆盖用户后续修改。线上回滚优先使用原 Site 的已验证历史部署，而不是占位配置重新发布。
- 若曾编辑全局偏好，只还原本次精确 ChatUI 段落，不覆盖用户之后的其他修改。卸载也仅影响 ChatUI，不删除用户聊天或其他插件。

## 包与隐私

插件 ZIP 只含 manifest、原 App 连接、Skill、可信组件资产、去个人化示例与脚本；Renderer 包只含源码、锁文件、vendor kit 和预构建资源。均不包含凭据、`.openai` 私人部署绑定、环境文件、依赖目录、构建缓存、聊天记录或用户截图。无需额外模型 API 密钥。

官方流程：[工具与结果](https://developers.openai.com/plugins/reference)、[MCP App UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[连接与刷新](https://developers.openai.com/plugins/deploy/connect-chatgpt)。
