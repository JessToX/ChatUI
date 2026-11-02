// Fresh local checkout helper; existing bindings are never read or overwritten.
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const metadata = async path => {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

export async function prepareLocalConfig(root) {
  const directory = join(root, '.openai');
  let parent = await metadata(directory);
  if (parent?.isSymbolicLink()) return 'preserved';
  if (parent && !parent.isDirectory()) throw new Error('Local configuration directory is not a directory; preserved without reading it.');
  if (!parent) {
    try { await mkdir(directory); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    parent = await metadata(directory);
    if (!parent?.isDirectory() || parent.isSymbolicLink()) return 'preserved';
  }
  const target = join(directory, 'hosting.json');
  if (await metadata(target)) return 'preserved';
  const placeholder = await readFile(join(root, 'hosting.example.json'));
  let handle;
  try {
    handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') return 'preserved';
    throw error;
  }
  try { await handle.writeFile(placeholder); }
  finally { await handle.close(); }
  return 'created';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await prepareLocalConfig(root);
  console.log(result === 'created'
    ? 'Created public placeholder configuration for local checks only; not deployable.'
    : 'Existing configuration or symlink preserved without reading it.');
}
