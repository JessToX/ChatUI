# Offline Final Edition — Security / Limitations

> **历史阶段记录，非当前安装/发布指南。** 下文版本、许可待定、CI/宿主状态及审批范围仅反映当时，不能作为当前结论。当前原创许可已为 MIT / Jess(T o X)，当前版本与范围见[发行说明草稿](../release-preparation/RELEASE-NOTES.md)。保留原阶段事实，不继承旧测试为新候选通过。

本地候选状态：**HOST NOT VERIFIED / RELEASE NOT PUBLISHED**。离线 Gallery 是固定输入的本地模拟宿主，不能证明真实 ChatGPT 模型消费字段、交付顺序、连接或部署安全。

## Quiz 数据边界

S01/A00 从四个 Quiz 输出路径的 `content`、`structuredContent`、fallback、错误和模型上下文中排除评分键与解析，并检查属性名和常见编码夹带。公开题目/选项属于公开内容；评分仅经可信组件 `_meta.chatui.quizGrading` 路径进入 iframe。关闭 schema、内容身份、公开 View hash 和每次交付的 `deliveryId` 必须匹配；metadata-only 迟到、缺失或格式错误均 fail closed。

**浏览器评分不保密。** 下载的 Gallery/源码和浏览器 DevTools 可检查评分数据。`_meta` 在协议上不对模型公开不等于对浏览器用户保密。客户端测验适用于学习反馈，不能承担需保密的考试或权威服务端评分。

## 完整旧 envelope 重放：LIMITATION

若宿主提供完整匹配的旧 `toolOutput + _meta`，客户端无法独立证明其是当前代次。公开相关 UUID 不是认证、加密或完整 envelope 抗重放机制。正式复现保留在 `renderer/tests/quiz-bridge.test.mjs` 的 `LIMITATION a complete old toolOutput plus matching metadata` 测试中：先交付当前题目，再交付匹配旧对；旧评分仍可能被接受。该测试 PASS 只表示已知限制被如实复现，**不表示抗重放 PASS**。

最终 Review 提供独立 `replay-limitation.json`，包含正式复现日志 hash 和原观察记录。真实宿主交付顺序、authoritative generation 和模型可见字段仍是 **NOT RUN / NOT VERIFIED**。不能用离线 UUID 绑定或静态截图推导真实宿主安全。

## 既有安全与兼容约束

数学/物理 golden 不从生产实现生成；极端几何 `radius=2e-162,heightRatio=0.05` 必须被拒绝，不能夹取最小正面积。TeX 有界降级与完整正文 fallback 保留。Gallery 使用 opaque-origin scripts-only sandbox、CSP、nonce/source/lifecycle 检查；复制状态不向父级泄露评分。默认仍为 `render_html`，Document additive；六工具和八 URI 契约保持。

## 未验证与公开风险

Chrome 的 file/loopback HTTP 检查和自动 ARIA/键盘测试不能替代 Safari、Firefox、人工 VoiceOver或真实宿主。两次 RAF 只记录挂载后的绘制机会，不是 FCP。资源体积软目标超额需要记录，不能删功能换取预算通过。

本轮只读检查所有本地可达 Git 历史、作者信息和当前 allowlist。历史中存在账户绑定文件路径、本机路径、会话链接及测试用 private-key 标记，公开准备需用户审查；作者联系信息的公开也需用户决定。历史未重写，私人 binding 未打开。当前 Source/Gallery/Review 只包含通过扫描的明确 allowlist 与公开 placeholder，不包含原账户 binding。远端旧发行附件的实际内容如未取回审查，保持 UNKNOWN，不宣称完整公开风险已解除。

项目未指定开放许可，不新增项目级 LICENSE。未来公开范围、许可、tag、发布、生产连接和归档须单独决定；本轮在 F1–F2 后停止。
