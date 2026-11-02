// Playwright CLI entry point. Real controls, actual local clipboard, explicit fault injection.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI entry point.
async (page) => {
  const checks = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const frameNow = async () => {
    const frame = await page.locator('#explanation').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      return frame?.contentDocument?.body && Math.abs(frame.getBoundingClientRect().height - frame.contentDocument.body.scrollHeight) <= 2;
    });
    return frame;
  };
  const open = async (id, width = 768) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:4173/preview.html?phase=2a&example=${id}&theme=light&width=${width}`);
    return frameNow();
  };
  let frame = await open('document-g01');
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
  require(optimum.focus !== '0px', 'Visible keyboard focus');
  require(await frame.locator('.cui-document').first().textContent() === initialText, 'Slider rewrote fixed derivation');
  await frame.locator('input[type=range]').locator('xpath=ancestor::div[contains(@class,"chatui-root")][1]').screenshot({ path: 'output/playwright/phase2a/after/g01-optimum-interaction.png' });
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

  // Client-side forged snapshot; server rejection is separately tested in the core suite.
  await page.evaluate(async () => {
    const result = await fetch('/examples/document-g01.json').then(response => response.json());
    const component = result.structuredContent.blocks.find(block => block.type === 'geometry');
    component.data.radius = 2e-162; component.data.heightRatio = .05;
    document.querySelector('iframe').contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }, location.origin);
  });
  await frame.locator('#chatui-status').filter({ hasText: '半径' }).waitFor();
  require(await frame.locator('input[type=range], svg').count() === 0, 'Invalid numeric input retained live geometry');
  await page.screenshot({ path: 'output/playwright/phase2a/after/g01-rejected-input.png', fullPage: true });
  checks.push({ name: 'B1 underflow input rejected visibly; old geometry removed', status: 'PASS', message: await frame.locator('#chatui-status').textContent() });

  frame = await open('document-g04', 390);
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  const summary = frame.locator('summary').first(); await summary.focus(); await summary.press('Enter');
  require(await frame.locator('details').first().evaluate(node => node.open), 'Keyboard disclosure did not open');
  require(await frame.getByText('反例 A：', { exact: false }).first().isVisible(), 'Targeted counterexample missing');
  await frame.locator('details').first().screenshot({ path: 'output/playwright/phase2a/after/g04-counterexample-keyboard.png' });
  await summary.press('Enter'); require(!await frame.locator('details').first().evaluate(node => node.open), 'Keyboard disclosure did not close');
  checks.push({ name: 'G04 keyboard opens/closes the targeted counterexample', status: 'PASS' });

  frame = await open('document-g05', 390);
  await page.getByRole('button', { name: '清除本例交互', exact: true }).click(); frame = await frameNow();
  require(await frame.locator('.cui-document-outline li').count() === 8, 'Research outline incomplete');
  require(await frame.locator('.cui-document-outline a, .cui-document-outline button').count() === 0, 'Unverified navigation enabled');
  const ownership = await frame.evaluate(() => ({ scrollHeight: document.scrollingElement.scrollHeight, clientHeight: document.scrollingElement.clientHeight }));
  require(ownership.scrollHeight - ownership.clientHeight <= 2, 'Unexpected iframe scroll owner');
  const tabs = frame.getByRole('tab'); await tabs.first().focus(); await tabs.first().press('ArrowRight');
  require(await tabs.nth(1).getAttribute('aria-selected') === 'true', 'Keyboard tab selection');
  await frame.getByRole('tabpanel').filter({ visible: true }).screenshot({ path: 'output/playwright/phase2a/after/g05-alternative-tab.png' });
  const compiled = await page.request.get('http://127.0.0.1:4173/examples/document-g05.json').then(response => response.json());
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
  await frame.getByText('已复制完整文档。', { exact: true }).waitFor();
  const clipboard = await frame.evaluate(() => navigator.clipboard.readText());
  require(clipboard === compiled.content[0].text, 'Clipboard differs from full same-source fallback');
  for (const marker of ['[SYN-E05]', '[SYN-E04-A]', '[SYN-E04-B]', 'A-03、A-09、B-04、B-11', '完整文档到此结束']) require(clipboard.includes(marker), `Clipboard lost ${marker}`);
  require(!await frame.locator('details').evaluate(node => node.open), 'Copy unnecessarily opened disclosure');
  checks.push({ name: 'G05 auto-height static outline, keyboard tabs, actual Clipboard full-text equality', status: 'PASS', clipboardCharacters: clipboard.length, ownership });

  // Explicit denied-clipboard fault, not a claim about the user's permission state.
  await frame.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('QA denied', 'NotAllowedError'); } } }));
  await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
  const textarea = frame.getByRole('textbox', { name: '完整文档文本（只读，可手动选择复制）' });
  await textarea.waitFor({ state: 'visible' });
  require(await textarea.inputValue() === clipboard, 'Manual fallback lost content');
  const selection = await textarea.evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd, readOnly: node.readOnly }));
  require(selection.focused && selection.start === 0 && selection.end === clipboard.length && selection.readOnly, 'Manual text focus/select/readonly');
  require(!await frame.getByText('已复制完整文档。', { exact: true }).count(), 'False Clipboard success');
  await frame.locator('.cui-document-tools').screenshot({ path: 'output/playwright/phase2a/after/g05-manual-copy.png' });
  await textarea.press('Escape'); require(!await textarea.isVisible(), 'Escape did not close fallback');
  require(await frame.getByRole('button', { name: '复制完整文档', exact: true }).evaluate(node => document.activeElement === node), 'Focus not returned to copy button');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  require(await frame.locator('#chatui-component').evaluate(node => getComputedStyle(node).scrollBehavior) === 'auto', 'Reduced motion policy');
  checks.push({ name: 'Injected Clipboard denial: complete selected manual fallback, honest feedback, Escape/focus and reduced motion', status: 'PASS', ...selection });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.context().clearPermissions();
  require(errors.length === 0, JSON.stringify(errors)); page.off('pageerror', onError);
  return { browser: page.context().browser().version(), checks, pageErrors: errors, manualScreenReader: 'UNKNOWN', privateHost: 'NOT RUN' };
}
