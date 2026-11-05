# ChatUI — 源码与离线 Gallery 发行候选

ChatUI 由 **Jess(T o X)** 制作，是独立、非官方项目，与 OpenAI 不存在隶属、赞助或背书关系。相关商标属于各自权利人。

本候选用于源码与离线演示的发行整理，**尚未发布或归档**。它提供讲解、公式、图形和局部交互的实现，不包含可直接使用的 ChatGPT 托管服务、账户连接或一键安装流程。拟发布标签、插件元数据 `1.0.0` 与 Renderer 内部版本 `1.6.1-iteration.1` 是不同身份，见[发行说明](docs/release-preparation/RELEASE-NOTES.md)。

## 六个工具

| 工具 | 实现范围 |
| --- | --- |
| `render_html` | 安全语义 HTML 片段的兼容入口，经过服务端和浏览器净化 |
| `render_response` | 组合局部图形、结构化视图和交互，辅助完整的原生讲解 |
| `render_document` | ChatUI Rich Markdown 文档、公式及受限指令 |
| `render_component` | 单个已定义交互组件的兼容入口 |
| `render_explanation` | 已有组合讲解和图解的兼容入口 |
| `render_incline_forces` | 受输入契约限制的光滑斜面受力计算与显示 |

工具成功返回不等于真实界面、模型上下文或整个产品验收通过。

## 无需密钥的离线预览

从源码根目录执行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory renderer/public
```

打开 `http://127.0.0.1:4173/gallery/index.html`，或查看固定生成式视图样例 `http://127.0.0.1:4173/generative-view.html`。结束时按 Ctrl-C。独立 Gallery ZIP 解压后可直接打开 `ChatUI-Gallery/gallery/index.html`；可选 HTTP 方式见[安装与运行](docs/installation.md)。这些是公开合成样例，不连接模型或 ChatGPT，不需 npm 或 API 密钥。

## 源码验证与已完成 CI

使用 Node.js **24.20.0** / npm **12.0.2**，完整验证建议 Python **3.12**。Pillow **13.0.0** 要求 Python **3.11 或更新版本**；Linux 绘图验证还需指南中的官方 Noto CJK 字体。按[安装说明](docs/installation.md)在源码外建立虚拟环境、安装固定依赖，然后运行 `python3 scripts/reproduce-package.py`。此脚本会执行 locked install、测试、types、lint、build、生成、许可和源文件保真检查；安装可能需要联网。公开 hosting 配置只是本地构建占位，不可直接部署。

文档收尾基线为 `529460291eaa813e37146be3e082c81285c9944e`。[该提交的真实 PR CI](https://github.com/JessToX/ChatUI/actions/runs/41831613236) 已在 Ubuntu 24.04 通过：组件 **92**、Python **165**、Renderer **476**，零失败/跳过，并通过构建、生成、许可和保真检查。本次只修改发行文档及其清单，不声称后续文档候选已经获得新的 CI 结果。PR 尚未合并，GitHub 链接在仓库私有时需要访问权限。版本与证据绑定规则见[验证说明](docs/release-preparation/VALIDATION.md)。

`PACKAGE-MANIFEST.json` 记录输入文件摘要和来源；其中 `sourceCommit: null` 不否定基线已有提交或 CI。发行时由配套 `release.json` 绑定最终干净提交、树和附件哈希，避免清单自引用。文档收尾提交及其附件的精确身份以实际 Git HEAD 和同批 `release.json` 为准；不沿用基线 ZIP 的身份。

## 已验证边界与已知限制

- 较早相同 v5 产品的六工具有 macOS Chrome 网页合成卡片记录，并有一次表单提交后模型正确读到提交值的记录。这些只是限定历史场景；安全修复改变了 Response/HTML 资源，其真实宿主验收不能直接继承。
- 原生 select 下拉框的完整键盘往返未通过验收；后台自动化曾超时，事件送达原因未确定。图形顶点键盘步进有历史网页证据，不能替代 select 结果。
- 首次加载曾需要用户刷新，根因未证实；自动复制受限时提供手动复制文本。其他浏览器、原生桌面宿主及全面辅助功能尚未验收。
- 表单草稿可交给宿主 `privateContent` 恢复，显式提交可进入模型上下文；“宿主私有”不表示仅存本机或已核实保留策略。自然跨实例迟到/恢复顺序和全面上下文采纳未验证，见[恢复契约](docs/release-preparation/FORCE-RESTORE-CONTRACT.md)。Quiz 客户端评分不适用于保密考试。
- 独立 owner-only 候选测试站点的官方 `/mcp` 入口，在不带身份和只带合成伪造身份头的两次匿名只读请求中均返回 HTTP 401 及认证挑战。已登录请求的身份头覆盖、原始重复头处理和直达源站隔离仍未证实；这两次拒绝不能外推这些条件，也不能外推旧站点。不能公开一个信任任意客户端身份头的裸服务。
- 依赖扫描仍保留 esbuild 与 minimatch 的公告和触发条件限制；扫描未检出不证明绝对安全。旧部署与原仓库服务器隐藏对象的范围仍有未知，见[发行说明](docs/release-preparation/RELEASE-NOTES.md)。

## 当前发布门槛

所有者已要求在公开及归档前理清真实宿主交互与线上身份保护，因此这些项目目前仍是未完成门槛，不能仅通过披露限制或 CI 通过放行。宿主需绑定本次改变的资源，取得实际加载、键盘选择与状态/上下文行为证据；旧资源和本地页面不能替代。身份保护已确认上述匿名入口拒绝，但剩余条件无法通过现有官方工具的参数验证；需取得实际路由保证，或明确退役托管服务的方案及结果。保持 owner-only 是范围控制，不等于这些条件已经通过。详见[发行说明](docs/release-preparation/RELEASE-NOTES.md)。

## 许可、附件与维护状态

原创贡献采用 [MIT License](LICENSE)，署名 **Jess(T o X)**。第三方代码和素材保留各自许可证与版权，见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) 和 [NOTICE](NOTICE.txt)。两枚来源未确认的原图标已排除，使用项目自有的简单几何占位图；不宣称原图标已清权。

Source ZIP 包含源码、锁文件、测试和公开说明；Gallery ZIP 是离线演示。原开发 Git 历史、私人配置、旧构建和原始审计/宿主日志不属于附件。校验方法见[发行材料](docs/release-preparation/DISTRIBUTION.md)。已选择最终公开并归档现有仓库；执行前必须完成上述宿主与身份保护门槛。排除 Git 历史的 ZIP 不代表原仓库历史已清除。

拟在发行完成后归档，但当前未归档。归档说明应明确停止常规维护的范围；归档不停止已有托管服务、不撤回外部副本，也不保证被冻结依赖未来安全。需要维护时由仓库所有者解除归档再处理。

### OG 安全回补

依赖修复基线固定 `@vercel/og 1.0.1` 并应用官方 Next.js **16.4.1** 安全补丁，独立 Satori 固定 **0.33.5**。来源、许可及输入/输出 SHA256 位于 `renderer/vendor/og-security`；普通 install/dev/build/start/test hooks 会核验补丁。若使用 `--ignore-scripts` 安装后直接调用框架文件，先运行 `npm --prefix renderer run patch:dependencies`。不支持的版本或被修改的输入会停止补丁操作。真实 PNG 和结构注入回归属于基线证据，不代表线上 OG 端点验收。
