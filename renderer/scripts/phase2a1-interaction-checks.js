// Playwright CLI entry point. Real controls, actual local clipboard, explicit fault injection.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI entry point.
async (page) => {
  // Routing disables browser HTTP caching: every new frame loads current bytes.
  await page.unroute('http://127.0.0.1:4173/**');
  await page.route('http://127.0.0.1:4173/**', route => route.continue());
  const checks = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const frameNow = async () => {
    // Wait past the preview's about:blank frame and async fixture fetch.
    await page.waitForFunction(() => {
      const iframe = document.querySelector('#explanation');
      return iframe?.getAttribute('src')?.endsWith('/chatui-document.html') && iframe.contentDocument?.querySelector('#chatui-component[aria-busy="false"]');
    });
    const frame = await page.locator('#explanation').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      return frame?.contentDocument?.body && Math.abs(frame.getBoundingClientRect().height - frame.contentDocument.body.scrollHeight) <= 2;
    });
    return frame;
  };
  const open = async (id, width = 768, theme = 'light') => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:4173/preview.html?phase=2a&example=${id}&theme=${theme}&width=${width}`);
    return frameNow();
  };
  let frame = await open('document-g01', 390);
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  const slider = frame.getByRole('slider', { name: '三角形高度与圆半径之比 h/r' });
  require(await slider.inputValue() === '1', 'G01 initial ratio');
  const initialText = await frame.locator('.cui-document').first().textContent();
  await slider.focus();
  for (let i = 0; i < 50; i++) await slider.press('ArrowRight');
  const optimum = await frame.evaluate(() => ({
    ratio: document.querySelector('input[type=range]').value,
    values: [...document.querySelectorAll('.cui-values')].map(node => node.textContent),
    state: window.openai.widgetState,
    focus: getComputedStyle(document.activeElement).outlineWidth
  }));
  require(optimum.ratio === '1.5', 'Keyboard must reach optimum');
  const geometryState = optimum.state.modelContent.blocks.find(block => block.component === 'geometry');
  require(Math.abs(geometryState.area - 5.196152422706632) < 1e-10, 'Independent golden area');
  require(geometryState.height === 3 && Math.abs(2 * geometryState.halfBase - 3.4641016151377546) < 1e-10, 'Independent golden lengths');
  require(optimum.values.join(' ').includes('cm²'), 'Area units');
  require(optimum.values.join(' ').includes('面积 A ≈') && optimum.values.join(' ').includes('底边 b'), 'Rounded area/base labels');
  require(await frame.locator('[data-geometry-measure="height"]').count() === 1, 'Missing complete h=AD height label');
  require(optimum.focus !== '0px', 'Visible keyboard focus');
  require(await frame.locator('.cui-document').first().textContent() === initialText, 'Slider rewrote fixed derivation');
  await frame.locator('input[type=range]').locator('xpath=ancestor::div[contains(@class,"chatui-root")][1]').screenshot({ path: 'output/playwright/phase2a1/after/g01-optimum-interaction.png' });
  await frame.locator('.cui-ex-prose').first().screenshot({ path: 'output/playwright/phase2a1/after/g01-light-390-key-formulas.png' });
  await slider.press('Home'); require(await slider.inputValue() === '0.05', 'Lower slider endpoint');
  await slider.press('End'); require(await slider.inputValue() === '1.95', 'Upper slider endpoint');
  checks.push({ name: 'G01 keyboard, exact optimum, units, fixed prose, allowed endpoints', status: 'PASS', optimum: geometryState });

  await page.evaluate(() => {
    const oldFrame = document.querySelector('iframe');
    window.phase2aOldWindow = oldFrame.contentWindow;
    window.phase2aOldSetter = oldFrame.contentWindow.openai.setWidgetState;
  });
  await page.getByRole('button', { name: '刷新视图', exact: true }).click(); frame = await frameNow();
  require(await frame.getByRole('slider').inputValue() === '1.95', 'Reload must restore genuine state');
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  require(await frame.getByRole('slider').inputValue() === '1', 'Reset must restore initial state');
  const isolation = await page.evaluate(() => {
    window.phase2aOldSetter({ privateContent: { marker: 'STALE_FRAME_WRITE' } });
    window.dispatchEvent(new MessageEvent('message', { source: window.phase2aOldWindow, origin: location.origin, data: { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 50000 } } }));
    return { stored: sessionStorage.getItem('chatui-preview-v5/response/document-g01/state'), frameChanged: window.phase2aOldWindow !== document.querySelector('iframe').contentWindow, height: document.querySelector('iframe').style.height };
  });
  require(isolation.frameChanged && !isolation.stored?.includes('STALE_FRAME_WRITE') && isolation.height !== '50000px', 'Stale frame escaped isolation');
  checks.push({ name: 'Reload/clear state, replaced frame, stale message and write rejection', status: 'PASS', ...isolation });

  const labels = [];
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) {
    frame = await open('document-g01', width, theme);
    for (const ratio of [.05, .5, 1, 1.5, 1.95]) {
      // Deterministic input/change events exercise the real renderer; the
      // independent optimum above used actual keyboard controls.
      await frame.getByRole('slider').evaluate((node, q) => { node.value = q; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, String(ratio));
      const measured = await frame.locator('svg').evaluate(svg => {
        const outer = svg.getBoundingClientRect();
        const nodes = [...svg.querySelectorAll('[data-geometry-measure]')].map(node => {
          const r = node.getBoundingClientRect();
          return { text: node.textContent, kind: node.dataset.geometryMeasure, x: r.left - outer.left, y: r.top - outer.top, width: r.width, height: r.height };
        });
        const collisions = [];
        for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
          const x = nodes[a], y = nodes[b];
          if (Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x) > 2 && Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y) > 2) collisions.push([x.text, y.text]);
        }
        return { svgWidth: outer.width, svgHeight: outer.height, nodes, collisions };
      });
      require(measured.collisions.length === 0 && measured.nodes.every(n => n.x >= -1 && n.y >= -1 && n.x + n.width <= measured.svgWidth + 1 && n.y + n.height <= measured.svgHeight + 1), `Geometry labels collide/escape: ${JSON.stringify({ theme, width, ratio, ...measured })}`);
      require(measured.nodes.some(n => n.kind === 'height' && n.text === 'h = AD') && measured.nodes.some(n => n.kind === 'radius'), 'Missing height/radius under scaling');
      await frame.locator('input[type=range]').locator('xpath=ancestor::div[contains(@class,"chatui-root")][1]').screenshot({ path: `output/playwright/phase2a1/after/g01-${theme}-${width}-ratio-${String(ratio).replace('.', '_')}.png` });
      labels.push({ theme, width, ratio, ...measured });
    }
  }
  checks.push({ name: 'Geometry measure labels: 20 real browser theme/width/ratio cases, SVG bounds and text collision checks', status: 'PASS', labels });
  frame = await open('document-g01', 390);

  // Client-side forged snapshot; server rejection is separately tested in the core suite.
  await page.evaluate(async () => {
    const result = await fetch('/examples/document-g01.json').then(response => response.json());
    const component = result.structuredContent.blocks.find(block => block.type === 'geometry');
    component.data.radius = 2e-162; component.data.heightRatio = .05;
    document.querySelector('iframe').contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }, location.origin);
  });
  await frame.locator('#chatui-status').filter({ hasText: '半径' }).waitFor();
  require(await frame.locator('input[type=range], svg').count() === 0, 'Invalid numeric input retained live geometry');
  await page.screenshot({ path: 'output/playwright/phase2a1/after/g01-rejected-input.png', fullPage: true });
  checks.push({ name: 'B1 underflow input rejected visibly; old geometry removed', status: 'PASS', message: await frame.locator('#chatui-status').textContent() });

  frame = await open('document-g04', 390);
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  const summary = frame.locator('.cui-collapse > summary').first(); await summary.focus(); await summary.press('Enter');
  require(await frame.locator('.cui-collapse').first().evaluate(node => node.open), 'Keyboard disclosure did not open');
  require(await frame.getByText('反例 A：', { exact: false }).first().isVisible(), 'Targeted counterexample missing');
  await frame.locator('.cui-collapse').first().screenshot({ path: 'output/playwright/phase2a1/after/g04-counterexample-keyboard.png' });
  await summary.press('Enter'); require(!await frame.locator('.cui-collapse').first().evaluate(node => node.open), 'Keyboard disclosure did not close');
  checks.push({ name: 'G04 keyboard opens/closes the targeted counterexample', status: 'PASS' });
  const comparison = await frame.locator('.cui-compare').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, top: node.getBoundingClientRect().top, left: node.getBoundingClientRect().left, detailWhitespace: getComputedStyle(node.querySelector('.cui-values') || node.querySelector('p')).whiteSpace })));
  require(comparison.length === 2 && comparison[0].text.includes('前提 A1') && comparison[1].text.includes('前提 B1') && comparison[0].top < comparison[1].top, 'G04 narrow A then B reading order');
  require(comparison.every(node => node.detailWhitespace === 'pre-line'), 'G04 premise/reason/conclusion lines collapsed');
  await page.screenshot({ path: 'output/playwright/phase2a1/after/g04-light-390-argument.png', fullPage: true });
  frame = await open('document-g04', 768);
  await page.screenshot({ path: 'output/playwright/phase2a1/after/g04-light-768-argument.png', fullPage: true });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
  await frame.getByText('已复制完整文档。', { exact: true }).waitFor();
  const argumentCopy = await frame.evaluate(() => navigator.clipboard.readText());
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', '反例 A', '反例 B']) require(argumentCopy.includes(id), `Argument copy lost ${id}`);
  checks.push({ name: 'G04 six argument nodes: pre-line, narrow A→B and complete copy', status: 'PASS', comparison });

  frame = await open('document-g05', 390);
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  require(await frame.locator('.cui-document-outline li').count() === 8, 'Research outline incomplete');
  require(await frame.locator('.cui-document-outline a, .cui-document-outline button').count() === 0, 'Unverified navigation enabled');
  const outline = frame.locator('details.cui-document-outline');
  const outlineSummary = frame.locator('.cui-document-outline-title');
  require(!await outline.evaluate(node => node.open), 'Outline initially expanded');
  require(await outlineSummary.textContent() === '章节概览 · 8 节', 'Outline count/summary');
  await page.screenshot({ path: 'output/playwright/phase2a1/after/g05-light-390-outline-closed.png' });
  await outlineSummary.focus(); await outlineSummary.press('Enter');
  require(await outline.evaluate(node => node.open), 'Native outline keyboard did not open');
  require(await frame.locator('.cui-document-outline li:visible').count() === 8, 'Expanded outline lost chapters');
  await page.screenshot({ path: 'output/playwright/phase2a1/after/g05-light-390-outline-open.png' });
  await outlineSummary.press('Enter'); require(!await outline.evaluate(node => node.open), 'Native outline keyboard did not close');
  const ownership = await frame.evaluate(() => ({ scrollHeight: document.scrollingElement.scrollHeight, clientHeight: document.scrollingElement.clientHeight }));
  require(ownership.scrollHeight - ownership.clientHeight <= 2, 'Unexpected iframe scroll owner');
  const tabs = frame.getByRole('tab'); await tabs.first().focus(); await tabs.first().press('ArrowRight');
  require(await tabs.nth(1).getAttribute('aria-selected') === 'true', 'Keyboard tab selection');
  await frame.getByRole('tabpanel').filter({ visible: true }).screenshot({ path: 'output/playwright/phase2a1/after/g05-alternative-tab.png' });
  const compiled = await page.request.get('http://127.0.0.1:4173/examples/document-g05.json').then(response => response.json());
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
  await frame.getByText('已复制完整文档。', { exact: true }).waitFor();
  const clipboard = await frame.evaluate(() => navigator.clipboard.readText());
  require(clipboard === compiled.content[0].text, 'Clipboard differs from full same-source fallback');
  require(!clipboard.includes('章节概览') && !clipboard.includes('横向滚动'), 'Copy duplicated outline or UI hints');
  for (const marker of ['[SYN-E05]', '[SYN-E04-A]', '[SYN-E04-B]', 'A-03、A-09、B-04、B-11', '完整文档到此结束']) require(clipboard.includes(marker), `Clipboard lost ${marker}`);
  require(!await frame.locator('.cui-collapse').evaluate(node => node.open), 'Copy unnecessarily opened disclosure');
  checks.push({ name: 'G05 auto-height static outline, keyboard tabs, actual Clipboard full-text equality', status: 'PASS', clipboardCharacters: clipboard.length, ownership });

  const scrollOperations = [];
  const touchSession = await page.context().newCDPSession(page);
  for (const [kind, selector] of [
    ['math', '.cui-ex-math-scroll.cui-document-overflow'],
    ['table', '.cui-document-table.cui-document-overflow'],
    ['code', 'pre.cui-document-overflow']
  ]) {
    const overflow = frame.locator(selector).first();
    await overflow.waitFor(); await overflow.scrollIntoViewIfNeeded();
    await overflow.evaluate(node => { node.scrollLeft = 0; });
    await overflow.focus(); await overflow.press('ArrowRight'); await overflow.press('ArrowRight');
    await frame.waitForFunction(sel => document.querySelector(sel).scrollLeft > 0, selector);
    const keyboardLeft = await overflow.evaluate(node => node.scrollLeft);
    require(keyboardLeft > 0, `Wide ${kind} keyboard scroll did not move`);
    require(await overflow.evaluate(node => getComputedStyle(node).outlineWidth) !== '0px', `Wide ${kind} scroll focus not visible`);
    await overflow.evaluate(node => { node.scrollLeft = 0; });
    const box = await overflow.boundingBox();
    await touchSession.send('Input.synthesizeScrollGesture', { x: box.x + box.width * .75, y: box.y + Math.min(40, box.height / 2), xDistance: -120, yDistance: 0, gestureSourceType: 'touch' });
    const touchLeft = await overflow.evaluate(node => node.scrollLeft);
    require(touchLeft > 0, `Chromium native touch scroll did not move wide ${kind}`);
    const selection = await overflow.evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range);
      const text = selected.toString();
      return { selectedCharacters: text.length, text: text.slice(0, 80), includesHint: text.includes('横向滚动') };
    });
    require(selection.selectedCharacters > 0 && !selection.includesHint, `Wide ${kind} content cannot be selected independently of hint`);
    await overflow.locator('..').screenshot({ path: `output/playwright/phase2a1/after/g05-light-390-${kind}-scroll-hint.png` });
    await frame.evaluate(() => window.getSelection().removeAllRanges());
    scrollOperations.push({ kind, keyboardLeft, touchLeft, selection });
  }
  await touchSession.detach();
  await frame.locator('pre').locator('..').screenshot({ path: 'output/playwright/phase2a1/after/g05-light-390-scroll-hint.png' });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByLabel('宽度').selectOption('1024');
  frame = await frameNow();
  await frame.waitForFunction(() => [...document.querySelectorAll('.cui-document-scroll-block')].every(wrapper => {
    const node = wrapper.firstElementChild, hint = wrapper.querySelector('.cui-document-scroll-hint');
    return hint.hidden === (node.scrollWidth <= node.clientWidth + 1);
  }));
  const resizing = await frame.locator('.cui-document-scroll-block').evaluateAll(wrappers => wrappers.map(wrapper => ({ overflow: wrapper.firstElementChild.scrollWidth > wrapper.firstElementChild.clientWidth + 1, hinted: !wrapper.lastElementChild.hidden, tabIndex: wrapper.firstElementChild.getAttribute('tabindex') })));
  require(resizing.every(node => node.overflow === node.hinted && (node.overflow || node.tabIndex === null)), 'Resize retained needless hints/Tab stops');
  await frame.evaluate(() => { document.documentElement.style.colorScheme = 'dark'; });
  require(await frame.locator('pre').evaluate(node => !node.hasAttribute('tabindex')), 'Theme update added a needless code Tab stop');
  checks.push({ name: 'Actual wide content: keyboard focus/scroll, Chromium native touch gesture, width/theme remeasurement', status: 'PASS', scrollOperations, resizing });
  frame = await open('document-g05', 390);

  // Explicit denied-clipboard fault, not a claim about the user's permission state.
  await frame.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('QA denied', 'NotAllowedError'); } } }));
  await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
  const textarea = frame.getByRole('textbox', { name: '完整文档文本（只读，可手动选择复制）' });
  await textarea.waitFor({ state: 'visible' });
  require(await textarea.inputValue() === clipboard, 'Manual fallback lost content');
  const selection = await textarea.evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd, readOnly: node.readOnly }));
  require(selection.focused && selection.start === 0 && selection.end === clipboard.length && selection.readOnly, 'Manual text focus/select/readonly');
  require(!await frame.getByText('已复制完整文档。', { exact: true }).count(), 'False Clipboard success');
  await frame.locator('.cui-document-tools').screenshot({ path: 'output/playwright/phase2a1/after/g05-manual-copy.png' });
  await textarea.press('Escape'); require(!await textarea.isVisible(), 'Escape did not close fallback');
  require(await frame.getByRole('button', { name: '复制完整文档', exact: true }).evaluate(node => document.activeElement === node), 'Focus not returned to copy button');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  require(await frame.locator('#chatui-component').evaluate(node => getComputedStyle(node).scrollBehavior) === 'auto', 'Reduced motion policy');
  checks.push({ name: 'Injected Clipboard denial: complete selected manual fallback, honest feedback, Escape/focus and reduced motion', status: 'PASS', ...selection });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.context().clearPermissions();
  await frame.locator('.cui-document-outline-title').focus();
  await frame.locator('.cui-document-outline-title').press('Enter');
  await page.getByRole('button', { name: 'G01 · 几何实验', exact: true }).click(); frame = await frameNow();
  require(await frame.locator('.cui-document-outline').evaluate(node => node.hidden && !node.open), 'Expanded outline contaminated a short document');
  await page.getByRole('button', { name: 'G05 · 研究长文', exact: true }).click(); frame = await frameNow();
  require(await frame.locator('.cui-document-outline').evaluate(node => !node.open), 'Outline local state survived a different document');
  checks.push({ name: 'Outline state cannot pollute a different document or a new mount', status: 'PASS' });
  require(errors.length === 0, JSON.stringify(errors)); page.off('pageerror', onError);
  return { browser: page.context().browser().version(), checks, pageErrors: errors, manualScreenReader: 'UNKNOWN', privateHost: 'NOT RUN' };
}
