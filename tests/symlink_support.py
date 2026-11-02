"""Skip only unavailable symlink capability; preserve actual security tests elsewhere."""
import os
from pathlib import Path
import tempfile

def require_symlink_capability(case):
    try:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / 'synthetic-target.txt'
            target.write_text('synthetic', encoding='utf8')
            (root / 'synthetic-link.txt').symlink_to(target)
    except OSError as error:
        if os.name == 'nt' and getattr(error, 'winerror', None) == 1314:
            case.skipTest('Windows symlink privilege unavailable (WinError 1314); security assertions remain required on a capable runner')
        raise
