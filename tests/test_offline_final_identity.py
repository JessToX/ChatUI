"""Final identity rejects old safety baselines and tracked/index changes."""
import sys
from pathlib import Path
import unittest
import importlib.util
import subprocess
import tempfile
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import offline_final_identity as identity

REPAIR_BRANCH = 'codex/final-edition-s01-a00'


class OfflineFinalIdentityTests(unittest.TestCase):
    def test_review_summary_rejects_the_observed_old_branch_baseline_and_status(self):
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location('offline_review_identity', root / 'scripts/qa/package-phase3-review.py')
        review = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(review)
        head, status = '0' * 40, 'OFFLINE FINAL CANDIDATE READY WITH DECLARED LIMITATIONS'
        def text(branch=REPAIR_BRANCH, baseline=identity.BASELINE, state=status):
            return f'Status: **{state}**.\nFinal local commit: `{head}` on `{branch}`, baseline `{baseline}`.\n'.encode()
        review.validate_summary_identity(text(), head, REPAIR_BRANCH, identity.BASELINE, status)
        for content in (text(branch='codex/final-edition'), text(baseline='e8a6a07d' + '0' * 32), text(state='RC READY')):
            with self.assertRaisesRegex(ValueError, 'differs from final evidence'):
                review.validate_summary_identity(content, head, REPAIR_BRANCH, identity.BASELINE, status)

    def calls(self, status='', branch=REPAIR_BRANCH, ancestor=True):
        def output(command, **_kwargs):
            args = command[2:]
            if args == ['rev-parse', 'HEAD']:
                return identity.BASELINE + '\n'
            if args == ['branch', '--show-current']:
                return branch + '\n'
            if args == ['status', '--porcelain', '--untracked-files=no']:
                return status
            if args == ['ls-files', '--others', '--exclude-standard']:
                return 'docs/final-edition/phase4a-private-preparation.json\n'
            raise AssertionError(command)
        return patch.object(identity.subprocess, 'check_output', side_effect=output), patch.object(
            identity.subprocess, 'run', return_value=Mock(returncode=0 if ancestor else 1))

    def test_excluded_preparation_is_preserved_without_becoming_dirty_source(self):
        first, second = self.calls()
        with first, second:
            state = identity.require_clean(Path.cwd())
        self.assertFalse(state['captureWorktreeDirty'])
        self.assertEqual(state['excludedUntrackedCount'], 1)
        self.assertNotIn('untrackedPaths', state)

    def test_tracked_and_staged_changes_block_final_assets(self):
        for status in (' M README.md', 'M  README.md', 'A  new-source.py'):
            first, second = self.calls(status=status)
            with first, second, self.assertRaisesRegex(ValueError, 'clean tracked'):
                identity.require_clean(Path.cwd())

    def test_main_integration_and_repair_branches_require_the_same_safety_ancestry(self):
        for branch in ('main', 'codex/git-consolidation-phase1', REPAIR_BRANCH):
            first, second = self.calls(branch=branch)
            with first, second:
                self.assertEqual(identity.require_clean(Path.cwd())['branch'], branch)
            first, second = self.calls(branch=branch, ancestor=False)
            with first, second, self.assertRaisesRegex(ValueError, 'latest safety baseline'):
                identity.require_clean(Path.cwd())

    def test_detached_head_is_rejected(self):
        first, second = self.calls(branch='')
        with first, second, self.assertRaisesRegex(ValueError, 'attached branch'):
            identity.require_clean(Path.cwd())

    def test_stale_or_missing_source_identity_is_rejected(self):
        state = {'sourceSha': '1' * 40, 'branch': 'main', 'baselineSha': identity.BASELINE,
                 'captureWorktreeDirty': False}
        identity.require_same_source(state, dict(state))
        for key, value in [('sourceSha', '0' * 40), ('branch', REPAIR_BRANCH),
                           ('baselineSha', '0' * 40), ('captureWorktreeDirty', True)]:
            observed = {**state, key: value}
            with self.assertRaisesRegex(ValueError, 'source identity differs'):
                identity.require_same_source(state, observed)
            del observed[key]
            with self.assertRaisesRegex(ValueError, 'source identity differs'):
                identity.require_same_source(state, observed)

    def test_real_merge_to_main_binds_safety_identity_and_rejects_dirty_or_detached_source(self):
        # Only this new disposable repository is mutated; existing main is untouched.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            def git(*args):
                return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null',
                    '-c', 'commit.gpgsign=false', '-c', 'user.name=Identity Test',
                    '-c', 'user.email=identity-test@example.invalid', *args], cwd=root,
                    text=True, stderr=subprocess.STDOUT).strip()
            git('init', '-b', 'main')
            (root / 'source.txt').write_text('old baseline\n')
            git('add', 'source.txt')
            git('commit', '-m', 'old baseline')
            old = git('rev-parse', 'HEAD')
            git('switch', '-c', 'safety-fixture')
            (root / 'source.txt').write_text('quiz safety baseline\n')
            git('commit', '-am', 'safety baseline')
            safety = git('rev-parse', 'HEAD')
            git('switch', 'main')
            with patch.object(identity, 'BASELINE', safety):
                with self.assertRaisesRegex(ValueError, 'latest safety baseline'):
                    identity.require_clean(root)
                git('merge', '--no-ff', 'safety-fixture', '-m', 'retain both histories')
                state = identity.require_clean(root)
                self.assertEqual(state['branch'], 'main')
                self.assertEqual(state['sourceSha'], git('rev-parse', 'HEAD'))
                self.assertEqual(state['baselineSha'], safety)
                self.assertEqual(git('rev-parse', 'HEAD^1'), old)
                self.assertEqual(git('rev-parse', 'HEAD^2'), safety)
                (root / 'private-preparation.txt').write_text('excluded fixture\n')
                self.assertEqual(identity.require_clean(root)['excludedUntrackedCount'], 1)
                (root / 'source.txt').write_text('dirty\n')
                with self.assertRaisesRegex(ValueError, 'clean tracked'):
                    identity.require_clean(root)
                git('add', 'source.txt')
                with self.assertRaisesRegex(ValueError, 'clean tracked'):
                    identity.require_clean(root)
                git('commit', '-m', 'fixture update')
                git('switch', '--detach')
                with self.assertRaisesRegex(ValueError, 'attached branch'):
                    identity.require_clean(root)
