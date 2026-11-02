// Same approved Chinese content; simple vector accents use the stable semantic token.
export const velocityHtml = `<p>
  比如你之后问我一道物理题，我可以这样组织：
</p>
<div class="concept-card">
  <h4>核心结论</h4>
  <p>
    速度是一个<strong>矢量</strong>，因此比较速度时不能只比较大小，还必须考虑方向。
  </p>
</div>
<div class="derivation">
  <h4>推导</h4>
  <p>若有：</p>
  <p>
    <code><span class="vector">v</span><sub>LG</sub> = <span class="vector">v</span><sub>LP</sub> + <span class="vector">v</span><sub>PG</sub></code>
  </p>
  <p>
    那么三个速度必须按照同一个坐标系处理，不能直接把三个速率的绝对值相加。
  </p>
</div>
<details>
  <summary><strong>展开查看更多解释</strong></summary>
  <p>
    三个速度必须在同一个坐标系中处理。
  </p>
</details>`;
export const disclosureHtml = `<details>
  <summary><strong>点我展开</strong></summary>
  <p>如果这句话展开出来了，就成功。</p>
</details>`;
export const readingHtml = `<h2>语义 HTML 的阅读与交互</h2>
<p>普通回答使用<strong>真实 DOM</strong>，保留<em>强调</em>、文字选择和键盘操作。H<sub>2</sub>O 与 x<sup>2</sup>无需复杂公式工具。</p>
<div class="comparison-grid"><section class="concept-card"><h3>HTML 直渲染</h3><ul><li>解释、写作和翻译</li><li>静态表格与折叠补充</li></ul></section><section class="note"><h3>结构化交互</h3><ol><li>测验与状态恢复</li><li>数据图表与复杂公式</li></ol></section></div>
<blockquote>外层透明，不把整篇回答套成一个大卡片。</blockquote>
<dl><dt>快照</dt><dd>内容变更使用新的 contentId。</dd></dl>
<table><caption>工具选择：宽表格只在局部滚动</caption><thead><tr><th scope="col">类型</th><th scope="col">默认工具</th><th scope="col">原因与范围</th><th scope="col">生命周期</th><th scope="col">安全边界</th></tr></thead><tbody><tr><th scope="row">解释</th><td>render_html</td><td>语义 HTML，浅层结构</td><td>当前消息快照</td><td>双重净化</td></tr><tr><th scope="row">考考我</th><td>render_response</td><td>保留原有计分与重试</td><td>既有状态管理</td><td>结构化校验</td></tr></tbody></table>
<pre><code>// 代码可以选择复制；超长代码只横向滚动，不撑破消息。
const example = { contentId: 'html-reading-v1', html: '&lt;p&gt;保持完整可读回答，单次工具调用，避免重复正文。&lt;/p&gt;', theme: 'native' };
  console.log(example);</code></pre>
<p class="warning">不允许模型生成脚本、内联样式、图片、SVG、表单或 iframe。</p>
<details><summary>展开完整兜底说明</summary><p>关闭的折叠内容仍包含在工具文字兜底中。刷新不跨会话保存 HTML 折叠状态。</p><p><a href="https://developers.openai.com/plugins/build/chatgpt-ui" target="_blank">官方 MCP App UI 文档</a></p></details>`;
export const htmlFactories = {
  'html-details': () => ({ contentId: 'html-details-v1', html: disclosureHtml, title: '真实折叠区' }),
  'html-velocity': () => ({ contentId: 'html-velocity-v2', html: velocityHtml, title: '中文速度矢量' }),
  'html-reading': () => ({ contentId: 'html-reading-v1', html: readingHtml, title: '阅读与局部滚动' })
};
export const htmlReferenceIndex = [
  { id: 'html-details', title: 'HTML · 可点击折叠', mode: 'html' },
  { id: 'html-velocity', title: 'HTML · 速度矢量', mode: 'html' },
  { id: 'html-reading', title: 'HTML · 阅读与表格', mode: 'html' }
];
