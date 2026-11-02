---
name: chatui-progress
description: 在 ChatUI 对话中核对项目进展、完成数量、阶段包含关系和时间线。承接“又完成一项、总量改成、更新一下”等追问，使用 render_response 统一呈现本轮说明和真实进度，不要求重复点名。未知总量不编造百分比。
---

# ChatUI Progress

本地候选：Portable Plugin／Codex overlay **1.0.0**，Renderer **1.6.1-iteration.1**；尚未发布、未更新真实连接、未获宿主验收。当前作者指引以连续原生讲解为主，必要局部 UI 使用 `render_response`；`render_html` 与 `render_document` 等旧入口保持兼容；`documentVersion: 1` 保持不变；本地候选 UI 资源 URI 为 `ui://chatui/document-v4.html`，`document-v3.html`、`document-v2.html` 与 `document-v1.html` 保留可读兼容。

沿用 ChatUI 的统一入口 `render_response`，不是另一个渲染产品。普通进度回答由 `prose` 与 `component.type:"progress"` / `timeline` 组合；即使只有说明也沿用同一视图。简单确认和明确纯文本请求例外。

1. 从本轮与已确认上下文提取完成数量、分母、单位和阶段。未知数量、日期、责任人保留未知；不能用聚合计数推出条目身份。
2. 同一总量用一份 `facts`，正文与组件共用。多阶段共用同一分母；用 `subsetOf` 表达包含关系，子阶段数量不得大于父阶段，不能把包含阶段相加成总完成率。分母未知或为零时用说明或清单，不画假进度。
3. 题设变化生成新 `contentId` 和完整新快照。修改分母后重算所有比例；不能说旧卡片已更新。仅当前块补充说明时保留其稳定 `id`。
4. 普通回答一次调用；不要先写完整答案再转换。字段错误最多修正一次，仍失败则完整文字兜底；成功后只保留必要的原生引用或附件衔接。

工具、边界和示例见 [统一契约](../chatui/references/renderer.md)、[组件参数](../chatui/references/components.md) 和 [连续状态](../chatui/references/continuity.md)。旧 `render_component` 和 `render_explanation` 仅为兼容，不再负责普通进度默认路由。
