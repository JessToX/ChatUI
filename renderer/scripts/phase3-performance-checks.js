// Mount callbacks and two-rAF checkpoints are explicitly not true FCP.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI entry point.
async (page, config) => {
  const samples = [], errors = [], requests = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => requests.push({ url: request.url(), type: request.resourceType() });
  page.on('pageerror', onError); page.on('request', onRequest);
  try {
    await page.setViewportSize({ width: 768, height: 900 });
    for (const scene of ['G01', 'G03', 'G05', 'G08']) for (const runKind of ['fresh-navigation-runtime', 'same-page-remount']) {
      const url = new URL(config.url); url.searchParams.set('scene', scene); url.searchParams.set('width', '768');
      const started = Date.now();
      if (runKind === 'fresh-navigation-runtime') await page.goto(url.href);
      else { await page.locator('#reload').focus(); await page.locator('#reload').press('Enter'); }
      await page.waitForFunction(scene => document.body.dataset.currentScene === scene && ['ready', 'rejection'].includes(document.body.dataset.status), scene);
      const readyWallMs = Date.now() - started;
      const frame = await page.locator('#gallery-frame').elementHandle().then(handle => handle.contentFrame());
      await frame.locator('#chatui-component[aria-busy="false"]').waitFor();
      await page.locator('#gallery-frame').evaluate(node => node.scrollIntoView({ block: 'start' }));
      const twoRafCheckpointMs = await frame.evaluate(() => { const start = performance.now(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)))); });
      const diagnostics = await page.evaluate(() => window.__galleryDiagnostics);
      const mount = diagnostics.mounts.filter(mount => mount.scene === scene).at(-1);
      if (!mount || !Number.isFinite(mount.mountMs) || mount.mountMs < 0 || !Number.isFinite(twoRafCheckpointMs)) throw new Error('Missing or invalid measured mount/two-rAF sample');
      samples.push({ scene, runKind, mode: config.mode, mountCallbackMs: mount.mountMs, readyWallMs, twoRafCheckpointMs, mountSoftTargetMs: scene === 'G05' ? 200 : 50, softTargetExceeded: mount.mountMs > (scene === 'G05' ? 200 : 50) });
    }
    const base = new URL(config.url), forbiddenRequests = requests.filter(request => { const url = new URL(request.url); return url.origin !== base.origin || url.pathname !== base.pathname; });
    return { status: errors.length || forbiddenRequests.length ? 'FAIL' : 'PASS', browser: page.context().browser().version(), mode: config.mode, samples, pageErrors: errors, forbiddenRequests, trueFCP: 'NOT MEASURED', timingDefinition: 'mountCallbackMs: compositor-complete callback; readyWallMs includes automation/navigation; twoRafCheckpointMs is a post-mount paint-opportunity checkpoint, never true FCP', cacheDefinition: 'fresh navigation means fresh JavaScript runtime; no browser cache-clearing claim; same-page remount is warm runtime', jsonSizeLatencyInference: 'No latency benefit inferred from JSON byte reduction' };
  } finally { page.off('pageerror', onError); page.off('request', onRequest); }
}
