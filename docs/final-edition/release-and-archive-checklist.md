# ChatUI 后续发行与归档清单 — 各项需单独批准

当前是 [本地 RC](release-candidate.md)。**Local RC ≠ Published Release ≠ Host Validated ≠ GitHub Archived**。本文件不执行任何外部动作，不能把打勾或测试 PASS 当作自动授权。

| 决定 / 动作 | 批准前准备 | 独立批准要求 |
|---|---|---|
| push / PR 或 merge | 审核最终 SHA、干净状态、三包 hash、diff、完整 PASS/FAIL/UNKNOWN | 用户指定目标远端/分支与操作；本轮未 push/PR/merge |
| 私人部署与连接更新 | 合成宿主验收、原绑定保留、可逆回滚、认证/Origin/资源来源验证 | 明确批准环境、连接与路由范围；不能覆盖真实 binding |
| GitHub Release / tag | 版本身份、notices、项目许可、发布文案/附件、限制 | 单独批准 tag 与 Release；不得写成本轮已发布 |
| 仓库可见性与开源许可 | 核对 selected-only 内容、第三方要求、版权归属，选择项目 LICENSE | 用户单独决定公开/私有与具体许可；公开源码不自动开源 |
| GitHub Archive | 保留源码/锁文件/包/证据、维护承诺与恢复途径 | 用户单独批准 Archive；Release 成功不自动归档 |

归档前说明：依赖和浏览器仍会变化；冻结锁文件不保证未来无漏洞或能安装。指定谁处理安全报告、依赖修复及 host 变化；决定是否保持可维护分支与重新开放仓库规则。不删除失败记录或用历史 PASS 证明未来兼容。

宿主、其他浏览器、人工 VoiceOver 未测范围保持准确；支持声明只能扩展到真实取得的新证据。审批动作完成后更新相应记录，不改变原始采集 SHA/dirty 身份。当前到 Phase 3 本地交付即停止，不进入 Phase 4。

## Archive Notice — DRAFT / NOT ARCHIVED

当前仓库尚未归档，本轮没有停止维护的外部承诺。若未来用户批准 GitHub Archive，仓库将变为只读，归档后不承诺常规功能、依赖或真实宿主适配更新；用户应自行评估被冻结依赖和浏览器/宿主 API 的变化。Archive 不会撤销已下载包、停掉线上托管、关闭连接或修复未来漏洞。

需要继续写入时，由有权限的仓库管理员在 GitHub 仓库设置中执行 unarchive，保留原 tag、资产和 hash，再重新验收。归档前必须核对远端最终 SHA、tag、Release 资产及 README，并取得最后一次独立 Archive 授权。Release 成功不等于归档授权。
