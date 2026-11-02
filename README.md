# ChatUI — 未发布源码候选

ChatUI 由 **Jess(T o X)** 制作，是独立、非官方项目，与 OpenAI 不存在隶属、赞助或背书关系。相关商标属于各自权利人。

本包是经过清理的**本地候选源码**，尚未发布。整体功能验收、真实宿主目标与精确制品 CI 完成后，仍需最终发布核对；候选或预览标签不能替代完成门禁。Plugin / Codex overlay **1.0.0**，Renderer / lockfile / MCP serverInfo **1.6.1-iteration.1**。没有迁入原开发仓库的 Git 历史、账户配置、凭据或私人验收证据。

ChatUI 将讲解、公式、图形和局部交互组合在一起。保留六个工具：`render_html`、`render_response`、`render_document`、`render_component`、`render_explanation`、`render_incline_forces`。工具成功返回不等于实际界面或全产品验收通过。

## 无需密钥的本地预览

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory renderer/public
```

打开 `http://127.0.0.1:4173/generative-view.html` 或 `http://127.0.0.1:4173/gallery/index.html`。这些是固定公开合成样例，不是真实 ChatGPT 对话，也不证明模型能力。结束时按 Ctrl-C。

## 安装与验证

使用 Node.js 24.20.0 / npm 12.0.2 与 Python 3.9 或更高版本。在独立虚拟环境安装固定 Python 依赖，然后从全新解包目录或克隆目录运行：

```sh
python3 -m venv /tmp/chatui-preview-venv
. /tmp/chatui-preview-venv/bin/activate
python3 -m pip install -r requirements-phase3.txt
python3 scripts/reproduce-package.py
```

脚本执行根目录与 Renderer 的 locked `npm ci`、组件和 Python/Renderer 回归、类型、lint、build、生成一致性及许可证检查。缺少依赖、跳过测试、源文件与清单不符都会失败。生成的 hosting 配置仅是不可部署的公开占位；不要复制私人账户配置或提供密钥。

已验证产品基线的选择性包通过组件92、Python159、Renderer472；本次清理文档后的候选必须重新完整验证，以实际结果为准。完整开发树的另一次云 CI 覆盖范围不同，不能当成本公开包的同一验证。候选包含仅针对指定私有验证分支的云工作流；必须以该精确提交的实际运行结果为准，不能继承旧源码 CI 结论。

工程说明见 [Renderer](renderer/README.md)、[验证说明](docs/release-preparation/VALIDATION.md)。[包清单](PACKAGE-MANIFEST.json)记录来源与清理差异；来源提交号是追溯信息，不表示公开包与其全部字节相同。

## 支持范围与已知限制

- 首版支持普通 Chrome 网页版 ChatGPT；实际宿主验收在 macOS Chrome 完成。原生 ChatGPT macOS、其他浏览器和系统组合尚未验收，不作为首版支持承诺。
- 同一 v5 产品的六工具均有固定合成场景实际卡片证据；表单提交后一次不含答案的提问正确读到提交值。这不等于所有输入、平台或跨实例恢复全面通过。
- 文档和图形自动复制在已测宿主中未完成；正确显示手动复制文本，不伪报成功。首版保留此回退。
- 首次加载曾需用户刷新，原因未确定；按用户决定不调查、不阻塞，不能声称首载通过。
- 表单原生下拉框方向键仍待人工验证；图形顶点方向键步进已有真实网页证据。
- 恢复策略见[恢复契约](docs/release-preparation/FORCE-RESTORE-CONTRACT.md)。最多32个已识别来源拒绝已识别旧版本；未知来源、旧格式不构成可信全序，自然跨实例迟到事件未获宿主证据。
- Quiz 客户端评分可检查，不适用于保密考试。见[安全与限制](docs/final-edition/security-and-limitations.md)。

## 许可与发布范围

原创贡献按 [MIT License](LICENSE) 授权，署名 **Jess(T o X)**。第三方代码和素材保留各自许可证与版权，详见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) 和 [NOTICE](NOTICE.txt)。两枚来源未确认的原主图标已排除，替换为本项目简单几何占位图；不宣称原图标已清权。

本候选不包含旧开发历史、内部验收记录或部署承诺。实际公开仍须另行批准。
