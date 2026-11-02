"""Synthetic packaging/privacy regressions; never inspect user-private inputs."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from release_inventory import checked_bytes, selected_files
from validate import ValidationError
from symlink_support import require_symlink_capability

spec = importlib.util.spec_from_file_location('metadata_sync', Path(__file__).resolve().parents[1] / 'scripts' / 'sync-plugin-metadata.py')
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)


class ReleaseInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.manifest = self.root / 'allowlist.json'
        (self.root / 'renderer').mkdir()
        (self.root / 'renderer' / 'safe.mjs').write_text('export const safe = true;')

    def select(self, names):
        self.manifest.write_text(json.dumps({'schemaVersion': 1, 'renderer': names, 'plugin': []}))
        return selected_files('renderer', self.root, self.manifest)

    def test_unlisted_private_content_is_never_read(self):
        private = self.root / 'renderer' / '.env'
        private.write_text('synthetic excluded data')
        original = Path.read_bytes
        def guarded(path):
            if path == private:
                self.fail('Excluded private bytes must not be opened')
            return original(path)
        with patch.object(Path, 'read_bytes', guarded):
            files = self.select(['renderer/safe.mjs'])
            self.assertEqual(len(files), 1)
            self.assertEqual(checked_bytes(files[0][1], files[0][0]), b'export const safe = true;')

    def test_forbidden_paths_and_symlinks_fail_before_content_read(self):
        require_symlink_capability(self)
        for name in ['renderer/.env', 'renderer/.openai/hosting.json', 'renderer/experiments/worker.mjs', 'renderer/../outside', '/outside']:
            with self.subTest(name=name), self.assertRaises(ValidationError):
                self.select([name])
        (self.root / 'renderer' / 'link.mjs').symlink_to(self.root / 'renderer' / 'safe.mjs')
        with self.assertRaises(ValidationError):
            self.select(['renderer/link.mjs'])
        directory = self.root / 'renderer' / 'real'; directory.mkdir()
        (directory / 'safe.mjs').write_text('synthetic source')
        (self.root / 'renderer' / 'linked').symlink_to(directory, target_is_directory=True)
        with self.assertRaises(ValidationError):
            self.select(['renderer/linked/safe.mjs'])

    def test_duplicate_and_missing_entries_fail(self):
        for names in [['renderer/safe.mjs', 'renderer/safe.mjs'], ['renderer/missing.mjs']]:
            with self.assertRaises(ValidationError): self.select(names)

    def test_sensitive_allowlisted_bytes_fail_without_echo(self):
        path = self.root / 'renderer' / 'safe.mjs'
        path.write_text('-----BEGIN ' + 'PRIVATE KEY----- synthetic test data')
        with self.assertRaises(ValidationError) as result:
            checked_bytes(path, 'renderer/safe.mjs')
        self.assertNotIn('BEGIN PRIVATE KEY', str(result.exception))

    def test_metadata_derives_portable_fields_and_preserves_extra_fields(self):
        portable = {'name': 'chatui', 'version': '0.9.1', 'description': 'current', 'extensions': {'com.openai': {'interface': {'defaultPrompt': 'render_html'}, 'apps': './.app.json'}}}
        result = metadata.expected_overlay(portable, {'version': '0.9.0', 'accountMetadata': {'formatRevision': 2}})
        self.assertEqual(result['version'], portable['version'])
        self.assertEqual(result['interface'], portable['extensions']['com.openai']['interface'])
        self.assertEqual(result['accountMetadata'], {'formatRevision': 2})

    def test_metadata_check_does_not_write_and_can_sync_idempotently(self):
        plugin = self.root / 'plugin'; (plugin / '.codex-plugin').mkdir(parents=True)
        (plugin / 'plugin.json').write_text(json.dumps({'name': 'chatui', 'version': '0.9.1', 'description': 'source'}))
        overlay = plugin / '.codex-plugin' / 'plugin.json'; overlay.write_text('{"version":"0.9.0"}')
        original = overlay.read_bytes()
        with self.assertRaises(ValueError): metadata.sync(plugin, check=True)
        self.assertEqual(overlay.read_bytes(), original)
        metadata.sync(plugin); once = overlay.read_bytes(); metadata.sync(plugin)
        self.assertEqual(overlay.read_bytes(), once); metadata.sync(plugin, check=True)

    def candidate_sources(self):
        plugin = self.root / 'plugins' / 'chatui'
        (plugin / '.codex-plugin').mkdir(parents=True)
        (plugin / 'plugin.json').write_text(json.dumps({'version': '1.0.0', 'description': '本地候选，尚未发布'}))
        (plugin / '.codex-plugin' / 'plugin.json').write_text('{}')
        metadata.sync(plugin)
        (self.root / 'renderer' / 'lib').mkdir()
        (self.root / 'renderer' / 'package.json').write_text('{"version":"1.6.1-iteration.1"}')
        (self.root / 'renderer' / 'package-lock.json').write_text('{"version":"1.6.1-iteration.1","packages":{"":{"version":"1.6.1-iteration.1"}}}')
        (self.root / 'renderer' / 'lib' / 'version.generated.mjs').write_text('export const rendererVersion = "1.6.1-iteration.1";')
        for name in ('README.md', 'renderer/README.md', 'plugins/chatui/skills/chatui/SKILL.md',
                     'plugins/chatui/skills/chatui-progress/SKILL.md'):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('Local candidate 1.0.0 / 1.6.1-iteration.1, not published')
        return plugin

    def test_candidate_check_is_read_only_and_rejects_stale_generated_version(self):
        self.candidate_sources()
        self.assertEqual(metadata.check_candidate(self.root)['renderer'], '1.6.1-iteration.1')
        generated = self.root / 'renderer' / 'lib' / 'version.generated.mjs'
        generated.write_text('export const rendererVersion = "1.5.0";')
        before = generated.read_bytes()
        with self.assertRaisesRegex(ValueError, 'generate:widget'):
            metadata.check_candidate(self.root)
        self.assertEqual(generated.read_bytes(), before)

    def test_candidate_check_rejects_lock_drift_and_unlabeled_release_wording(self):
        self.candidate_sources()
        lock = self.root / 'renderer' / 'package-lock.json'
        original = lock.read_text()
        lock.write_text('{"version":"1.6.1-iteration.1","packages":{"":{"version":"1.5.0"}}}')
        with self.assertRaisesRegex(ValueError, 'lockfile package'):
            metadata.check_candidate(self.root)
        lock.write_text(original)
        (self.root / 'renderer' / 'README.md').write_text('Renderer 1.6.1-iteration.1 / Plugin 1.0.0 published')
        with self.assertRaisesRegex(ValueError, 'local candidate'):
            metadata.check_candidate(self.root)
