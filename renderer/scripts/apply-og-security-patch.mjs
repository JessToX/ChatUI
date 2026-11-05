import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(project, 'vendor/og-security');
const hash = value => createHash('sha256').update(value).digest('hex');
const expectedPaths = ['dist/index.edge.js', 'dist/index.node.js'];

// Apply exact upstream hunks without searching, fuzz, shell commands, or network.
// Whole-file fingerprints below also reject unsupported inputs and outputs.
function applyHunks(source, section) {
  const trailingNewline = source.endsWith('\n');
  const original = (trailingNewline ? source.slice(0, -1) : source).split('\n');
  const lines = section.split('\n');
  const output = [];
  let cursor = 0;
  let index = lines.findIndex(line => line.startsWith('@@ '));
  assert.ok(index >= 0, 'Missing upstream patch hunks');
  while (index < lines.length) {
    if (index === lines.length - 1 && lines[index] === '') break;
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index++]);
    assert.ok(header, 'Unexpected upstream patch syntax');
    const start = Number(header[1]) - 1;
    assert.ok(start >= cursor, 'Overlapping upstream patch hunks');
    output.push(...original.slice(cursor, start));
    const removed = [], added = [];
    while (index < lines.length && !lines[index].startsWith('@@ ')) {
      const line = lines[index++];
      if (index === lines.length && line === '') break;
      assert.ok([' ', '+', '-'].includes(line[0]), 'Unsupported patch line');
      if (line[0] !== '+') removed.push(line.slice(1));
      if (line[0] !== '-') added.push(line.slice(1));
    }
    assert.equal(removed.length, Number(header[2] ?? 1), 'Old hunk length mismatch');
    assert.equal(added.length, Number(header[4] ?? 1), 'New hunk length mismatch');
    assert.deepEqual(original.slice(start, start + removed.length), removed, 'Upstream hunk context mismatch');
    output.push(...added);
    cursor = start + removed.length;
  }
  output.push(...original.slice(cursor));
  return output.join('\n') + (trailingNewline ? '\n' : '');
}

export async function planSecurityPatch(sources, patchOverride) {
  const metadata = JSON.parse(await readFile(join(vendor, 'provenance.json'), 'utf8'));
  const patch = patchOverride ?? await readFile(join(vendor, 'next-16.4.1.patch'), 'utf8');
  assert.equal(hash(patch), metadata.patchSHA256, 'Official OG patch integrity mismatch');
  assert.deepEqual(Object.keys(metadata.files).sort(), expectedPaths);
  const sections = patch.split(/^diff --git /m).slice(1);
  assert.equal(sections.length, expectedPaths.length);
  const results = {};
  for (const section of sections) {
    const [header] = section.split('\n');
    const name = expectedPaths.find(path => header === `a/${path} b/${path}`);
    assert.ok(name && !Object.hasOwn(results, name), 'Unexpected or duplicate patch target');
    const source = sources[name];
    assert.equal(typeof source, 'string', 'Missing OG source');
    const fingerprints = metadata.files[name];
    if (hash(source) === fingerprints.afterSHA256) results[name] = source;
    else {
      assert.equal(hash(source), fingerprints.beforeSHA256, 'Unsupported OG source: refusing to patch');
      results[name] = applyHunks(source, section);
      assert.equal(hash(results[name]), fingerprints.afterSHA256, 'OG patched output fingerprint mismatch');
    }
  }
  return results;
}

export async function applySecurityPatch() {
  const require = createRequire(join(project, 'node_modules/vinext/package.json'));
  const packagePath = require.resolve('@vercel/og/package.json');
  const directory = await realpath(dirname(packagePath));
  const modules = await realpath(join(project, 'node_modules'));
  assert.ok(relative(modules, directory) && !relative(modules, directory).startsWith('..'), 'OG must be installed inside this project');
  const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(metadata.name, '@vercel/og');
  assert.equal(metadata.version, '1.0.1', 'Unsupported OG version; review the upstream patch before updating');
  const sources = {};
  for (const name of expectedPaths) {
    const info = await lstat(join(directory, name));
    assert.ok(info.isFile() && !info.isSymbolicLink(), 'OG patch target must be a regular file');
    sources[name] = await readFile(join(directory, name), 'utf8');
  }
  // Validate both complete files before any write. Already-patched files are unchanged.
  const results = await planSecurityPatch(sources);
  let changed = 0;
  for (const name of expectedPaths) {
    if (sources[name] === results[name]) continue;
    const target = join(directory, name);
    const temporary = `${target}.chatui-security-${process.pid}.tmp`;
    let created = false;
    try {
      await writeFile(temporary, results[name], { flag: 'wx', mode: 0o644 });
      created = true;
      await rename(temporary, target);
      created = false;
      changed++;
    } finally {
      if (created) await unlink(temporary);
    }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = await applySecurityPatch();
  console.log(`Official Next.js OG security backport verified (${changed} files updated).`);
}
