"""Real entrypoint guards must reject contaminated inputs before running commands."""
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/qa/reproduce-release-package.py'

class ReachedCommands(Exception):
    pass

class ReleaseCandidateGateTests(unittest.TestCase):
    def fixture(self, root):
        (root / 'scripts').mkdir()
        entry = root / 'scripts/reproduce-package.py'
        entry.write_bytes(SOURCE.read_bytes())
        (root / 'payload.txt').write_text('public synthetic fixture')
        files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in (entry, root / 'payload.txt')}
        (root / 'PACKAGE-MANIFEST.json').write_text(json.dumps({'files': files}))
        return entry

    def verify(self, mutate, error):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            entry = self.fixture(root)
            mutate(root)
            with patch('subprocess.run', side_effect=ReachedCommands) as command:
                with self.assertRaises(error):
                    runpy.run_path(str(entry), run_name='__main__')
                self.assertEqual(command.call_count, 1 if error is ReachedCommands else 0)

    def test_clean_git_directory_does_not_become_source(self):
        self.verify(lambda r: (r / '.git').mkdir(), ReachedCommands)

    def test_modified_input_blocks_commands(self):
        self.verify(lambda r: (r / 'payload.txt').write_text('changed'), RuntimeError)

    def test_nested_dist_extra_is_not_hidden(self):
        def mutate(r):
            p = r / 'renderer/lib/dist'; p.mkdir(parents=True)
            (p / 'extra.js').write_text('synthetic')
        self.verify(mutate, RuntimeError)

    def test_existing_hosting_configuration_blocks_commands(self):
        self.verify(lambda r: (r / 'renderer/.openai').mkdir(parents=True), RuntimeError)

    def test_git_symlink_is_not_a_source_exception(self):
        self.verify(lambda r: (r / '.git').symlink_to(r / 'scripts', target_is_directory=True), RuntimeError)

    def test_same_bytes_file_symlink_blocks_commands(self):
        def mutate(r):
            p = r / 'payload.txt'; p.rename(r / 'target.txt'); p.symlink_to(r / 'target.txt')
        self.verify(mutate, RuntimeError)

class CandidateSourceBindingTests(unittest.TestCase):
    def setUp(self):
        import importlib.util
        import subprocess
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        entry = self.root / 'scripts/qa/package-release-candidate.py'
        entry.parent.mkdir(parents=True)
        entry.write_text('# synthetic committed fixture\n')
        (self.root / 'payload.txt').write_bytes(b'committed')
        app = self.root / 'plugins/chatui/.app.json'
        app.parent.mkdir(parents=True)
        app.write_text('{"syntheticBinding":true}')
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)
        self.sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.root, text=True).strip()
        spec = importlib.util.spec_from_file_location('candidate_packager', SOURCE.with_name('package-release-candidate.py'))
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.module.__file__ = str(entry)

    def test_committed_bytes_and_public_placeholder_are_accepted(self):
        import subprocess
        with patch.object(self.module.subprocess, 'check_output', wraps=subprocess.check_output) as calls:
            self.module.verify_source(self.root, self.sha, {'payload.txt': b'committed', 'plugins/chatui/.app.json': b'{}'})
        self.assertFalse(any(c.args[0][:2] == ['git', 'show'] and '.app.json' in c.args[0][-1] for c in calls.call_args_list))

    def test_untracked_allowlisted_input_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'committed tree'):
            self.module.verify_source(self.root, self.sha, {'extra.txt': b'extra'})

    def test_modified_committed_input_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'bytes differ'):
            self.module.verify_source(self.root, self.sha, {'payload.txt': b'modified'})

    def test_cross_checkout_packager_is_rejected(self):
        self.module.__file__ = str(self.root / 'different.py')
        with self.assertRaisesRegex(RuntimeError, 'same source checkout'):
            self.module.verify_source(self.root, self.sha, {'payload.txt': b'committed'})

    def test_provenance_does_not_read_account_binding(self):
        with patch.object(self.module.subprocess, 'check_output') as calls:
            self.assertIsNone(self.module.original_bytes(self.root, self.sha, 'plugins/chatui/.app.json'))
        calls.assert_not_called()
