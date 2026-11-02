# 结构化路径可执行样例

以下参数直接传给 `render_response`，用于复杂交互、复杂公式及旧契约回归；普通内容改用 [HTML 路径](html-examples.md)。示例内容用于视觉／交互验收，不代表用户真实项目事实。

1. [项目时间线](examples/response-timeline.json)：编号、连接线、日期、状态标签与后文。
2. [完成进度](examples/response-progress.json)：同一事实生成正文、6/10 数字与60%条，未知状态不猜。
3. [风格档案](examples/response-profile.json)：大标题、标签、连贯正文与两个写作视角。
4. [叙事节奏](examples/response-rhythm.json)：定性简写／适度／重点展开，不使用假百分比。
5. [左右公式](examples/response-comparison.json)：蓝绿双栏与简洁 TeX。
6. [推导步骤](examples/response-derivation.json)：正质量、正阻力系数下的二次阻力方程，折叠量纲检查。
7. [五题测验](examples/response-quiz.json)：真实提交计分、重试和后续问题。
8. [速度曲线](examples/response-chart.json)：坐标、单位、真实数值、悬停／键盘提示。
9. [圆与三角形](examples/response-geometry.json)：圆心、点线面、虚线、垂足、直角和局部实验。
10. [最终答案](examples/response-answer.json)：明确圆柱**侧面积**而非总表面积，单位与公式一致。

短追问只需正文、代码、完整写作或译文时使用 `render_html`。收到明确“纯文本，不用插件”时原生回答。失败最多修正一次，然后完整兜底。

连续验收按六类主题各五轮：解释／数学、写作／译文、进度／计划、代码、图形／数据、自测。分别覆盖继续、为什么、条件改变、长文、代码、纯文本例外和失败。记录每轮真实调用／可见效果，不能用这些示例或本地预览冒充30轮实聊结果。
