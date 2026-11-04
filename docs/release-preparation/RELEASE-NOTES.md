# ChatUI 发行说明草稿

状态：**尚未发布，未创建 tag、Release 或 Packages**。建议首个正式公开标签使用 `v1.0.0`，最终名称和公开动作仍待确认；本草稿不宣称完成所有发布门禁。

## 身份与内容

| 身份 | 当前含义 |
| --- | --- |
| 拟发布标签 `v1.0.0` | 整体源码发行的建议名称，尚未创建 |
| Plugin / Codex overlay `1.0.0` | 已冻结的插件元数据，不是已发布连接 |
| Renderer / lockfile / MCP serverInfo `1.6.1-iteration.1` | 内部实现版本，保留原值，不为对齐标签而修改 |
| UI URI / 资源哈希 | 独立缓存与字节身份，不从上述版本数字推断 |
| `release.json` 的 `sourceCommit` | 每次本地打包绑定的精确最终提交；不是旧完整开发树 |

保留六工具：HTML、Response、Document、Component、Explanation 与 Incline Forces。本轮候选包含依赖安全升级、Zod 兼容调整和 OG 图片渲染修复；Response/HTML 的生成资源因 DOMPurify 升级而改变字节。六工具输入和既有测试门槛保持不变，但不能把本轮描述成纯包装整理。

## 已验证范围与限制

- 文档整理前基线 `a90c8d3f03a567db99186b25d144b017564158cc` 已有 main push CI：组件92、Python159、Renderer472，零跳过，并完成 types/lint/build/生成/保真。新候选须重新验证；最终记录必须绑定实际提交，不能沿用旧 CI 作为新提交通过证明。
- 安全修复候选 `448a8e0b5ac7b45d87085efe9252e3fcac2d955b` 的真实 PR CI [run 41828357173](https://github.com/JessToX/ChatUI/actions/runs/41828357173) 已通过：组件92、Python165、Renderer476，零跳过，以及 types/lint/build/生成/许可/源文件保真检查。该结果只证明此提交；任何后续文档或源码变更都须绑定新提交重新验证。
- 相同 v5 产品的六工具在 macOS Chrome 普通 ChatGPT 网页有固定公开合成卡片场景证据；表单提交后一次不含答案的问题正确读到提交值。产品资源字节对照是继承这些有限证据的前提。安全修复改变了 Response/HTML 资源；其真实宿主验收不能直接沿用旧资源结论，本地回归也不代替宿主重验。
- 首版承诺已验 Chrome 网页目标。原生 ChatGPT macOS、其他浏览器及系统组合未验。表单原生 select 方向键仍待人工结果；图形键盘步进已有网页证据。
- 自动复制在已测宿主中受限，显示可手动复制的完整文本，不声称自动复制成功。
- 首次加载曾需手动刷新，根因未证实；按用户决定不调查、不作为阻塞，也不记为首载通过。
- 状态恢复的旧快照识别、本地编辑保护和容量边界有回归；自然跨实例迟到事件未获宿主证据，不承诺不同实例的可信全序。见[恢复契约](FORCE-RESTORE-CONTRACT.md)。
- main push 和上述候选的真实 pull_request 事件均已实际运行；草稿 PR #1 尚未合并。源码发行不等于插件目录审核、托管部署或所有输入验收完成。

## 附件与许可

Source ZIP 是精确候选的源码、锁文件、测试和公开文档；不含 Git 历史、依赖安装目录、秘密配置或私人日志。Gallery ZIP 是固定输入的离线演示，不连接模型，也不是 ChatGPT 插件安装包。附件 SHA256、提交与文件清单见同批 `SHA256SUMS` / `release.json`，生成步骤见[发行材料](DISTRIBUTION.md)。

原创贡献采用 MIT，Copyright (c) 2026 **Jess(T o X)**。第三方许可证和版权保持原样，详见根 [LICENSE](../../LICENSE)、[NOTICE](../../NOTICE.txt) 与 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)。未确认来源的原图标没有进入当前源码，替换图是项目自有的简单几何占位。

## 发布前核对

最终候选测试及附件校验、人工键盘结果、变更资源的宿主验收与原仓库历史隐私风险需如实列明。依赖扫描剩余公告和适用性判断必须保留，CI 通过不代表不存在漏洞。若计划推出托管服务，还需核实平台对客户端身份头的剥除/覆盖、直达源站绕过和宿主状态/模型上下文边界；当前本地测试不能证明线上代理安全。源码及离线 Gallery 发布与托管服务上线应分别决定。旧不可达对象是否仍可访问与是否公开须独立判断；GitHub Support 咨询是可选隐私措施，不是强制发布审批。公开可见性、tag、Release 上传需要最终确认。本轮不发布 npm、PyPI、容器或 GitHub Packages。
