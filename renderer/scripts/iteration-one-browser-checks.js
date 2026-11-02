// Run through Playwright CLI against our own synthetic offline Gallery only.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page, config) => {
  const checks = [], errors = [], requests = [];
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const onError = message => { if (message.type() === 'error') errors.push(message.text()); };
  const onPageError = error => errors.push(error.message);
  page.on('console', onError); page.on('pageerror', onPageError);
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.protocol === 'http:' && u.hostname === '127.0.0.1') return route.continue(); requests.push(u.origin); return route.abort(); });
  const open = async (scene, width, theme) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${config.url}?scene=${scene}&width=${width <= 390 ? width : 768}&theme=${theme}`);
    await page.waitForFunction(() => document.body.dataset.status === 'ready');
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    return frame;
  };
  const run = async (name, callback) => { try { checks.push({ name, status: 'PASS', ...await callback() }); } catch (error) { checks.push({ name, status: 'FAIL', error: error.message }); } };
  try {
    for (const width of [1280, 390, 320]) for (const theme of ['light', 'dark']) {
      await run(`G09 precise/invalid/keyboard/reset/derivation ${width}px ${theme}`, async () => {
        const frame = await open('G09', width, theme), input = frame.getByRole('spinbutton'), slider = frame.getByRole('slider');
        const area = () => frame.locator('[data-geometry-result="area"]').getAttribute('data-value').then(Number);
        const fixed = await frame.locator('.cui-document').first().textContent();
        await input.fill('1.5'); await input.press('Tab'); require(Math.abs(await area() - 3 * Math.sqrt(3)) < 1e-12, 'Independent optimum mismatch');
        await input.fill('1.2345'); await input.press('Tab'); require(await slider.inputValue() === '1.2345', 'Precision lost');
        const previous = await area(); await input.fill(''); await input.press('Tab'); require(await input.getAttribute('aria-invalid') === 'true' && await area() === previous, 'Empty input changed graph');
        await input.fill('2'); await input.press('Tab'); require(await area() === previous, 'Out-of-range input changed graph');
        await slider.focus(); await slider.press('Home'); require(await input.inputValue() === '0.05', 'Home did not synchronize');
        await slider.press('ArrowRight'); require(Number(await input.inputValue()) > .05, 'Arrow did not adjust');
        await slider.press('End'); require(await input.inputValue() === '1.95', 'End did not synchronize');
        await frame.locator('[data-geometry-reset]').click(); require(await input.inputValue() === '1' && await area() === 4, 'Reset mismatch');
        const summary = frame.getByText('推导与限制（固定题设）', { exact: true }); await summary.focus(); await summary.press('Enter');
        require(await frame.getByText('滑块只覆盖 0.05≤q≤1.95，避免退化端点。直接输入使用同一范围。本文只研究上述固定圆与等腰三角形模型，没有声称适用于任意多边形。', { exact: true }).isVisible(), 'Derivation not operable');
        require(await frame.locator('.cui-document').first().textContent() === fixed, 'Fixed problem changed');
        const frameWidth = await frame.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        const outer = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        require(frameWidth.scroll <= frameWidth.client + 1 && outer.scroll <= outer.client + 1, 'Horizontal overflow');
        // Viewport captures repaint each visible opaque-iframe region. Chromium
        // full-page captures can omit offscreen iframe pixels despite live DOM.
        await frame.locator('h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${config.screenshots}/g09-${width}-${theme}-top.png` });
        await input.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${config.screenshots}/g09-${width}-${theme}-controls.png` });
        await summary.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${config.screenshots}/g09-${width}-${theme}-derivation.png` });
        return { areaAtOptimum: 3 * Math.sqrt(3), frameWidth, outer };
      });
      await run(`G10 form/validation/keyboard/snapshot/restore/reset ${width}px ${theme}`, async () => {
        let frame = await open('G10', width, theme);
        require(await frame.locator('form').count() === 0, 'Native form would require sandbox permissions');
        await frame.getByRole('button', { name: '提交快照', exact: true }).click();
        const title = frame.getByRole('textbox', { name: '实验名称（必填）', exact: true });
        require(await title.getAttribute('aria-invalid') === 'true', 'No required error');
        require(await title.evaluate(node => node === document.activeElement), 'First error not focused');
        await title.fill('合成实验'); await frame.getByRole('spinbutton').fill('8');
        await frame.getByRole('combobox').selectOption('compare');
        await frame.getByRole('radio', { name: '当前实验', exact: true }).focus(); await page.keyboard.press('Space');
        await frame.getByRole('checkbox').focus(); await page.keyboard.press('Space');
        await frame.getByRole('textbox', { name: '观察记录', exact: true }).fill('只用于合成测试');
        await title.press('Enter'); require(await frame.locator('[data-form-result]').isVisible(), 'Enter submit did not create snapshot');
        const result = await frame.locator('[data-form-result]').textContent(); require(result.includes('合成实验') && result.includes('8') && result.includes('对比记录') && result.includes('当前实验') && result.includes('是'), 'Snapshot mismatch');
        await page.locator('#reload').click(); await page.waitForFunction(() => document.body.dataset.status === 'ready');
        frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
        await frame.locator('[data-form-result]:not([hidden])').waitFor(); require(await frame.getByRole('textbox', { name: '实验名称（必填）', exact: true }).inputValue() === '合成实验', 'State restore mismatch');
        await frame.getByRole('spinbutton').fill('101'); await frame.getByRole('button', { name: '提交快照', exact: true }).click();
        require(await frame.getByRole('spinbutton').getAttribute('aria-invalid') === 'true' && !await frame.locator('[data-form-result]').isVisible(), 'Invalid state remained submitted');
        await frame.getByRole('button', { name: '重置', exact: true }).click(); require(await frame.getByRole('spinbutton').inputValue() === '4', 'Initial number not reset');
        require(await frame.getByRole('textbox', { name: '实验名称（必填）', exact: true }).inputValue() === '', 'Draft not reset');
        const dimensions = await frame.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); require(dimensions.scroll <= dimensions.client + 1, 'Form overflow');
        await frame.locator('h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${config.screenshots}/g10-${width}-${theme}-top.png` });
        await frame.getByRole('checkbox').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${config.screenshots}/g10-${width}-${theme}-controls.png` }); return { restored: true, dimensions };
      });
    }
    await run('G09/G10/G01/G05 scene navigation and existing contracts', async () => {
      await open('G09', 390, 'light');
      for (const scene of ['G10', 'G01', 'G05']) {
        // Keyboard activation also avoids pointer layout changes during resizing.
        const button = page.locator(`[data-scene="${scene}"]`); await button.focus(); await button.press('Enter');
        await page.waitForFunction(scene => document.body.dataset.currentScene === scene && document.body.dataset.status === 'ready', scene);
      }
      return { scenes: ['G09', 'G10', 'G01', 'G05'] };
    });
  } finally { page.off('console', onError); page.off('pageerror', onPageError); }
  return { status: checks.every(check => check.status === 'PASS') && !errors.length && !requests.length ? 'PASS' : 'FAIL', checks, errors, blockedExternalRequests: requests };
};
