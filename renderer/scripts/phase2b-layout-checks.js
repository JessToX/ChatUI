// One mode × G01–G08 × two themes × four widths = 64 actual layouts.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const layouts = [], failures = [], errors = [], requests = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => requests.push({ url: request.url(), type: request.resourceType() });
  page.on('pageerror', onError); page.on('request', onRequest);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const contrast = (foreground, background) => {
    const parse = color => {
      if (color.startsWith('color(srgb ')) return color.match(/[-+]?[\d.]+/g).slice(0, 3).map(Number);
      if (color.startsWith('rgb')) return color.match(/[-+]?[\d.]+/g).slice(0, 3).map(value => Number(value) / 255);
      throw new Error(`Unsupported computed color: ${color}`);
    };
    const luminance = color => parse(color).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  const screenshot = async path => {
    const viewport = page.viewportSize();
    const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path, fullPage: true });
    await page.setViewportSize(viewport);
  };
  try {
    for (const scene of ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08']) {
      for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1024]) {
        const result = { scene, theme, width, mode: config.mode, status: 'FAIL' };
        try {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(config.url);
          await page.locator('#theme').selectOption(theme);
          await page.locator('#width').selectOption(String(width));
          await page.locator(`button[data-scene="${scene}"]`).click();
          const expected = scene === 'G06' ? 'native' : scene === 'G08' ? 'rejection' : 'ready';
          await page.waitForFunction(({ scene, expected }) => document.body.dataset.currentScene === scene && document.body.dataset.status === expected, { scene, expected });
          result.actualMode = expected;
          result.outer = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - innerWidth,
            scene: document.body.dataset.currentScene, status: document.body.dataset.status,
            frameCount: document.querySelectorAll('#gallery-frame').length,
            visibleText: document.body.innerText.length,
            theme: document.documentElement.style.colorScheme || getComputedStyle(document.documentElement).colorScheme,
            foreground: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor,
            diagnostics: window.__galleryDiagnostics,
            controls: [...document.querySelectorAll('button,select,input,summary')].filter(node => node.getClientRects().length && !node.disabled).map(node => ({ tag: node.tagName, label: node.getAttribute('aria-label') || node.textContent.trim(), height: node.getBoundingClientRect().height })),
          }));
          require(result.outer.overflow <= 1, `Whole Gallery horizontal overflow: ${result.outer.overflow}`);
          require(result.outer.controls.every(control => control.height >= 44), 'Gallery controls below 44 CSS px');
          require(result.outer.visibleText > 120, 'Blank Gallery shell');
          result.outer.textContrast = contrast(result.outer.foreground, result.outer.background);
          require(result.outer.textContrast >= 4.5, 'Gallery primary text contrast below 4.5:1');
          if (scene === 'G06') {
            require(result.outer.frameCount === 0, 'Native reference mounted a widget');
            require(await page.getByText('静态原生文本参考', { exact: false }).count() > 0, 'Native reference identity missing');
          } else {
            const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
            await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
            await page.locator('#gallery-frame').evaluate(node => node.scrollIntoView({ block: 'start' }));
            await frame.evaluate(() => document.fonts.ready);
            await frame.waitForFunction(() => [...document.querySelectorAll('.cui-document-scroll-block')].every(wrapper => {
              const node = wrapper.firstElementChild, hint = wrapper.querySelector('.cui-document-scroll-hint');
              return hint.hidden === (node.scrollWidth <= node.clientWidth + 1);
            }));
            result.renderer = await frame.evaluate(() => {
              const root = document.querySelector('#chatui-component');
              const prose = [...root.querySelectorAll('.cui-document')];
              const outline = root.querySelector('.cui-document-outline');
              const controls = [...root.querySelectorAll('button,summary,input,select')].filter(node => node.getClientRects().length && !node.disabled);
              const scrolls = [...root.querySelectorAll('.cui-document-table,.cui-ex-math-scroll,pre')].filter(node => node.getClientRects().length);
              return {
                frameWidth: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
                status: document.querySelector('#chatui-status').hidden ? '' : document.querySelector('#chatui-status').textContent,
                bodyFont: getComputedStyle(root).fontSize,
                foreground: getComputedStyle(root).color,
                mutedForeground: getComputedStyle(root.querySelector('.cui-document-copy-status')).color,
                headingCount: root.querySelectorAll('.cui-document h2').length,
                headings: [...root.querySelectorAll('.cui-document h2')].map(node => node.textContent),
                outlineCount: outline?.querySelectorAll('li').length || 0,
                outlineHidden: outline?.hidden ?? true, outlineOpen: outline?.open ?? false,
                outlineInteractive: !!outline?.querySelector('a,button'),
                mathCount: root.querySelectorAll('math').length,
                visibleText: prose.reduce((total, node) => total + node.textContent.length, 0),
                firstText: prose[0]?.textContent.slice(0, 160), lastText: prose.at(-1)?.textContent.slice(-240),
                controls: controls.map(node => ({ tag: node.tagName, label: node.getAttribute('aria-label') || node.textContent.trim(), height: (node.matches('input[type=radio],input[type=checkbox]') ? node.closest('label') : node).getBoundingClientRect().height })),
                scrolling: scrolls.map(node => ({ kind: node.tagName, width: node.clientWidth, scrollWidth: node.scrollWidth, hint: !node.parentElement.querySelector('.cui-document-scroll-hint')?.hidden, tabIndex: node.getAttribute('tabindex'), role: node.getAttribute('role') })),
                headingsInOrder: [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node => Number(node.tagName.slice(1))),
                mathLabels: [...root.querySelectorAll('math')].map(node => node.getAttribute('aria-label')),
                diagnostics: window.__chatuiMetrics,
              };
            });
            require(result.renderer.frameWidth <= width && result.renderer.overflow <= 1, 'Renderer horizontal overflow');
            require(result.renderer.status === '', `Unexpected renderer error: ${result.renderer.status}`);
            require(result.renderer.controls.every(control => control.height >= 44), 'Renderer controls below 44 CSS px');
            require(result.renderer.visibleText >= (scene === 'G08' ? 60 : 120) && result.renderer.firstText && result.renderer.lastText, 'Missing first/last document content');
            require(result.renderer.mathLabels.every(label => typeof label === 'string' && label.length > 0), 'Unlabelled rendered math');
            result.renderer.primaryTextContrast = contrast(result.renderer.foreground, result.outer.background);
            result.renderer.mutedTextContrast = contrast(result.renderer.mutedForeground, result.outer.background);
            require(result.renderer.primaryTextContrast >= 4.5 && result.renderer.mutedTextContrast >= 4.5, 'Renderer primary/secondary text contrast below 4.5:1');
            require(result.renderer.headingsInOrder.every((level, index, levels) => index === 0 || level <= levels[index - 1] + 1), 'Skipped heading levels');
            require(!result.renderer.outlineOpen && !result.renderer.outlineInteractive, 'Outline is open/interactive by default');
            if (scene === 'G08') {
              require(await frame.locator('.cui-feedback,.cui-result').count() === 0, 'G08 mounted pre-submit grading');
              require(result.renderer.firstText.includes('测验开始') && result.renderer.lastText.includes('测验结束'), 'G08 Quiz first/last content missing');
              require(await page.getByText('拒绝', { exact: false }).count() > 0 && !await page.getByText('验证成功', { exact: false }).count(), 'G08 rejection identity missing/fake success');
            }
            if (scene === 'G05') require(result.renderer.headingCount === 8 && result.renderer.outlineCount === 8 && !result.renderer.outlineHidden && result.renderer.lastText.includes('完整文档到此结束'), 'G05 eight complete sections/default static outline missing');
            for (const region of result.renderer.scrolling) {
              const overflow = region.scrollWidth > region.width + 1;
              require(overflow === region.hint && (overflow ? region.tabIndex === '0' && region.role === 'region' : region.tabIndex === null && region.role === null), `Incorrect local overflow accessibility: ${JSON.stringify(region)}`);
            }
          }
          await screenshot(`${config.screenshots}/${config.mode}-${scene.toLowerCase()}-${theme}-${width}.png`);
          result.capture = { method: 'Full-height viewport at the same CSS width to include opaque iframe paint; layout measurements precede capture at 900 CSS px height', layoutViewportHeight: 900 };
          result.status = 'PASS';
        } catch (error) {
          result.error = error.message;
          failures.push({ scene, theme, width, error: error.message });
          await screenshot(`${config.screenshots}/${config.mode}-${scene.toLowerCase()}-${theme}-${width}-FAIL.png`).catch(() => {});
        }
        layouts.push(result);
      }
    }
    const forbiddenRequests = requests.filter(request => request.url !== config.url);
    return { status: failures.length || errors.length || forbiddenRequests.length ? 'FAIL' : 'PASS', browser: page.context().browser().version(), mode: config.mode, count: layouts.length, layouts, failures, pageErrors: errors, requestCount: requests.length, forbiddenRequests };
  } finally { page.off('pageerror', onError); page.off('request', onRequest); }
}
