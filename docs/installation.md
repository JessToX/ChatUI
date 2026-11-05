# 安装、运行与连接边界

当前交付是源码和离线 Gallery，不是安装程序或已部署的 ChatGPT 插件。版本含义与已验范围见[发行说明草稿](release-preparation/RELEASE-NOTES.md)。所有者已选择退役现有线上站点，处置尚待执行；不提供持续在线入口或当前宿主兼容保证。以下命令从解压后的对应目录执行，不需要项目作者的账户或配置。

## 离线 Gallery

解压 Gallery 附件，在 `ChatUI-Gallery/` 中直接打开 `gallery/index.html`，或运行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory gallery
```

浏览器打开 `http://127.0.0.1:4173/index.html`，结束时按 Ctrl-C。从源码目录预览时，将 `--directory gallery` 改成 `--directory renderer/public/gallery`。Gallery 是固定公开合成输入；不调用模型、MCP、CDN 或远程字体，不会连接 ChatGPT。无需 npm、Python 绘图库或 API 密钥；Python 在这里仅用于可选的静态 HTTP 服务。

## 完整源码验证

使用 Node.js **24.20.0** / npm **12.0.2**。本次依赖修复的完整本地验证使用 macOS/Python **3.12.16**。Pillow **13.0.0** 要求 Python **3.11 或更新版本**；建议使用 Python **3.12**。文档收尾基线 `529460291eaa813e37146be3e082c81285c9944e` 已通过 Ubuntu 24.04 / Python 3.12 的真实 PR CI，组件92、Python165、Renderer476，零跳过；见[验证说明](release-preparation/VALIDATION.md)。后续文档修改不自动继承为新提交已获 CI 通过。旧候选的 Python 3.9.6 结果不适用于当前 Pillow 依赖。其他 Python、操作系统和 Node 主版本尚不作保证。

Ubuntu 24.04 上完整绘图回归需要官方 Noto CJK 字体和 fontconfig；这些是系统依赖，不捆绑进 ZIP：

```sh
sudo apt-get update
sudo apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 fontconfig
fc-cache -f
```

上述固定字体版本对应当前 Ubuntu 24.04 CI；其他发行版请按其官方包源安装覆盖中文标签的字体，不能把安装成功代替预检。macOS 验证使用系统 PingFang 字体。字体缺失会明确失败，不删除中文断言。Ubuntu 包来源见[官方软件包页](https://packages.ubuntu.com/noble/fonts-noto-cjk)。

在全新源码解压目录执行；虚拟环境放在源码外，避免污染严格输入清单：

```sh
python3 -m venv ../chatui-verification-venv
. ../chatui-verification-venv/bin/activate
python3 -m pip install -r requirements-phase3.txt
python3 -m pip check
PYTHONDONTWRITEBYTECODE=1 python3 .github/scripts/check-runtime.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/reproduce-package.py
```

字体预检调用实际绘图适配器的字体解析路径。完整脚本执行两个 locked `npm ci`、组件/Python/Renderer 测试、类型、lint、build、生成、元数据、许可及原始输入保真检查。它拒绝已有 `renderer/.openai`、额外文件、软链接或清单不符；已有开发目录请保留并改用新副本，不删除自己的配置来凑通过。脚本只为干净副本生成不可部署的公开 hosting 占位。

## Renderer 开发预览

以下仅为开发入口，完整验收仍用上面的新副本流程。在源码 `renderer/` 中：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/prepare-local-config.mjs
npm run build
npm start
```

`npm start` 使用本地 Wrangler，绑定 `127.0.0.1`；端口以启动输出为准，结束按 Ctrl-C。静态样例也可直接用根 README 的 HTTP 命令。配置助手只在缺失时创建 `renderer/.openai/hosting.json`，保留现有文件/软链接；不要手工覆盖真实绑定。此本地预览不证明远程 MCP 身份认证或真实宿主验收。

## 连接 ChatGPT

源码包含六工具 MCP 实现，但发行附件不包含托管服务、已配置的官方 Tunnel、凭据或可用的账户 App 绑定。`plugins/chatui/.app.json` 是不可用的公开占位；不要直接把源码 ZIP 当可安装连接。针对任意新用户环境的一键部署/接入流程尚未验证，本指南不虚构这样的承诺。

开发者使用自己管理的环境：先准备合规的 MCP 端点与认证，再通过 ChatGPT 的官方自定义 MCP 接入流程选择该端点，核对发现的工具及 UI 元数据，在新会话测试实际卡片与模型可见结果。官方文档允许 HTTPS 端点或用于私有开发测试的 Secure MCP Tunnel，具体账户/工作区政策以页面为准；公开插件目录提交与 GitHub 源码发行是不同流程。参见[官方连接与测试指南](https://developers.openai.com/plugins/deploy/connect-chatgpt)和[服务端要求](https://developers.openai.com/plugins/build/mcp-server)。

账户、端点及凭据由使用者自行配置；不要把密钥填进聊天、提交到 Git、写入前端或发行包。离线预览不需要模型 API 密钥；官方 Tunnel 或自己的托管/认证服务可能另需凭据，不能把“离线无需密钥”理解成连接完全无需认证。生产部署必须保留服务端身份验证，不能公开一个信任任意身份请求头的服务；公开 hosting 占位不可部署。当前没有取得生产代理清除/覆盖伪造与重复身份头、阻止直达源站绕过的充分证据。托管上线及真实宿主隐私/状态验收仍需独立完成，不因源码发行或 CI 成功而视为通过。

## 更新和回退

保留已验源码/附件 SHA256 和相应服务版本。先在隔离目录验证新候选，再由服务所有者按其托管平台受支持流程更新。GitHub Release 不会自动更新 ChatGPT 连接；资源或工具元数据变化后按官方流程刷新并重验。回退服务时须核对旧服务能否读取新 URI，不能保证旧缓存和新会话自动兼容。当前版本与已知限制见[主 README](../README.md)，不要沿用旧阶段的私人 Site、插件编号或发布命令。
