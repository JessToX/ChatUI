"""Distribution must bind committed bytes and reject contaminated input."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('distribution', ROOT / 'scripts/package-distribution.py')
distribution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(distribution)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.run_git('init', '-q')
        self.run_git('config', 'user.name', 'Synthetic Test')
        self.run_git('config', 'user.email', 'synthetic@example.invalid')
        (self.root / 'payload.txt').write_bytes(b'public fixture\n')
        self.manifest()
        self.commit()

    def run_git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root)

    def manifest(self):
        files = {'payload.txt': hashlib.sha256((self.root / 'payload.txt').read_bytes()).hexdigest()}
        (self.root / 'PACKAGE-MANIFEST.json').write_text(json.dumps({'files': files}))

    def commit(self):
        self.run_git('add', '.')
        self.run_git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'synthetic fixture')

    def test_exact_source_and_deterministic_zip_modes(self):
        commit, _, entries, modes = distribution.read_source(self.root)
        self.assertEqual(commit, self.run_git('rev-parse', 'HEAD').decode().strip())
        self.assertEqual(entries['payload.txt'], b'public fixture\n')
        first = distribution.zipped(entries, modes, 'ChatUI-Source')
        self.assertEqual(first, distribution.zipped(dict(reversed(list(entries.items()))), modes, 'ChatUI-Source'))
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read('ChatUI-Source/payload.txt'), entries['payload.txt'])
            self.assertEqual((archive.getinfo('ChatUI-Source/payload.txt').external_attr >> 16) & 0o777, 0o644)

    def test_dirty_input_rejected(self):
        (self.root / 'payload.txt').write_text('modified')
        with self.assertRaisesRegex(RuntimeError, 'clean committed'):
            distribution.read_source(self.root)

    def test_committed_extra_file_rejected_by_manifest(self):
        (self.root / 'extra.txt').write_text('public fixture')
        self.commit()
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            distribution.read_source(self.root)

    def test_stale_hash_rejected(self):
        (self.root / 'payload.txt').write_text('modified')
        self.commit()
        with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
            distribution.read_source(self.root)

    def test_source_symlink_rejected(self):
        (self.root / 'link.txt').symlink_to('payload.txt')
        self.commit()
        with self.assertRaisesRegex(RuntimeError, 'regular source'):
            distribution.read_source(self.root)

    def test_existing_or_in_source_output_rejected(self):
        for output in (self.root, self.root / 'artifacts', self.root.parent):
            with self.subTest(output=output), self.assertRaises(RuntimeError):
                distribution.package(self.root, output)
