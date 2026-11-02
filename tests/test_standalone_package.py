"""Source-package documentation and synthetic local-configuration regressions."""
import importlib.util
import json
from pathlib import Path
import posixpath
import re
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('standalone_package', ROOT / 'scripts' / 'package-renderer.py')
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)
from release_documentation import validate_documentation_links
from validate import ValidationError
from symlink_support import require_symlink_capability
verifier_spec = importlib.util.spec_from_file_location('source_verifier', ROOT / 'scripts' / 'verify-source-packages.py')
verifier = importlib.util.module_from_spec(verifier_spec)
verifier_spec.loader.exec_module(verifier)


class StandaloneSourceTests(unittest.TestCase):
    def test_readme_prepares_config_with_a_real_command(self):
        readme = (ROOT / 'renderer' / 'README.md').read_text()
        self.assertIn('node scripts/prepare-local-config.mjs', readme)
        self.assertNotIn('# cp hosting.example.json .openai/hosting.json', readme)

    def test_archive_relative_markdown_links_are_self_contained(self):
        entries = packaging.source_entries()
        self.assertEqual(entries['LICENSE'], (ROOT / 'LICENSE').read_bytes())
        self.assertEqual(entries['THIRD_PARTY_NOTICES.md'], (ROOT / 'THIRD_PARTY_NOTICES.md').read_bytes())
        self.assertIn(b'not the complete ChatUI Source distribution', entries['README.md'])
        broken = []
        for name, content in entries.items():
            if not name.endswith('.md'):
                continue
            for target in re.findall(r'!?\[[^\]\n]*\]\(([^\s)]+)\)', content.decode('utf-8')):
                if '://' in target or target.startswith('#'):
                    continue
                target = target.split('#', 1)[0]
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
                if resolved not in entries:
                    broken.append((name, target))
        self.assertEqual(broken, [], f'Missing archive documentation references: {broken}')


class LocalConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.template = {'d1': None, 'r2': None, 'project_id': 'synthetic-placeholder', 'capabilities': ['mcp']}
        (self.root / 'hosting.example.json').write_text(json.dumps(self.template) + '\n')

    def prepare(self):
        script = (ROOT / 'renderer' / 'scripts' / 'prepare-local-config.mjs').as_uri()
        code = f'''import fs from 'node:fs/promises';
import {{ syncBuiltinESMExports }} from 'node:module';
const original = fs.readFile;
const root = {json.dumps(str(self.root))};
fs.readFile = function(path, ...args) {{
  if (String(path).startsWith(root + '/.openai') || String(path).startsWith(root + '/synthetic-private'))
    throw new Error('Synthetic private bytes must not be read');
  return original.call(this, path, ...args);
}};
syncBuiltinESMExports();
const {{ prepareLocalConfig }} = await import({json.dumps(script)});
await prepareLocalConfig(root);'''
        return subprocess.run(['node', '--input-type=module', '-e', code], capture_output=True, text=True, check=True)

    def test_fresh_config_uses_public_placeholder_idempotently(self):
        self.prepare()
        target = self.root / '.openai' / 'hosting.json'
        self.assertEqual(json.loads(target.read_text()), self.template)
        original = target.read_bytes()
        self.prepare()
        self.assertEqual(target.read_bytes(), original)

    def test_existing_binding_is_never_read_or_overwritten(self):
        directory = self.root / '.openai'; directory.mkdir()
        target = directory / 'hosting.json'
        original = b'private synthetic sentinel that must never be parsed'
        target.write_bytes(original)
        (self.root / 'hosting.example.json').unlink()
        result = self.prepare()
        self.assertEqual(target.read_bytes(), original)
        self.assertNotIn(original.decode(), result.stdout + result.stderr)

    def test_file_and_parent_symlinks_are_preserved_without_following(self):
        require_symlink_capability(self)
        external = self.root / 'synthetic-private'; external.mkdir()
        bound = external / 'hosting.json'; bound.write_bytes(b'synthetic private binding')
        directory = self.root / '.openai'; directory.mkdir()
        target = directory / 'hosting.json'; target.symlink_to(bound)
        (self.root / 'hosting.example.json').unlink()
        self.prepare()
        self.assertTrue(target.is_symlink())
        self.assertEqual(bound.read_bytes(), b'synthetic private binding')
        target.unlink(); directory.rmdir(); directory.symlink_to(external, target_is_directory=True)
        self.prepare()
        self.assertTrue(directory.is_symlink())
        self.assertEqual(bound.read_bytes(), b'synthetic private binding')

    def test_dangling_symlink_is_preserved_without_creating_its_target(self):
        require_symlink_capability(self)
        directory = self.root / '.openai'; directory.mkdir()
        missing = self.root / 'missing-synthetic-private'
        target = directory / 'hosting.json'; target.symlink_to(missing)
        (self.root / 'hosting.example.json').unlink()
        self.prepare()
        self.assertTrue(target.is_symlink())
        self.assertFalse(missing.exists())


class ArchiveValidationTests(unittest.TestCase):
    def test_markdown_reference_links_and_sibling_paths_are_validated(self):
        entries = {'renderer/README.md': b'[contract](../docs/spec.md#input)\n[detail][d]\n[d]: ../docs/spec.md',
                   'docs/spec.md': b'# Input'}
        self.assertEqual(validate_documentation_links(entries), 2)
        for target in ['/' + 'Users/synthetic/spec.md', 'file:///tmp/spec.md', 'C:/private/spec.md',
                       '../../escape.md', '../%2e%2e/escape.md', '../docs/missing.md', r'..\docs\spec.md']:
            with self.subTest(target=target), self.assertRaises(ValidationError):
                validate_documentation_links({'renderer/README.md': f'[bad]({target})'.encode()})

    def test_archive_rejects_duplicate_entries_and_noncanonical_timestamp(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / 'source.md'; source.write_bytes(b'# Safe')
            archive = directory / 'source.zip'
            selected = {'docs/source.md': source}
            for duplicate, timestamp in [(True, (1980, 1, 1, 0, 0, 0)), (False, (2000, 1, 1, 0, 0, 0))]:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    with zipfile.ZipFile(archive, 'w') as zipped:
                        entry = zipfile.ZipInfo('docs/source.md', timestamp)
                        zipped.writestr(entry, source.read_bytes())
                        if duplicate: zipped.writestr(entry, source.read_bytes())
                with self.assertRaises(ValidationError):
                    verifier.verify_archive(archive, selected)

    def test_archive_checks_documentation_against_its_own_inventory(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / 'source.md'; source.write_bytes(b'[missing](missing.md)')
            archive = directory / 'source.zip'
            with zipfile.ZipFile(archive, 'w') as zipped:
                zipped.writestr(zipfile.ZipInfo('docs/source.md', (1980, 1, 1, 0, 0, 0)), source.read_bytes())
            with self.assertRaises(ValidationError):
                verifier.verify_archive(archive, {'docs/source.md': source})
