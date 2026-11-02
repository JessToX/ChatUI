// Actual browser vertical slice; the same entry runs under file and loopback HTTP.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const errors = [], requests = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => requests.push({ url: request.url(), type: request.resourceType() });
  page.on('pageerror', onError); page.on('request', onRequest);
  const require = (value, message) => { if (!value) throw new Error(message); };
  const screenshot = async path => {
    const viewport = page.viewportSize(); const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path, fullPage: true }); await page.setViewportSize(viewport);
  };
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(config.url);
    await page.locator('button[data-scene="G01"]').click();
    await page.waitForFunction(() => document.body.dataset.currentScene === 'G01' && document.body.dataset.status === 'ready');
    const handle = await page.locator('#gallery-frame').elementHandle();
    const frame = await handle.contentFrame();
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    const slider = frame.getByRole('slider', { name: '三角形高度与圆半径之比 h/r' });
    require(await slider.inputValue() === '1', 'G01 must begin at h/r = 1');
    await page.evaluate(() => {
      window.__phase2bObservedStates = [];
      window.addEventListener('message', event => {
        if (event.source === document.querySelector('#gallery-frame')?.contentWindow && event.data?.channel === 'chatui-offline-v1' && event.data.op === 'state') window.__phase2bObservedStates.push(event.data.state);
      });
    });
    await slider.focus();
    for (let i = 0; i < 50; i++) await slider.press('ArrowRight');
    require(await slider.inputValue() === '1.5', 'Actual ArrowRight input failed to reach h/r = 1.5');
    const text = await frame.locator('.cui-values').allTextContents();
    require(text.join(' ').includes('面积 A ≈ 5.2') && text.join(' ').includes('cm²'), 'Rounded golden area must be distinguished from exact 3√3 cm²');
    require(text.join(' ').includes('底边 b=2x ≈ 3.46'), 'Rounded golden base must be distinguished from exact 2√3 cm');
    const observed = await page.evaluate(() => window.__phase2bObservedStates.at(-1));
    const geometry = observed?.modelContent?.blocks?.find(block => block.component === 'geometry');
    require(geometry?.height === 3 && Math.abs(2 * geometry.halfBase - 3.4641016151377546) < 1e-10 && Math.abs(geometry.area - 5.196152422706632) < 1e-10, 'Actual interaction state differs from independent golden');
    require(await slider.evaluate(node => getComputedStyle(node).outlineWidth !== '0px'), 'Slider keyboard focus is invisible');
    const sandbox = await page.locator('#gallery-frame').getAttribute('sandbox');
    require(sandbox === 'allow-scripts', 'Gallery frame isolation changed');
    require(await page.evaluate(() => document.querySelector('#gallery-frame').contentDocument === null), 'Sandbox became same-origin');
    require(requests.every(request => request.url === config.url), `Gallery fetched runtime resources: ${JSON.stringify(requests)}`);
    require(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
    await screenshot(`${config.screenshots}/${config.mode}-g01-vertical-slice.png`);
    return { status: 'PASS', browser: page.context().browser().version(), mode: config.mode, sandbox, initialRatio: 1, actualKeyboardRatio: 1.5, golden: { height: 3, base: 3.4641016151377546, area: 5.196152422706632 }, actualState: geometry, displayedValues: text, requests, pageErrors: errors };
  } finally { page.off('pageerror', onError); page.off('request', onRequest); }
}
