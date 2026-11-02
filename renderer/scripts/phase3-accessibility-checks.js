// Automatic semantics and actual keyboard paths; not manual screen-reader acceptance.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const checks = [], errors = [], requests = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => requests.push({ url: request.url(), type: request.resourceType() });
  page.on('pageerror', onError); page.on('request', onRequest);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const open = async (scene, theme = 'light', width = 390) => {
    await page.setViewportSize({ width, height: 900 });
    const url = new URL(config.url); url.searchParams.set('scene', scene); url.searchParams.set('theme', theme); url.searchParams.set('width', String(width));
    await page.goto(url.href);
    await page.waitForFunction(scene => document.body.dataset.currentScene === scene && ['ready', 'native', 'rejection'].includes(document.body.dataset.status), scene);
    if (scene === 'G06') return null;
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    await page.locator('#gallery-frame').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await frame.evaluate(() => document.fonts.ready);
    return frame;
  };
  const run = async (name, callback) => {
    try { checks.push({ name, status: 'PASS', ...await callback() }); }
    catch (error) { checks.push({ name, status: 'FAIL', error: error.message }); }
  };
  // Read the rendered DOM in its own document; all iframe values use the
  // actual host background because the renderer intentionally is transparent.
  const audit = (outerBackground) => {
    const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[hidden],[aria-hidden="true"]');
    const name = node => {
      const labelled = node.getAttribute('aria-labelledby');
      if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      return (node.getAttribute('aria-label') || (node.labels ? [...node.labels].map(label => label.textContent).join(' ') : '') || (node.tagName === 'INPUT' ? node.getAttribute('title') : node.textContent) || '').trim();
    };
    const parse = value => {
      if (value === 'transparent') return [0, 0, 0, 0];
      const parts = value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
      if (value.startsWith('color(srgb ')) return [...parts.slice(0, 3), parts[3] ?? 1];
      if (value.startsWith('rgb')) return [...parts.slice(0, 3).map(channel => channel / 255), parts[3] ?? 1];
      throw new Error(`Unparsed computed color: ${value}`);
    };
    const over = (front, back) => front.slice(0, 3).map((channel, i) => channel * front[3] + back[i] * (1 - front[3])).concat(1);
    const luminance = rgba => rgba.slice(0, 3).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const background = node => {
      const ancestors = []; for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
      return ancestors.reduce((color, ancestor) => over(parse(getComputedStyle(ancestor).backgroundColor), color), parse(outerBackground));
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(node => ({ level: Number(node.tagName.slice(1)), text: node.textContent.trim() }));
    const controls = [...document.querySelectorAll('button,input,select,textarea,summary')].filter(node => visible(node) && !node.disabled).map(node => {
      const target = node.matches('input[type="radio"],input[type="checkbox"]') ? node.closest('label') || node : node;
      const bounds = target.getBoundingClientRect();
      return { tag: node.tagName, type: node.type || null, role: node.getAttribute('role'), name: name(node), height: bounds.height, width: bounds.width };
    });
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    const references = [...document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')].map(node => ({
      tag: node.tagName, role: node.getAttribute('role'),
      missing: ['aria-labelledby', 'aria-describedby', 'aria-controls'].flatMap(attribute => (node.getAttribute(attribute) || '').split(/\s+/).filter(Boolean).filter(id => !document.getElementById(id))),
    }));
    const math = [...document.querySelectorAll('math')].filter(visible).map(node => ({ name: name(node), text: node.textContent.trim().slice(0, 160) }));
    const images = [...document.querySelectorAll('[role="img"]')].filter(visible).map(node => ({ name: name(node), description: node.getAttribute('aria-labelledby') }));
    const fieldsets = [...document.querySelectorAll('fieldset')].filter(visible).map(node => ({ legend: node.querySelector('legend')?.textContent.trim() || '', radioCount: node.querySelectorAll('input[type="radio"]').length }));
    const tabs = [...document.querySelectorAll('[role="tablist"]')].filter(visible).map(node => ({ name: name(node), tabs: [...node.querySelectorAll('[role="tab"]')].map(tab => ({ name: name(tab), selected: tab.getAttribute('aria-selected'), tabIndex: tab.tabIndex, panel: tab.getAttribute('aria-controls') })) }));
    const text = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode.parentElement, content = walker.currentNode.textContent.trim();
      if (!content || !visible(node) || node.closest('script,style,svg,math,[disabled]')) continue;
      const style = getComputedStyle(node), bg = background(node), fg = over(parse(style.color), bg);
      const a = luminance(fg), b = luminance(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.6667 && Number(style.fontWeight) >= 700;
      text.push({ text: content.slice(0, 100), ratio, required: large ? 3 : 4.5, fontSize: style.fontSize, color: style.color, background: bg });
    }
    const animations = document.getAnimations().filter(animation => animation.playState === 'running').length;
    return { language: document.documentElement.lang, title: document.title, headings, controls, duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i), references, math, images, fieldsets, tabs, contrast: { samples: text.length, minimumRatio: Math.min(...text.map(sample => sample.ratio)), failures: text.filter(sample => sample.ratio + .01 < sample.required) }, runningAnimations: animations };
  };
  try {
    for (const scene of ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08']) for (const theme of ['light', 'dark']) {
      await run(`${scene} ${theme}: headings, landmarks, names, targets, reference integrity, contrast, accessible text`, async () => {
        const frame = await open(scene, theme);
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const outer = await page.evaluate(audit, background);
        const landmarks = await page.evaluate(() => ({ main: document.querySelectorAll('main,[role="main"]').length, navigation: document.querySelectorAll('nav[aria-label]').length, banner: document.querySelectorAll('header').length, contentinfo: document.querySelectorAll('footer').length, frameTitle: document.querySelector('#gallery-frame')?.title || null }));
        require(landmarks.main === 1 && landmarks.navigation >= 1 && landmarks.banner >= 1 && landmarks.contentinfo >= 1, 'Gallery landmarks incomplete');
        const inner = frame ? await frame.evaluate(audit, background) : null;
        for (const [surface, values] of [['Gallery', outer], ['Renderer', inner]]) {
          if (!values) continue;
          require(values.language && values.title, `${surface} missing language/title`);
          require(values.headings[0]?.level === 1 && values.headings.every((heading, i, headings) => !i || heading.level <= headings[i - 1].level + 1), `${surface} skipped/missing heading level`);
          require(values.controls.length > 0 && values.controls.every(control => control.name && control.height >= 44 && control.width >= 44), `${surface} unnamed/small interactive target`);
          require(!values.duplicateIds.length && values.references.every(reference => !reference.missing.length), `${surface} duplicate or broken ARIA reference`);
          require(values.contrast.samples > 0 && !values.contrast.failures.length, `${surface} visible text contrast failed: ${JSON.stringify(values.contrast.failures.slice(0, 5))}`);
          require(values.math.every(item => item.name && item.text) && values.images.every(item => item.name), `${surface} math/diagram has no accessible name/text`);
          require(values.fieldsets.every(fieldset => fieldset.legend && fieldset.radioCount >= 2), `${surface} Quiz group lacks legend/options`);
          require(values.tabs.every(tablist => tablist.name && tablist.tabs.filter(tab => tab.selected === 'true' && tab.tabIndex === 0).length === 1 && tablist.tabs.every(tab => tab.name && tab.panel && (tab.selected === 'true' || tab.tabIndex === -1))), `${surface} tab semantics invalid`);
        }
        if (frame) require(landmarks.frameTitle, 'Opaque Renderer frame lacks title');
        const browserAriaSnapshot = { outer: await page.locator('body').ariaSnapshot(), inner: frame ? await frame.locator('#chatui-component').ariaSnapshot() : null };
        require(browserAriaSnapshot.outer.includes('离线知识 Gallery'), 'Browser accessibility snapshot lost Gallery title');
        if (frame) {
          const title = await frame.locator('h1').first().textContent();
          require(title && browserAriaSnapshot.inner.includes(title), 'Browser accessibility snapshot lost Renderer title');
          for (const question of config.quizOracle[scene] || []) require(!browserAriaSnapshot.inner.includes(question.explanation), 'Accessibility snapshot disclosed pre-submit Quiz explanation');
        }
        return { scene, theme, mode: config.mode, landmarks, outer, inner, browserAriaSnapshot, scope: 'Automatic rendered DOM/ARIA snapshot/text contrast; not platform VoiceOver or manual screen reader' };
      });
    }
    await run('G05 actual Tab/Shift+Tab into and out of selected tab panel', async () => {
      const frame = await open('G05');
      const tab = frame.getByRole('tab').first();
      await tab.focus(); await tab.press('Tab');
      const entered = await frame.evaluate(() => ({ role: document.activeElement.getAttribute('role'), id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineWidth }));
      require(entered.role === 'tabpanel' && entered.outline !== '0px', 'Tab failed to enter visible selected tab panel with focus indication');
      await frame.locator(`#${entered.id}`).press('Shift+Tab');
      require(await tab.evaluate(node => document.activeElement === node), 'Shift+Tab failed to return selected tab');
      return { entered, reverseFocusReturned: true };
    });
    await run('G08 actual ArrowRight/Left radios, Enter submit, Space retry and live status', async () => {
      const frame = await open('G08');
      const fieldset = frame.locator('fieldset').first(), radios = fieldset.getByRole('radio');
      await radios.first().focus(); await radios.first().press('Space'); await radios.first().press('ArrowRight');
      require(await radios.nth(1).isChecked() && await radios.nth(1).evaluate(node => document.activeElement === node), 'ArrowRight failed in native Quiz radio group');
      await radios.nth(1).press('ArrowLeft'); require(await radios.first().isChecked(), 'ArrowLeft failed in native Quiz radio group');
      for (let i = 1; i < await frame.locator('fieldset').count(); i++) { const radio = frame.locator('fieldset').nth(i).getByRole('radio').first(); await radio.focus(); await radio.press('Space'); }
      const submit = frame.getByRole('button', { name: '提交答案', exact: true }); await submit.focus(); await submit.press('Enter');
      await frame.locator('.cui-result').waitFor({ state: 'visible' });
      const result = await frame.locator('.cui-result').textContent(); require(result.includes('正确'), 'Keyboard submit lacks readable result');
      const retry = frame.getByRole('button', { name: '重新测试', exact: true }); await retry.focus(); await retry.press('Space');
      require(!await frame.locator('.cui-result,.cui-feedback').count() && !await radios.first().isChecked(), 'Keyboard retry failed safe reset');
      return { arrowKeys: true, submitKey: 'Enter', retryKey: 'Space', readableResult: result };
    });
    for (const scene of ['G01', 'G03', 'G05', 'G08']) for (const theme of ['light', 'dark']) {
      await run(`${scene} ${theme}: 200% CSS zoom and narrow reflow surrogate`, async () => {
        const frame = await open(scene, theme, 1024);
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        await page.locator('#gallery-frame').evaluate(node => node.scrollIntoView({ block: 'start' }));
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const outer = await page.evaluate(() => ({ zoom: getComputedStyle(document.documentElement).zoom, overflow: document.documentElement.scrollWidth - innerWidth, viewportWidth: innerWidth, framePhysicalWidth: document.querySelector('#gallery-frame').getBoundingClientRect().width }));
        const inner = await frame.evaluate(() => ({ viewportWidth: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, visibleControls: [...document.querySelectorAll('button,input,select,summary')].filter(node => node.getClientRects().length && !node.disabled).length, textLength: document.querySelector('#chatui-component').textContent.length }));
        require(outer.zoom === '2' && outer.overflow <= 1 && inner.overflow <= 1 && inner.visibleControls > 0 && inner.textLength > 100, 'Zoom causes whole-document overflow, missing content or inaccessible controls');
        if (scene === 'G01') { const slider = frame.getByRole('slider'); const initial = Number(await slider.inputValue()); await slider.focus(); await slider.press('ArrowRight'); require(Number(await slider.inputValue()) > initial, 'Zoomed geometry keyboard unusable'); }
        if (scene === 'G08') { const radio = frame.getByRole('radio').first(); await radio.focus(); await radio.press('Space'); require(await radio.isChecked(), 'Zoomed Quiz keyboard unusable'); }
        await page.evaluate(() => { document.documentElement.style.zoom = ''; });
        return { scene, theme, outer, inner, scope: 'CSS zoom=2 in real browser plus iframe reflow; native browser UI zoom and text-only zoom NOT RUN' };
      });
    }
    await run('Reduced motion: computed no-animation/no-transition and actual controls remain usable', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const frame = await open('G03');
      const reduced = await frame.evaluate(() => ({ matches: matchMedia('(prefers-reduced-motion: reduce)').matches, offending: [...document.querySelectorAll('#chatui-component,#chatui-component *')].filter(node => node.getClientRects().length).map(node => ({ tag: node.tagName, animation: getComputedStyle(node).animationName, duration: getComputedStyle(node).transitionDuration, scroll: getComputedStyle(node).scrollBehavior })).filter(style => style.animation !== 'none' || style.duration.split(',').some(duration => parseFloat(duration) !== 0) || style.scroll !== 'auto'), runningAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length }));
      require(reduced.matches && !reduced.offending.length && reduced.runningAnimations === 0, 'Reduced-motion policy not reflected in computed rendered styles');
      const slider = frame.getByRole('slider', { name: '观察时间 t，单位s', exact: true }); await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight'); require(Number(await slider.inputValue()) > 0, 'Reduced-motion disabled core interaction');
      return reduced;
    });
    const base = new URL(config.url);
    const forbiddenRequests = requests.filter(request => { const url = new URL(request.url); return url.origin !== base.origin || url.pathname !== base.pathname; });
    return { status: checks.some(check => check.status !== 'PASS') || errors.length || forbiddenRequests.length ? 'FAIL' : 'PASS', mode: config.mode, browser: page.context().browser().version(), checks, pageErrors: errors, forbiddenRequests, manualVoiceOver: 'UNKNOWN / NOT RUN', nativeBrowserUIZoom: 'UNKNOWN / NOT RUN', scope: 'Automatic semantics, actual keyboard and CSS zoom; no manual screen-reader claim' };
  } finally { page.off('pageerror', onError); page.off('request', onRequest); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => { document.documentElement.style.zoom = ''; }).catch(() => {}); }
}
