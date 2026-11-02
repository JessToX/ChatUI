const examples = [
  { id: "html-details", title: "真实折叠区", text: "原生 details 与 summary，点击或键盘即可展开，不再显示成 HTML 源码。" },
  { id: "html-velocity", title: "中文速度矢量", text: "核心结论、轻量推导、稳定的向量箭头与公式下标、折叠补充。" },
  { id: "html-reading", title: "安全 HTML 阅读", text: "浅层语义结构，正文、列表、代码与局部滚动的宽表格。" },
  { id: "timeline", title: "项目时间线", text: "编号、连接线、日期与明确状态，按顺序交代变化。" },
  { id: "progress", title: "完成进度", text: "真实分母、大数字与比例条；更改条件生成新快照。" },
  { id: "profile", title: "风格档案", text: "标题、标签与连贯正文，而不是每段都套一张卡。" },
  { id: "rhythm", title: "叙事节奏", text: "定性关注度清楚对齐，不冒充实测百分比。" },
  { id: "comparison", title: "左右公式对照", text: "蓝绿语义边框、居中公式和对应说明。" },
  { id: "derivation", title: "推导步骤", text: "编号与连接线串起公式、条件和解释。" },
  { id: "quiz", title: "五题测验", text: "本地选答、真实计分、反馈、重试与继续学习。" },
  { id: "chart", title: "速度曲线", text: "真实 SVG 坐标、点和单位，支持键盘读取数据。" },
  { id: "geometry", title: "圆与三角形", text: "圆、辅助线、直角标记和可操作的本地几何实验。" },
  { id: "answer", title: "最终答案", text: "结论、公式、单位和语义色组成完整答案块。" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-20">
      <p className="text-sm font-medium tracking-wide" style={{ color: "var(--chatui-blue)" }}>ChatUI Renderer · 1.5.0</p>
      <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">正常聊天，<br />统一呈现。</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">正文、公式、图形与交互，在同一个透明视图中连贯展开。普通回答默认安全 HTML，复杂交互保留原有结构化路径；不需要每轮都画图，也不必把每段文字变成卡片。</p>
      <section aria-labelledby="examples-title" className="mt-12 sm:mt-14">
        <h2 id="examples-title" className="text-xl font-semibold">HTML 与结构化参考内容</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">这是开发预览，不是另一个聊天产品。可切换深浅主题及 320、375、768、1024px 内容宽度；本页不调用模型、不发送真实聊天消息。</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {examples.map((item, index) => (
            <article key={item.id} className="rounded-[18px] border border-border p-5">
              <p className="text-xs font-medium tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{item.text}</p>
              <a className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current" style={{ color: "var(--chatui-blue)" }} href={`/preview.html?example=${item.id}`}>
                查看样例<span className="sr-only">：{item.title}</span>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </a>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-12 border-t border-border pt-7">
        <h2 className="text-lg font-semibold">仍在原来的聊天里使用</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">沿用现有私人 ChatUI 插件与连接。普通回答默认一次 render_html，复杂交互整轮 render_response；简单确认或明确要求纯文本时保留原生回复；追问仅呈现本轮需要的内容，条件改变使用新快照。</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Renderer 不保存聊天记录，不调用额外模型 API。视图位置与自动路由由宿主控制；源码完成、开发预览或部署成功都不代表真实聊天中的连续调用已经确认。</p>
      </section>
    </main>
  );
}
