// Local engineering check. Does not measure timing, deploy or access a host.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(root, '..');
const walk = directory => !existsSync(directory) ? [] : readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
function snapshot() {
  const paths = [
    ...['widget', 'explanation', 'response', 'document', 'version'].map(name => join(root, `lib/${name}.generated.mjs`)),
    ...walk(join(root, 'lib/vendor')),
    ...walk(join(root, 'public')),
    ...walk(join(repository, 'plugins/chatui/skills/chatui/references/examples')),
    ...walk(join(repository, 'output/playwright/rich-document/rc')),
  ];
  return Object.fromEntries([...new Set(paths)].sort().map(path => [relative(repository, path), createHash('sha256').update(readFileSync(path)).digest('hex')]));
}
let first;
for (const pass of [1, 2]) {
  for (const script of ['generate-widget.mjs', 'generate-preview.mjs', 'generate-rc-fixtures.mjs', 'generate-gallery.mjs']) {
    execFileSync(process.execPath, [join(root, 'scripts', script)], { cwd: root, stdio: 'pipe' });
  }
  const current = snapshot();
  if (pass === 1) first = current;
  else {
    assert.deepEqual(current, first, 'Repeated generation changed bytes');
    console.log(JSON.stringify({ passes: 2, files: Object.keys(current).length, sha256: current }, null, 2));
  }
}
