// Security probes use real frame identity and explicit forged MessageEvents.
// They do not relax sandbox policy or invoke any external model/host.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const checks = [], errors = [], requests = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => requests.push({ url: request.url(), type: request.resourceType() });
  page.on('pageerror', onError); page.on('request', onRequest);
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const activate = async selector => { const control = page.locator(selector); await control.focus(); await control.press('Enter'); };
  const screenshot = async path => {
    const viewport = page.viewportSize(); const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path, fullPage: true }); await page.setViewportSize(viewport);
  };
  const open = async scene => {
    await page.setViewportSize({ width: 390, height: 900 });
    const url = new URL(config.url); url.searchParams.set('scene', scene); url.searchParams.set('width', '390');
    await page.goto(url.href);
    await page.waitForFunction(scene => document.body.dataset.currentScene === scene && ['ready', 'rejection'].includes(document.body.dataset.status), scene);
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
    return frame;
  };
  const frameNow = async () => {
    await page.waitForFunction(() => ['ready', 'rejection'].includes(document.body.dataset.status));
    const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
    await frame.locator('#chatui-component[aria-busy="false"]').waitFor(); return frame;
  };
  const run = async (name, callback) => {
    try { checks.push({ name, status: 'PASS', ...await callback() }); }
    catch (error) { checks.push({ name, status: 'FAIL', error: error.message }); await screenshot(`${config.screenshots}/${config.mode}-security-${checks.length}-FAIL.png`).catch(() => {}); }
  };
  try {
    await run('Opaque sandbox, removed data bootstrap, no ChatGPT facade', async () => {
      const frame = await open('G01');
      const outer = await page.evaluate(() => ({ sandbox: document.querySelector('#gallery-frame').getAttribute('sandbox'), opaque: document.querySelector('#gallery-frame').contentDocument === null, bootstrapCount: document.querySelectorAll('#gallery-data').length, openai: typeof window.openai }));
      const inner = await frame.evaluate(() => ({ openai: typeof window.openai, origin: origin, referrerPolicy: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content }));
      require(outer.sandbox === 'allow-scripts' && outer.opaque && outer.bootstrapCount === 0 && outer.openai === 'undefined' && inner.openai === 'undefined', 'Gallery violated opaque sandbox/data/API boundary');
      require(inner.referrerPolicy?.includes("connect-src 'none'"), 'Frame lost no-network CSP');
      return { outer, inner };
    });
    await run('Foreign source, null origin, wrong nonce, malformed schema and unexpected operation rejected', async () => {
      const frame = await open('G01');
      const nonce = await frame.locator('html').getAttribute('data-gallery-nonce');
      const result = await page.evaluate(nonce => {
        const frame = document.querySelector('#gallery-frame'); const before = window.__galleryDiagnostics;
        const emit = (source, data) => window.dispatchEvent(new MessageEvent('message', { source, origin: 'null', data }));
        const valid = { channel: 'chatui-offline-v1', nonce, op: 'size', height: 49123 };
        emit(window, valid); emit(frame.contentWindow, { ...valid, nonce: 'wrong-nonce' });
        emit(frame.contentWindow, { ...valid, height: NaN }); emit(frame.contentWindow, { ...valid, height: -1 });
        emit(frame.contentWindow, { ...valid, height: 50001 }); emit(frame.contentWindow, { ...valid, extra: true });
        emit(frame.contentWindow, { channel: 'chatui-offline-v1', nonce, op: 'execute-model-script', script: 'window.QA_MARKER=1' });
        emit(frame.contentWindow, { channel: 'chatui-offline-v1', nonce, op: 'copy-result', id: 1, ok: true });
        emit(frame.contentWindow, { channel: 'chatui-offline-v1', nonce, op: 'state', state: JSON.parse('{"__proto__":{"polluted":true}}') });
        return { before, after: window.__galleryDiagnostics, height: frame.style.height, marker: window.QA_MARKER ?? null, polluted: ({}).polluted ?? null };
      }, nonce);
      require(result.after.rejectedMessages - result.before.rejectedMessages >= 9 && result.height !== '49123px' && result.marker === null && result.polluted === null, 'Forged message changed trusted state');
      return result;
    });
    await run('Destroyed frame late messages cannot resize, restore state, or report readiness', async () => {
      let frame = await open('G05');
      const nonce = await frame.locator('html').getAttribute('data-gallery-nonce');
      await page.evaluate(() => { window.__phase2bOldFrame = document.querySelector('#gallery-frame').contentWindow; });
      await activate('button[data-scene="G01"]'); frame = await frameNow();
      const result = await page.evaluate(nonce => {
        const current = document.querySelector('#gallery-frame'); const before = window.__galleryDiagnostics;
        for (const data of [{ op: 'size', height: 49999 }, { op: 'ready', mountMs: 1 }, { op: 'state', state: { marker: 'OLD_FRAME_STATE' } }, { op: 'copy', id: 99, text: 'OLD_FRAME_COPY' }]) window.dispatchEvent(new MessageEvent('message', { source: window.__phase2bOldFrame, origin: 'null', data: { channel: 'chatui-offline-v1', nonce, ...data } }));
        return { before, after: window.__galleryDiagnostics, differentWindow: window.__phase2bOldFrame !== current.contentWindow, height: current.style.height, scene: document.body.dataset.currentScene };
      }, nonce);
      require(result.differentWindow && result.after.rejectedMessages - result.before.rejectedMessages >= 4 && result.height !== '49999px' && result.scene === 'G01', 'Detached frame polluted current scene');
      require(await frame.getByRole('slider').inputValue() === '1', 'Detached state restored into geometry');
      return result;
    });
    await run('Late Clipboard completion after switch cannot update new frame', async () => {
      let frame = await open('G05');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(resolve => { window.__phase2bFinishClipboard = resolve; }) } }));
      await frame.getByRole('button', { name: '复制完整文档', exact: true }).click();
      await page.waitForFunction(() => typeof window.__phase2bFinishClipboard === 'function');
      await activate('button[data-scene="G01"]'); frame = await frameNow();
      await page.evaluate(() => window.__phase2bFinishClipboard());
      await frame.getByRole('slider').press('ArrowRight');
      require(!await frame.getByText('已复制完整文档。', { exact: true }).count() && !await frame.locator('.cui-document-copy-fallback:visible').count(), 'Late copy callback polluted the new frame');
      return { currentScene: 'G01', lateClipboardIgnored: true };
    });
    await run('G07 bounded TeX degradation preserves both ends and valid formulas', async () => {
      const frame = await open('G07');
      const text = await frame.locator('#chatui-component').textContent();
      require(await frame.locator('math').count() >= 2, 'Valid formulas were lost by bounded bad TeX');
      require(text.includes('\\frac{x}{') && !text.includes('undefined') && !text.includes('ParseError'), 'Original bounded bad TeX missing or internal error disclosed');
      require(text.includes('安全降级示例开始') && text.includes('安全降级示例结束'), 'G07 lost first/last authored text');
      require(config.fallbacks.G07 && text.length > 180, 'G07 fallback/content incomplete');
      await screenshot(`${config.screenshots}/${config.mode}-g07-safe-tex-degradation.png`);
      return { mathCount: await frame.locator('math').count(), characters: text.length, visibleFirst: text.slice(0, 180), visibleLast: text.slice(-240) };
    });
    await run('G08 real compiler/client refusals and independent Quiz pre-submit privacy', async () => {
      const frame = await open('G08');
      const statuses = await page.locator('#boundary-results li').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.check, status: node.dataset.status, text: node.textContent })));
      require(statuses.length >= 6 && statuses.some(item => item.id === 'client-view' && item.status === 'rejected') && statuses.some(item => item.id === 'tool-unavailable' && item.status === 'fallback'), 'Distinct refusal/fallback paths missing');
      require(await page.locator('#tool-fallback').textContent() === config.toolFallbacks.G08, 'Tool-unavailable safe native fallback is incomplete');
      require(await page.evaluate(() => window.__galleryDiagnostics.clientRejections > 0), 'Actual client validator refusal was not observed');
      const questions = config.quizOracle.G08; require(questions?.length > 0, 'QA Quiz oracle missing');
      const content = await frame.locator('#chatui-component').textContent();
      for (const question of questions) require(!content.includes(question.explanation), 'Quiz explanation in pre-submit DOM');
      require(!await frame.locator('.cui-feedback,.cui-result').count(), 'Unsubmitted Quiz mounted hidden scoring feedback');
      await page.evaluate(() => {
        window.__phase2bQuizMessages = [];
        window.addEventListener('message', event => { if (event.source === document.querySelector('#gallery-frame')?.contentWindow && event.data?.op === 'state') window.__phase2bQuizMessages.push(event.data); });
      });
      await frame.getByRole('button', { name: '提交答案', exact: true }).click();
      require(await frame.getByText('请先回答每一道题。', { exact: true }).isVisible(), 'Empty Quiz submit skipped completeness check');
      for (const [index, question] of questions.entries()) {
        const radio = frame.locator('fieldset').nth(index).getByRole('radio').first();
        await radio.focus(); await radio.press('Space');
        require(await radio.isChecked(), 'Keyboard Quiz selection failed');
        require(!await frame.locator('.cui-feedback,.cui-result').count(), 'Selection leaked scoring before submit');
        require(question.options.length >= 2, 'Quiz oracle invalid');
      }
      const preSubmit = await page.evaluate(() => window.__phase2bQuizMessages);
      const serialized = JSON.stringify(preSubmit);
      require(!/"(?:correct|explanation|score|gradingKey|answerKey)"\s*:/.test(serialized), 'Unsubmitted outgoing messages disclosed grading keys');
      for (const question of questions) require(!serialized.includes(question.explanation), 'Unsubmitted message disclosed explanation');
      await frame.getByRole('button', { name: '提交答案', exact: true }).click();
      const expectedScore = questions.filter(question => question.options[0].id === question.correct).length;
      require(await frame.getByText(`${expectedScore} / ${questions.length} 正确`, { exact: true }).isVisible(), 'Actual Quiz score differs from authored fixed oracle');
      await screenshot(`${config.screenshots}/${config.mode}-g08-quiz-submitted.png`);
      await frame.getByRole('button', { name: '重新测试', exact: true }).click();
      require(!await frame.locator('.cui-feedback,.cui-result').count() && !await frame.getByRole('radio').first().isChecked(), 'Quiz retry retained grading/answers');
      return { statuses, clientRejections: await page.evaluate(() => window.__galleryDiagnostics.clientRejections), preSubmitMessages: preSubmit.length, questionCount: questions.length, actualScore: expectedScore };
    });
    await run('Quiz reload and cross-scene remount safely reset selection and grading', async () => {
      let frame = await open('G08');
      await frame.getByRole('radio').first().check(); await activate('#reload'); frame = await frameNow();
      require(!await frame.getByRole('radio').first().isChecked() && !await frame.locator('.cui-feedback').count(), 'Quiz reload recovered old answers');
      await frame.getByRole('radio').first().check();
      await activate('button[data-scene="G01"]'); await frameNow();
      await activate('button[data-scene="G08"]'); frame = await frameNow();
      require(!await frame.getByRole('radio').first().isChecked() && !await frame.locator('.cui-feedback').count(), 'Quiz scene remount retained old answers');
      await page.reload(); frame = await frameNow();
      require(!await frame.getByRole('radio').first().isChecked(), 'Page refresh retained unsubmitted answer');
      return { reloadReset: true, crossSceneReset: true, pageRefreshReset: true };
    });
    const base = new URL(config.url);
    const forbiddenRequests = requests.filter(request => { const url = new URL(request.url); return url.origin !== base.origin || url.pathname !== base.pathname; });
    return { status: checks.some(check => check.status !== 'PASS') || errors.length || forbiddenRequests.length ? 'FAIL' : 'PASS', mode: config.mode, browser: page.context().browser().version(), checks, pageErrors: errors, requestCount: requests.length, forbiddenRequests };
  } finally { page.off('pageerror', onError); page.off('request', onRequest); }
}
