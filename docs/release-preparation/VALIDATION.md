# 当前验证入口

先记录实际 HEAD、工作树和包清单。测试结果绑定实际输入；新候选不能继承旧提交的云 CI 结论。版本、支持范围和证据边界见[发行说明草稿](RELEASE-NOTES.md)。

## 当前精确基线

文档收尾基线 `529460291eaa813e37146be3e082c81285c9944e` 已通过 [PR CI run 41831613236](https://github.com/JessToX/ChatUI/actions/runs/41831613236)：组件92、Python165、Renderer476，零跳过/失败，以及 types/lint/build/生成/许可/源字节与模式保真。Ubuntu 24.04 的字体与依赖预检同样通过。合并测试提交 `6f93d088d28afd03c20c2d1c99faeac8cc61dda4` 的树与基线相同，均为 `ab52ce8c8edb497dbc13d5750093c607972d511f`。

本次后续收尾仅改公开文档及文件清单，未改运行时代码、锁文件、测试或 CI 门槛。已有基线 CI 不等于后续文档提交获得了新 CI。最终发行需绑定实际提交与附件；已有结果不能覆盖新增源码变化。本地检查、CI、真实宿主验收和生产认证是不同证据：Response/HTML 变更资源的真实交互、select 键盘往返仍未验证。独立 owner-only 候选站点两种匿名请求已得到401拒绝；已登录身份头覆盖、原始重复头与直达源站隔离仍未知，不能由匿名拒绝推断通过。本次不再循环启动临时宿主会话。

## 完整发行验证

从全新源码解包目录，按[安装说明](../installation.md)准备 Node/npm、隔离 Python 环境及中文字体，执行：

```sh
python3 -m pip check
PYTHONDONTWRITEBYTECODE=1 python3 .github/scripts/check-runtime.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/reproduce-package.py
```

脚本先核原始输入清单/字节，再执行两个 locked install、组件/Python/Renderer 回归、types、lint、build、生成一致性、元数据与许可证检查，最后与原始输入比较；不以第二次生成的幂等性掩盖首次生成差异。测试零执行、失败、跳过或源文件漂移都会失败。不要复制私人 `.openai`、`.env` 或原始日志到验证副本。

当前 `.github/workflows/clean-candidate.yml` 使用 Ubuntu 24.04、Node24.20.0、Python3.12、固定 Python 依赖和官方 Noto CJK。触发为 main push、pull_request 到 main，以及精确临时验收分支 push；只有 contents:read，没有部署或 secrets。临时验收分支按约定不同时开 PR，避免一次 push 触发两次。并发仅按 workflow/event/ref 取消被替代的旧运行。

精确基线 a90c8d3f03a567db99186b25d144b017564158cc 的 main push 已通过，组件92/Python159/Renderer472，零跳过；更早两次失败仍属于真实历史。后续安全修复候选 `448a8e0b5ac7b45d87085efe9252e3fcac2d955b` 已通过真实 pull_request CI [run 41828357173](https://github.com/JessToX/ChatUI/actions/runs/41828357173)，组件92/Python165/Renderer476，零跳过，并完成 types/lint/build/生成/许可/源文件保真。PR 合并测试提交 `71fc75bf34e02f8f55640da625844489c39c8852` 的树与候选相同，均为 `5338ddc2d8e3bf4972d29352440186c14fb85f2b`。这些是该精确候选的历史验证事实，不能用作后续修改提交已通过 CI 的证明。后续候选须更新清单、重新提交、打包并记录其自身 CI。

## 定向维护

| 改动 | 定向检查 | 说明 |
| --- | --- | --- |
| 文档 | `git diff --check`、发行器的相对链接/隐私检查 | 历史文档必须标明其时点 |
| 原创/第三方许可文案 | `python3 scripts/qa/audit-phase3-licenses.py --check`、`python3 -m unittest discover -s tests -p test_phase3_delivery.py` | 保留完整第三方版权和依赖清单 |
| canonical 组件 | `python3 scripts/build_component_templates.py --check`、`npm run test:components` | 不能手改生成资源来通过 |
| 插件元数据 | `python3 scripts/sync-plugin-metadata.py --check --candidate` | 当前数字是未发布候选元数据 |
| Renderer | 在 renderer 中 `npm test`、types、lint、build 和 `node scripts/check-generation.mjs` | 需先安装锁定依赖并建立公开本地配置 |
| 发行材料 | `python3 scripts/package-distribution.py --output <源码外的新目录>` | 干净提交原字节打包；再干净解压全验 |

新副本缺少 hosting 配置时，使用 `node renderer/scripts/prepare-local-config.mjs`；公开占位仅用于本地构建，不可部署，也不覆盖现有绑定。完整测试使用自有合成数据和临时 loopback 服务，不运行官方 Tunnel。离线检查与 Gallery 浏览器检查不等于 ChatGPT 实际宿主通过。保真报告和原始日志保存在发行目录之外，公开说明只保留不含私人路径的摘要。
