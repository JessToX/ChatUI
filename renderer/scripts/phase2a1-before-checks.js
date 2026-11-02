// Matched input comparison: baseline resource bytes, final compiled fixtures.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI entry point.
async (page) => {
  const comparisons = [];
  await page.unroute('http://127.0.0.1:4175/**');
  await page.route('http://127.0.0.1:4175/**', route => route.continue());
  await page.goto('http://127.0.0.1:4175/preview.html?phase=2a&example=native-g06');
  await page.evaluate(() => sessionStorage.clear());
  for (const example of ['g01', 'g04', 'g05']) {
    const relative = `/examples/document-${example}.json`;
    const oldInput = await page.request.get(`http://127.0.0.1:4175${relative}`).then(response => response.text());
    const newInput = await page.request.get(`http://127.0.0.1:4173${relative}`).then(response => response.text());
    if (oldInput !== newInput) throw new Error(`Before/After input differs: ${example}`);
    const sourceHash = JSON.parse(newInput).structuredContent.sourceHash;
    for (const theme of ['light', 'dark']) for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:4175/preview.html?phase=2a&example=document-${example}&theme=${theme}&width=${width}&bare=1`);
      await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('#chatui-component[aria-busy="false"]'));
      const frame = await page.locator('#explanation').elementHandle().then(handle => handle.contentFrame());
      await frame.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const iframe = document.querySelector('iframe');
        return Math.abs(iframe.getBoundingClientRect().height - iframe.contentDocument.body.scrollHeight) <= 2;
      });
      const measurement = await frame.evaluate(() => ({
        frameWidth: innerWidth,
        outlineHeight: document.querySelector('.cui-document-outline').getBoundingClientRect().height,
        bodyStart: document.querySelector('.cui-document').getBoundingClientRect().top,
        outlineCount: document.querySelectorAll('.cui-document-outline li').length,
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      if (measurement.frameWidth !== width || measurement.overflow > 1) throw new Error(JSON.stringify(measurement));
      await page.screenshot({ path: `output/playwright/phase2a1/before/same-input-${example}-${theme}-${width}.png`, fullPage: true });
      await page.screenshot({ path: `output/playwright/phase2a1/before/same-input-${example}-${theme}-${width}-reading.png` });
      comparisons.push({ example, theme, width, sourceHash, ...measurement });
    }
  }
  return { baselineRendererSha: '91a79f01811fbb17d533c3cc17ab799df4597961', sameCompiledInputs: true, comparisons, scope: 'Final inputs rendered by baseline renderer. New G01/G04 text is not asserted to exist in the baseline commit.' };
}
