// Run from the repository root with playwright-cli run-code (local HTTP only).
// Start a static server for renderer/public on 127.0.0.1:4173 first.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI entry point.
async (page) => {
  const layouts = [];
  await page.goto('http://127.0.0.1:4173/preview.html?phase=2a&example=native-g06');
  await page.evaluate(() => {
    for (const id of ['g01', 'g04', 'g05']) {
      const key = `chatui-preview-v5/response/document-${id}/state`;
      sessionStorage.removeItem(key); sessionStorage.removeItem(`${key}/options`);
    }
  });
  for (const example of ['g01', 'g04', 'g05']) {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:4173/preview.html?phase=2a&example=document-${example}&theme=${theme}&width=${width}&bare=1`);
      const frame = await page.locator('#explanation').elementHandle().then(handle => handle.contentFrame());
      await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
      await frame.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const frame = document.querySelector('iframe');
        return Math.abs(frame.getBoundingClientRect().height - frame.contentDocument.body.scrollHeight) <= 2;
      });
      const measurement = await frame.evaluate(() => {
        const root = document.querySelector('#chatui-component');
        const regions = [...root.querySelectorAll('.cui-document-table, .cui-ex-math-scroll, pre')];
        const controls = [...root.querySelectorAll('button, summary, input')].filter(node => node.getClientRects().length);
        return {
          frameWidth: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
          status: document.querySelector('#chatui-status').textContent,
          bodyFont: getComputedStyle(root).fontSize, lineHeight: getComputedStyle(root).lineHeight,
          rootWidth: root.getBoundingClientRect().width, background: getComputedStyle(root).backgroundColor,
          headingCount: root.querySelectorAll('.cui-document h2').length,
          outlineCount: root.querySelectorAll('.cui-document-outline li').length,
          outlineInteractive: root.querySelector('.cui-document-outline a, .cui-document-outline button') !== null,
          mathCount: root.querySelectorAll('math').length,
          localScrollRegions: regions.filter(node => node.scrollWidth > node.clientWidth + 1).length,
          minimumControlHeight: Math.min(...controls.map(node => node.getBoundingClientRect().height)),
          visibleText: root.textContent.length
        };
      });
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const result = { example, theme, width, pageOverflow, ...measurement };
      if (measurement.frameWidth !== width || measurement.overflow > 1 || pageOverflow > 1 || measurement.status || measurement.outlineInteractive || measurement.minimumControlHeight < 44 || measurement.rootWidth > 780.1 || measurement.bodyFont !== (width <= 560 ? '16px' : '18px')) throw new Error(JSON.stringify(result));
      if (example === 'g05' && (measurement.headingCount !== 8 || measurement.outlineCount !== 8)) throw new Error(`Incomplete research sections: ${JSON.stringify(result)}`);
      await page.screenshot({ path: `output/playwright/phase2a/after/${example}-${theme}-${width}.png`, fullPage: true });
      if (width === 768 || width === 390) await page.screenshot({ path: `output/playwright/phase2a/after/${example}-${theme}-${width}-reading.png` });
      layouts.push(result);
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`http://127.0.0.1:4173/preview.html?phase=2a&example=native-g06&theme=${theme}&width=390&bare=1`);
    await page.locator('#native-answer').waitFor({ state: 'visible' });
    if (await page.locator('iframe').count()) throw new Error('Native control mounted a widget');
    if (await page.locator('#native-text').textContent() !== '已收到。下一步先核对题设，再检查结论。') throw new Error('Native text changed');
    await page.screenshot({ path: `output/playwright/phase2a/after/g06-${theme}-390.png` });
  }
  return { scope: 'Three HTTP prototypes, 24 layouts; native control 2 layouts. No file Gallery or private host.', browser: page.context().browser().version(), layouts, nativeControl: 'PASS' };
}
