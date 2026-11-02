# 本地验证入口

这些命令不发布、不连接 ChatGPT。依赖安装是独立步骤；使用已锁定版本，不在验收时顺便升级。以下全量命令是按需入口，不是每次修改的必跑列表；先看 [工程导航](../ENGINEERING.md) 确认源码与生成目标。执行前记录分支、HEAD 和已有改动，结果绑定实际工作树；有未提交改动时仅记录 HEAD 不足以标识验证对象。

## 按改动选择检查

| 改动 | 最小相关检查（未注明时从仓库根执行） | 是否改写生成文件 |
| --- | --- | --- |
| 仅 Markdown / 导航 | `git diff --check`；核对相对链接和命令路径；复用 `scripts/release_privacy.py` 的 `validate_public_content` 检查改动文本 | 否；不需要 build 或全套功能测试 |
| canonical 组件 / 派生模板 | `python3 scripts/build_component_templates.py --check`、`npm run test:components` | check 不写；过期时按工程导航重建 |
| 插件版本 / 元数据 | `python3 scripts/sync-plugin-metadata.py --check --candidate` | 否 |
| Scene 交互 | 在 `renderer/` 执行 `node --test tests/scene.test.mjs tests/scene-vertical.test.mjs`，先按工程导航生成改动对应的资源 | 生成步骤写文件；测试结果不等于可见 UI 验收 |
| 生成器 / 示例工厂 | 在 `renderer/` 执行 `node --test tests/generation.test.mjs`，再按需运行下方两轮生成检查 | 两轮生成会写资源和 RC 夹具 |
| 隐私门禁 / 包清单 | 本页下方定向 Python 测试；涉及交付范围时补相应 delivery 测试 | 测试使用自有临时夹具，不是制作新交付包 |

定向结果与历史全量结果分开记录，不相加冒充新增覆盖；没有跑的类型、构建、浏览器或宿主检查明确标为未运行。

## 按需完整检查

根目录：

```sh
npm run test:components
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m unittest discover -s scripts -p 'test_tunnel_*.py'
python3 scripts/build_component_templates.py --check
python3 scripts/sync-plugin-metadata.py --check --candidate
python3 scripts/qa/audit-phase3-licenses.py --check
python3 scripts/validate.py
```

`renderer/`：

```sh
npm test
node scripts/check-generation.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm run build
```

`check-generation.mjs` 不是只读检查：它先生成，再比较第二轮是否稳定，不能发现已被第一轮纠正的旧文件。执行前后审阅工作树差异；不要为获得干净状态丢弃已有改动。`npm run build` 自带三个产品生成器，不含额外 RC 夹具生成；不要无理由紧接着重复这两项。

注意 build 会读取本目录 `.openai/hosting.json`。本轮在隔离临时源码副本中通过 `prepareLocalConfig` 创建公开 placeholder 后构建，没有读取/复制原账户配置；placeholder 不可部署。全量 Node 测试会创建自有 loopback 临时服务，不是官方 Tunnel 运行。Tunnel Python 测试只用假 key 与 mock 子进程。既有 preview 进程不属于这些测试，不需停止它。

长正文混合场景：`node renderer/scripts/prepare-mixed-scene-check.mjs` 生成 `/tmp/chatui-mixed-scene-check.js`；使用已安装 Playwright CLI 的独立 headless 会话运行该 callback。它将浏览器设为 offline，使用生成的产品 HTML 与本地模拟初始化，检查320/360/720px。输出会包含固定HTML，重定向到本地日志即可。截图存放 `output/playwright/`，不纳入发布内容。

测试层级分别报告，不把同一测试重跑或相关子集叠加成独立覆盖。JSDOM 验证 DOM/事件，不证明真实布局；headless Chromium 验证本地布局，不证明 ChatGPT 宿主；真实宿主固定双图不证明完整产品、长正文或模型采用上下文。


## 隔离候选的最小可复用检查方案

本方案没有创建或启用外部workflow。建议未来CI使用独立干净源码目录、Node24.20.0/npm12.0.2及Python3.9以上，先在根与renderer分别执行 `npm ci --ignore-scripts --no-audit --no-fund`；仅在不存在账户绑定的新目录执行 `node renderer/scripts/prepare-local-config.mjs`，生成不可部署的公开placeholder。不要复制本机 `.openai`、`.env`、`.git` 恢复数据或原始日志。

隐私/打包门禁的最小回归入口（根目录）：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*privacy*.py'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_release_inventory.py'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_package.py'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_standalone_package.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa/audit-phase3-licenses.py --check
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_component_templates.py --check
PYTHONDONTWRITEBYTECODE=1 python3 scripts/sync-plugin-metadata.py --check --candidate
```

涉及打包入口时再运行 `test_phase2b_delivery.py` 和 `test_phase3_delivery.py`。这些测试只写自有临时合成文件；不需要真实宿主或凭证。未来完整发布门槛再接本页既有components/Renderer测试、types、lint、两轮生成与build，记录实际执行的命令、环境、退出码、提交SHA/tree和资源hash，不把未运行的检查标为通过。

JSON门禁检查原文、一次完整JSON解析的所有键/字符串值（保留重复键的旧值），以及每个文本一次HTML实体/Markdown下划线/URL百分号规范化。非JSON源代码片段不当作JS执行，也不反复解析字符串中的JSON。声明为JSON的文件必须可解析；32MiB文件上限、64层嵌套和200000节点预算超限则拒绝。二进制只扫可见文本标记，不等于完成图片/压缩包元数据隐私审计。
