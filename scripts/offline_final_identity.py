"""Commit-bound local Offline Final identity; excluded data never enters the source.

Existing untracked preparation files are allowed only because every packaged
byte is separately checked against the commit and the public allowlist.
The exact safety commit is required on every attached branch, including main;
branch names are recorded as evidence, never used as a substitute for ancestry.
"""
from pathlib import Path
import subprocess

BASELINE = '6639b8a361db7c65ad1281cc1833b94bc3a6a616'


def capture(root):
    root = Path(root)

    def git(*args):
        return subprocess.check_output(['git', '--no-optional-locks', *args], cwd=root, text=True).strip()

    head = git('rev-parse', 'HEAD')
    branch = git('branch', '--show-current')
    if not branch:
        raise ValueError('Offline Final requires an attached branch')
    if subprocess.run(['git', 'merge-base', '--is-ancestor', BASELINE, head], cwd=root,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        raise ValueError('Offline Final must include the exact latest safety baseline')
    return {
        'sourceSha': head, 'branch': branch, 'baselineSha': BASELINE,
        'captureWorktreeDirty': bool(git('status', '--porcelain', '--untracked-files=no')),
        'captureStatusScope': 'Tracked worktree and index; excluded untracked preparation files are preserved separately',
        'excludedUntrackedCount': len(git('ls-files', '--others', '--exclude-standard').splitlines()),
    }


def require_clean(root):
    state = capture(root)
    if state['captureWorktreeDirty']:
        raise ValueError('Offline Final requires a clean tracked worktree and index')
    return state


def require_same_source(expected, observed):
    """Reject stale evidence or a branch/commit change during an operation."""
    fields = ('sourceSha', 'branch', 'baselineSha', 'captureWorktreeDirty')
    if any(field not in observed or observed[field] != expected[field] for field in fields):
        raise ValueError('Offline Final source identity differs from captured evidence')
