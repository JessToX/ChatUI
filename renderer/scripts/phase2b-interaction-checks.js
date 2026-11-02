// Actual controls/keys/Clipboard. Explicit faults are labelled as injected faults.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const checks = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const activate = async selector => { const control = page.locator(selector); await control.focus(); await control.press('Enter'); };
  const screenshot = async path => {
    const viewport = page.viewportSize(); const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path, fullPage: true }); await page.setViewportSize(viewport);
  };
  const open = async (scene, width = 390, theme = 'light') => {
    await page.setViewportSize({ width, height: 900 });
    const url = new URL(config.url); url.searchParams.set('scene', scene); url.searchParams.set('width', String(width)); url.searchParams.set('theme', theme);
    await page.goto(url.href);
    await page.waitForFunction(scene => document.body.dataset.currentScene === scene && ['ready', 'native', 'rejection'].includes(document.body.dataset.status), scene);
    if (scene === 'G06') return null;
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    // Overflow hints are measured on a paint opportunity when content enters
    // the viewport. Perform the real reading scroll before waiting for them.
    await page.locator('#gallery-frame').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await frame.waitForFunction(() => [...document.querySelectorAll('.cui-document-scroll-block')].every(wrapper => {
      const node = wrapper.firstElementChild, hint = wrapper.querySelector('.cui-document-scroll-hint');
      return hint.hidden === (node.scrollWidth <= node.clientWidth + 1);
    }));
    return frame;
  };
  const frameNow = async () => {
    await page.waitForFunction(() => ['ready', 'rejection'].includes(document.body.dataset.status));
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    return frame;
  };
  const run = async (name, callback) => {
    try { checks.push({ name, status: 'PASS', ...await callback() }); }
    catch (error) { checks.push({ name, status: 'FAIL', error: error.message }); await screenshot(`${config.screenshots}/${config.mode}-interaction-${checks.length}-FAIL.png`).catch(() => {}); }
  };
  try {
    await run('G01 Home/End, restored real geometry state, reset', async () => {
      let frame = await open('G01');
      const slider = frame.getByRole('slider');
      await slider.focus(); await slider.press('Home'); require(await slider.inputValue() === '0.05', 'Lower range endpoint');
      await slider.press('End'); require(await slider.inputValue() === '1.95', 'Upper range endpoint');
      const generations = [await page.evaluate(() => window.__galleryDiagnostics.generation)];
      await activate('#reload'); frame = await frameNow();
      generations.push(await page.evaluate(() => window.__galleryDiagnostics.generation));
      require(await frame.getByRole('slider').inputValue() === '1.95', 'Reload lost actual state');
      await activate('#reset'); frame = await frameNow();
      generations.push(await page.evaluate(() => window.__galleryDiagnostics.generation));
      require(await frame.getByRole('slider').inputValue() === '1', 'Reset failed');
      require(generations[1] === generations[0] + 1 && generations[2] === generations[1] + 1, 'Keyboard parent controls did not replace the frame');
      return { endpoints: [0.05, 1.95], restored: 1.95, reset: 1, actualParentControlOperation: 'focus + Enter', generations };
    });
    await run('G03 real motion time keyboard/golden and force projection/resultant controls', async () => {
      const frame = await open('G03');
      const near = (actual, expected, label) => require(Math.abs(actual - expected) <= 1e-10, `${label}: ${actual} != independent ${expected}`);
      const time = frame.getByRole('slider', { name: '观察时间 t，单位s', exact: true });
      const cases = [];
      const measure = async expected => {
        const values = await frame.locator('[data-motion-output]').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.motionOutput, { value: Number(node.dataset.value), text: node.textContent }])));
        near(Number(await time.inputValue()), expected.time, 'Time'); near(values.position.value, expected.position, 'Position'); near(values.velocity.value, expected.velocity, 'Velocity');
        require(values.position.text.includes(' m') && values.velocity.text.includes('m/s'), 'Motion lost SI units');
        const points = await frame.locator('[data-motion-point]').evaluateAll(nodes => nodes.map(node => ({ kind: node.dataset.motionPoint, time: Number(node.dataset.time), value: Number(node.dataset.value) })));
        for (const point of points) { near(point.time, expected.time, 'Plot time'); near(point.value, expected[point.kind === 'position' ? 'position' : 'velocity'], 'Plot value'); }
        cases.push({ ...expected, values, points });
      };
      await time.focus(); await time.press('Home'); await measure(config.golden.motion.cases[0]);
      await time.press('End'); await measure(config.golden.motion.cases[2]);
      await time.press('Home'); for (let i = 0; i < 50; i++) await time.press('ArrowRight'); await measure(config.golden.motion.cases[1]);
      const decomposition = frame.getByRole('checkbox', { name: '显示所选力的分解', exact: true });
      await decomposition.focus(); await decomposition.press('Space'); require(await decomposition.isChecked(), 'Actual projection Space failed');
      await frame.getByRole('combobox', { name: '选择要分解的真实作用力' }).selectOption('normal');
      const projection = await frame.locator('[data-projection-values]').evaluate(node => ({ x: Number(node.dataset.fxPrime), y: Number(node.dataset.fyPrime), text: node.textContent, visible: !node.hidden }));
      near(projection.x, 0, 'Normal tangent projection'); near(projection.y, config.golden.incline.normalN, 'Normal perpendicular projection'); require(projection.visible && projection.text.includes('N'), 'Projection not visible/in N');
      const realForces = await frame.locator('[data-force-kind="real"]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.forceId, fx: Number(node.dataset.fx), fy: Number(node.dataset.fy), magnitude: Number(node.dataset.magnitude) })));
      require(realForces.length === 2, 'Projection invented a third real force');
      const normal = realForces.find(force => force.id === 'normal'); near(normal.fx, config.golden.incline.normalVectorN[0], 'Normal Fx'); near(normal.fy, config.golden.incline.normalVectorN[1], 'Normal Fy'); near(normal.magnitude, config.golden.incline.normalN, 'Normal magnitude');
      const resultantToggle = frame.getByRole('checkbox', { name: '显示合力', exact: true }); await resultantToggle.focus(); await resultantToggle.press('Space');
      const resultant = await frame.locator('[data-force-sum]').evaluate(node => ({ fx: Number(node.dataset.fx), fy: Number(node.dataset.fy), magnitude: Number(node.dataset.magnitude), visible: !node.hidden, text: node.textContent }));
      near(resultant.fx, config.golden.incline.netVectorN[0], 'Resultant Fx'); near(resultant.fy, config.golden.incline.netVectorN[1], 'Resultant Fy'); near(resultant.magnitude, config.golden.incline.netN, 'Resultant magnitude');
      require(resultant.visible && resultant.text.includes('N') && await frame.locator('[data-force-kind="resultant"]').count() === 1, 'Resultant toggle did not draw actual resultant');
      await screenshot(`${config.screenshots}/${config.mode}-g03-motion-force-golden.png`);
      await resultantToggle.press('Space'); require(!await resultantToggle.isChecked() && !await frame.locator('[data-force-kind="resultant"]').count(), 'Resultant hide failed');
      await decomposition.press('Space'); require(!await decomposition.isChecked() && !await frame.locator('[data-force-kind="component"]').count(), 'Projection hide failed');
      return { independentOracle: 'renderer/examples/math-physics-golden.json', cases, projection, realForces, resultant };
    });
    await run('Gallery actual Tab sequence, Enter navigation, focus labels', async () => {
      await open('G01');
      await page.locator('button[data-scene="G01"]').focus();
      const sequence = [];
      for (let i = 1; i <= 8; i++) {
        sequence.push(await page.evaluate(() => ({ scene: document.activeElement.dataset.scene, tag: document.activeElement.tagName, focus: getComputedStyle(document.activeElement).outlineWidth })));
        if (i < 8) await page.keyboard.press('Tab');
      }
      require(sequence.every((node, i) => node.scene === `G0${i + 1}` && node.focus !== '0px'), 'Gallery Tab order/focus incorrect');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.dataset.currentScene === 'G08' && document.body.dataset.status === 'rejection');
      await page.keyboard.press('Tab');
      require(await page.locator('#theme').evaluate(node => document.activeElement === node), 'Tab did not reach theme control');
      return { sequence };
    });
    await run('G04 Enter/Space collapse, six argument nodes, narrow reading order', async () => {
      const frame = await open('G04');
      const summary = frame.locator('.cui-collapse > summary').first();
      await summary.focus(); await summary.press('Enter');
      require(await frame.locator('.cui-collapse').first().evaluate(node => node.open), 'Enter did not open disclosure');
      require(await frame.getByText('反例 A：', { exact: false }).first().isVisible(), 'Counterexample not visible');
      await summary.press('Space'); require(!await frame.locator('.cui-collapse').first().evaluate(node => node.open), 'Space did not close disclosure');
      const comparison = await frame.locator('.cui-compare').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, top: node.getBoundingClientRect().top, whiteSpace: getComputedStyle(node.querySelector('.cui-values') || node.querySelector('p')).whiteSpace })));
      require(comparison.length === 2 && comparison[0].top < comparison[1].top && comparison.every(node => node.whiteSpace === 'pre-line'), 'G04 argument reading order/line breaks');
      for (const key of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']) require(comparison.some(node => node.text.includes(key)), `Missing ${key}`);
      await screenshot(`${config.screenshots}/${config.mode}-g04-keyboard-argument.png`);
      return { comparison };
    });
    await run('G05 verified local chapter navigation, ArrowLeft/Right Home/End tabs', async () => {
      const frame = await open('G05');
      const outline = frame.locator('details.cui-document-outline');
      require(!await outline.evaluate(node => node.open), 'Outline starts expanded');
      require(await outline.locator('li').count() === 8 && await outline.locator('button').count() === 8, 'Outline is not eight local chapter controls');
      const summary = outline.locator('summary'); await summary.focus(); await summary.press('Enter');
      require(await outline.evaluate(node => node.open), 'Outline Enter failed');
      await summary.press('Space'); require(!await outline.evaluate(node => node.open), 'Outline Space failed');
      const tabs = frame.getByRole('tab');
      await tabs.first().focus(); await tabs.first().press('ArrowRight'); require(await tabs.nth(1).getAttribute('aria-selected') === 'true', 'ArrowRight tab failed');
      await tabs.nth(1).press('Home'); require(await tabs.first().getAttribute('aria-selected') === 'true', 'Home tab failed');
      await tabs.first().press('End'); require(await tabs.last().getAttribute('aria-selected') === 'true', 'End tab failed');
      await tabs.last().press('ArrowLeft'); require(await tabs.first().getAttribute('aria-selected') === 'true', 'ArrowLeft tab failed');
      await tabs.first().press('ArrowRight');
      await frame.getByRole('tabpanel').filter({ visible: true }).screenshot({ path: `${config.screenshots}/${config.mode}-g05-alternative-tab.png` });
      return { outlineCount: 8, tabCount: await tabs.count() };
    });
    await run('G05 actual keyboard scroll, complete selectability and overflow hints', async () => {
      const frame = await open('G05');
      const measurements = [];
      for (const [kind, selector] of [['math', '.cui-ex-math-scroll.cui-document-overflow'], ['table', '.cui-document-table.cui-document-overflow'], ['code', 'pre.cui-document-overflow']]) {
        const region = frame.locator(selector).first(); await region.waitFor(); await region.evaluate(node => node.scrollIntoView({ block: 'center' }));
        await region.evaluate(node => { node.scrollLeft = 0; }); await region.focus(); await region.press('ArrowRight'); await region.press('ArrowRight');
        await frame.waitForFunction(selector => document.querySelector(selector).scrollLeft > 0, selector);
        const measurement = await region.evaluate(node => {
          const range = document.createRange(); range.selectNodeContents(node); const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range);
          return { scrollLeft: node.scrollLeft, focus: getComputedStyle(node).outlineWidth, selectedCharacters: selected.toString().length, hintInSelection: selected.toString().includes('横向滚动') };
        });
        require(measurement.scrollLeft > 0 && measurement.focus !== '0px' && measurement.selectedCharacters > 0 && !measurement.hintInSelection, `${kind} cannot be read/selected by keyboard`);
        await frame.evaluate(() => window.getSelection().removeAllRanges()); measurements.push({ kind, ...measurement });
      }
      return { measurements };
    });
    await run('Real local Clipboard writes equal full same-source fallback', async () => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copied = [];
      for (const scene of ['G04', 'G05', 'G07', 'G08']) {
        const frame = await open(scene, 768);
        await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
        await frame.getByText('已复制完整文档。', { exact: true }).waitFor();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        require(text === config.fallbacks[scene], `Clipboard ${scene} differs from complete safe fallback`);
        require(!text.includes('章节概览') && !text.includes('横向滚动'), 'Copy contains reading controls');
        if (scene === 'G05') for (const marker of ['[SYN-E05]', '[SYN-E04-A]', '[SYN-E04-B]', 'A-03、A-09、B-04、B-11', '完整文档到此结束']) require(text.includes(marker), `Complete copy missing ${marker}`);
        if (scene === 'G08') require(!text.includes('正确答案：') && !text.includes('正确选项') && !text.includes('解题解析'), 'Unsubmitted Quiz leaked grading');
        copied.push({ scene, characters: text.length, exactFallbackEquality: true });
      }
      await page.context().clearPermissions();
      return { copied };
    });
    await run('Injected Clipboard denial/API absence: full read-only fallback and Escape focus return', async () => {
      const faults = [];
      for (const fault of ['denied', 'absent']) {
        const frame = await open('G05');
        await page.evaluate(fault => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: fault === 'absent' ? undefined : { writeText: async () => { throw new DOMException('QA injected denial', 'NotAllowedError'); } } }), fault);
        await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
        const area = frame.getByRole('textbox', { name: '完整文档文本（只读，可手动选择复制）' }); await area.waitFor({ state: 'visible' });
        require(await area.inputValue() === config.fallbacks.G05, 'Manual text lost closed/unselected content');
        const selection = await area.evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd, readOnly: node.readOnly }));
        require(selection.focused && selection.start === 0 && selection.end === config.fallbacks.G05.length && selection.readOnly, 'Manual text is not complete/selected/read-only');
        require(!await frame.getByText('已复制完整文档。', { exact: true }).count(), 'Clipboard reports fake success');
        await screenshot(`${config.screenshots}/${config.mode}-g05-copy-${fault}.png`);
        await area.press('Escape'); require(!await area.isVisible(), 'Escape failed');
        require(await frame.getByRole('button', { name: '复制完整文档', exact: true }).evaluate(node => document.activeElement === node), 'Copy focus not returned');
        faults.push({ fault, ...selection });
      }
      return { faults };
    });
    await run('Reduced motion, outline state isolation and noninteractive native reference', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      let frame = await open('G05');
      require(await frame.locator('#chatui-component').evaluate(node => getComputedStyle(node).scrollBehavior) === 'auto', 'Reduced-motion scroll policy');
      await frame.locator('.cui-document-outline summary').focus(); await frame.locator('.cui-document-outline summary').press('Enter');
      await activate('button[data-scene="G01"]'); frame = await frameNow();
      require(await frame.locator('.cui-document-outline').evaluate(node => node.hidden && !node.open), 'Long-document outline contaminated G01');
      await activate('button[data-scene="G05"]'); frame = await frameNow();
      require(!await frame.locator('.cui-document-outline').evaluate(node => node.open), 'Old outline state returned');
      await activate('button[data-scene="G06"]'); await page.locator('#native-text').waitFor();
      require(!await page.locator('#gallery-frame').count(), 'Native reference mounted a widget');
      require(await page.locator('#native-text').textContent() === config.fallbacks.G06, 'Native text differs from authored reference');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      return { reducedMotion: true, outlineIsolation: true, nativeReference: true };
    });
    return { status: checks.some(check => check.status !== 'PASS') || errors.length ? 'FAIL' : 'PASS', mode: config.mode, browser: page.context().browser().version(), checks, pageErrors: errors, manualScreenReader: 'UNKNOWN' };
  } finally { page.off('pageerror', onError); await page.context().clearPermissions(); await page.emulateMedia({ reducedMotion: 'no-preference' }); }
}
