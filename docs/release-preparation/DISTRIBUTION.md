# 本地发行附件

以干净 Git 提交为输入，在源码外的新目录运行：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/package-distribution.py --output ../chatui-release-artifacts
```

脚本拒绝脏工作树、清单不符、软链接、秘密路径及已存在的输出目录。它只读取最终提交列出的文件，执行隐私与相对链接检查，生成两份 ZIP、`release.json` 和外层 `SHA256SUMS`，不发布或连接任何服务。

- `ChatUI-Source-<提交前12位>.zip`：`ChatUI-Source/` 下是提交原字节及文件模式，不含 `.git` 或构建环境；在全新解包目录按[安装说明](../installation.md)完整验证。
- `ChatUI-Gallery-<提交前12位>.zip`：`ChatUI-Gallery/gallery/` 下保留生成器的七文件与内部校验；外层附原创 LICENSE、NOTICE 和可独立阅读的启动说明。不是插件安装程序。
- `release.json`：精确提交/tree、内部版本、每个归档条目的 SHA256、附件校验值；记录不包含私人证据或本机路径。它描述内容绑定，不声明测试通过。
- `SHA256SUMS`：校验两个 ZIP 和 `release.json`。在附件目录用 `shasum -a 256 -c SHA256SUMS`；Linux 也可用 `sha256sum -c SHA256SUMS`。

最终目标为公开并归档现有仓库；当前宿主与身份保护门槛未完成，以下本地准备不构成公开许可或已放行结论。

本次文档收尾基线为 `529460291eaa813e37146be3e082c81285c9944e`。旧基线附件与其校验值仍只代表旧基线；修改文档后不得沿用旧 ZIP、提交名或哈希作为最终附件。只有从本次干净提交生成并核验的附件才是本次发行材料；本地打包不等于 Release 已上传或发布。

同一环境重复打包应得到相同字节；ZIP 使用固定时间、排序和文件模式。附件完成后仍需干净解包、测试、真实浏览器展示检查及独立审查，不能把哈希一致等同功能正确。最新结果放在独立验证记录，不把含私人路径的日志纳入附件。

旧 `scripts/qa/package-phase3.py`、`package-release-candidate.py` 记录早期选择性打包流程；部分输入在清理时已排除，不能作为当前干净根候选的发行入口。保留这些脚本与回归，不重新使用旧包或旧报告冒充新候选。

GitHub tag 的自动 Source code ZIP/tarball 仅是标签源码快照，不含依赖安装结果。Release 发布时只附必要材料，避免把旧 Review ZIP、私有验收材料或本地备份上传。`main` 为持续开发与 CI 主线，临时验收分支可在后续明确批准后移除；本脚本不改变任何引用。
