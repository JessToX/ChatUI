import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { ImageResponse } from '../node_modules/vinext/dist/shims/og.js';
import { applySecurityPatch, planSecurityPatch } from '../scripts/apply-og-security-patch.mjs';

const require = createRequire(new URL('../node_modules/vinext/package.json', import.meta.url));
const directory = dirname(require.resolve('@vercel/og/package.json'));
const sourceFiles = ['dist/index.edge.js', 'dist/index.node.js'];
const sources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, await readFile(join(directory, name), 'utf8')])));

test('official security backport is idempotent and rejects altered source or patch bytes', async () => {
  const before = await sources();
  assert.equal(await applySecurityPatch(), 0);
  assert.deepEqual(await sources(), before);
  await assert.rejects(planSecurityPatch({ ...before, 'dist/index.node.js': before['dist/index.node.js'] + '// unexpected bytes\n' }), /Unsupported OG source/);
  await assert.rejects(planSecurityPatch(before, 'tampered patch'), /patch integrity mismatch/);
  assert.deepEqual(await sources(), before, 'rejected plans must leave installed files unchanged');
});

// Inert markers exercise the upstream GHSA-wx4j-mvgx-mqwp serialization fixes.
// No scripts, external URLs, browsers, or deployed endpoints are involved.
test('OG rejects structural XML element and attribute injection', async () => {
  for (const [child, message] of [
    [createElement('path><path data-audit="true"'), /Invalid XML element name/],
    [createElement('path', { 'data-label" data-audit': 'true' }), /Invalid XML attribute name/],
  ]) {
    const image = new ImageResponse(createElement('svg', { width: 100, height: 100, viewBox: '0 0 100 100' }, child), { width: 100, height: 100 });
    await assert.rejects(image.arrayBuffer(), message);
  }
});

test('OG rejects caller-controlled internal clipping fields', async () => {
  const image = new ImageResponse(createElement('div', { style: { display: 'flex', _inheritedClipPathId: 'audit-marker' } }, 'safe'), { width: 100, height: 100 });
  await assert.rejects(image.arrayBuffer(), /Invalid style property.*_inheritedClipPathId/);
});
