# ChatUI — 未发布源码候选

ChatUI 由 **Jess(T o X)** 制作，是独立、非官方项目，与 OpenAI 不存在隶属、赞助或背书关系。相关商标属于各自权利人。

本包是经过清理的**本地候选源码**，尚未发布。拟发布标签、插件元数据 **1.0.0** 与 Renderer 内部版本 **1.6.1-iteration.1** 是不同身份；见[版本与发行说明草稿](docs/release-preparation/RELEASE-NOTES.md)。原开发仓库的 Git 历史、账户配置、凭据和私人验收证据不在发行附件中。

ChatUI 将讲解、公式、图形和局部交互组合在一起。保留六个工具：`render_html`、`render_response`、`render_document`、`render_component`、`render_explanation`、`render_incline_forces`。工具成功返回不等于实际界面或全产品验收通过。

## 无需密钥的本地预览

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory renderer/public
```

打开 `http://127.0.0.1:4173/generative-view.html` 或 `http://127.0.0.1:4173/gallery/index.html`。这些是固定公开合成样例，不是真实 ChatGPT 对话，也不证明模型能力。结束时按 Ctrl-C。

## 安装与验证

完整步骤见[安装与运行](docs/installation.md)：离线 Gallery 不需 npm 或密钥；源码验证使用 Node.js 24.20.0 / npm 12.0.2。已验环境为 macOS/Python 3.9.6 与 Ubuntu 24.04/Python 3.12；其他组合不由此保证兼容。Linux 完整绘图测试需先按指南安装中文字体。在独立虚拟环境安装固定依赖，再从全新解包目录或克隆目录运行：

```sh
python3 -m venv /tmp/chatui-preview-venv
. /tmp/chatui-preview-venv/bin/activate
python3 -m pip install -r requirements-phase3.txt
python3 scripts/reproduce-package.py
```

脚本执行根目录与 Renderer 的 locked `npm ci`、组件和 Python/Renderer 回归、类型、lint、build、生成一致性及许可证检查。缺少依赖、跳过测试、源文件与清单不符都会失败。生成的 hosting 配置仅是不可部署的公开占位；不要复制私人账户配置或提供密钥。

文档整理前的精确基线 `a90c8d3f03a567db99186b25d144b017564158cc` 已通过 main push 云 CI，组件92、Python159、Renderer472，零跳过。当前工作流支持 main push、向 main 的 pull_request，以及临时验收分支 push；实际 PR 事件仍未验。新提交必须有自己的验证记录，不能继承基线 CI 结论。完整开发树的旧测试计数也不等于本发行范围。

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

源码与 Gallery ZIP 不是安装程序，也不提供可直接使用的 ChatGPT 服务或账户连接。接入须使用用户自己的服务、账户与权限，见[接入边界](docs/installation.md#连接-chatgpt)。附件生成与校验见[发行材料](docs/release-preparation/DISTRIBUTION.md)。实际公开仍须最终确认。
