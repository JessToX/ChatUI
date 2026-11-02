// Entry point for playwright-cli run-code --filename; no test framework needed.
async (page) => {
  const origin = new URL(page.url()).origin;
  const theme = new URL(page.url()).searchParams.get('theme') || 'dark';
  const ids = ['timeline', 'progress', 'profile', 'rhythm', 'comparison', 'derivation', 'quiz', 'chart', 'geometry', 'answer'];
  const report = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 900 });
  for (const width of [360, 768, 1024]) for (const id of ids) {
    await page.goto(`${origin}/preview.html?example=${id}&theme=${theme}&width=${width}&bare=1`);
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.__chatuiMetrics?.renders.some(render => render.firstPaintMs !== null && render.completeAt !== null));
    const frame = page.frames().find(item => item.url().includes('/chatui-response.html'));
    const measurement = await frame.evaluate(() => {
      const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const labels = [], overlaps = [], clipped = [];
      for (const svg of document.querySelectorAll('svg')) {
        if (!visible(svg)) continue;
        const bounds = svg.getBoundingClientRect();
        const texts = [...svg.querySelectorAll('text')].filter(visible).map(el => ({ text: el.textContent, rect: el.getBoundingClientRect() }));
        for (let i = 0; i < texts.length; i++) {
          const a = texts[i]; labels.push(a.text);
          if (a.rect.left < bounds.left - 1 || a.rect.right > bounds.right + 1 || a.rect.top < bounds.top - 1 || a.rect.bottom > bounds.bottom + 1) clipped.push(a.text);
          for (const b of texts.slice(i + 1)) {
            if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1) overlaps.push([a.text, b.text]);
          }
        }
      }
      return {
        viewport: document.documentElement.clientWidth,
        contentWidth: document.documentElement.scrollWidth,
        height: document.body.scrollHeight,
        title: document.querySelector('h1,h2')?.textContent,
        fallback: !!document.querySelector('.cui-render-fallback'),
        labels, overlaps, clipped,
        math: document.querySelectorAll('math').length,
        firstPaintOpportunityMs: window.__chatuiMetrics.renders.at(-1).firstPaintMs,
        metrics: window.__chatuiMetrics.renders.at(-1)
      };
    });
    await page.locator('iframe').screenshot({ path: `output/playwright/response-${id}-${theme}-${width}.png` });
    report.push({ id, theme, width, ...measurement });
  }
  return { report, errors };
}
