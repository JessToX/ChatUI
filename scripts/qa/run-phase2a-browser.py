"""Record the two bounded Phase 2A Playwright CLI checks and their source identity.

Prerequisites: a static HTTP server for renderer/public on 127.0.0.1:4173 and
an open playwright-cli session named phase2a. No private host is contacted.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--cli', type=Path, default=Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh')
parser.add_argument('--session', default='phase2a')
parser.add_argument('--iteration', choices=['phase2a', 'phase2a1'], default='phase2a')
args = parser.parse_args()
directory = root / '.local' / args.iteration / 'browser' / time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
directory.mkdir(parents=True, exist_ok=False)
(root / 'output/playwright' / args.iteration / 'after').mkdir(parents=True, exist_ok=True)
if args.iteration == 'phase2a1':
    (root / 'output/playwright' / args.iteration / 'before').mkdir(parents=True, exist_ok=True)
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
report = {'sourceSha': sha, 'trackedChanges': subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).splitlines(), 'checks': [], 'status': 'RUNNING'}
for name in ['interaction', 'visual'] + (['before'] if args.iteration == 'phase2a1' else []):
    script = root / 'renderer/scripts' / f'{args.iteration}-{name}-checks.js'
    process = subprocess.run([str(args.cli), '-s=' + args.session, 'run-code', script.read_text()], cwd=root, capture_output=True, text=True)
    (directory / f'{name}.log').write_text(process.stdout + process.stderr)
    match = re.search(r'### Result\n(.*?)\n### ', process.stdout, re.S)
    entry = {'name': name, 'command': [str(args.cli), '-s=' + args.session, 'run-code', str(script.relative_to(root))], 'exitCode': process.returncode, 'status': 'FAIL'}
    if process.returncode == 0 and match:
        entry['result'] = json.loads(match.group(1))
        entry['status'] = 'PASS'
    report['checks'].append(entry)
    report['status'] = 'PASS' if all(item['status'] == 'PASS' for item in report['checks']) else 'FAIL'
    (directory / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(name, entry['status'], flush=True)
    if entry['status'] != 'PASS':
        print(process.stdout[-4000:])
        raise SystemExit(1)
report['publicSha256'] = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted((root / 'renderer/public').rglob('*')) if path.is_file()}
shot_root = root / 'output/playwright' / args.iteration
shots = shot_root.rglob('*.png') if args.iteration == 'phase2a1' else (shot_root / 'after').glob('*.png')
report['screenshots'] = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(shots)}
report['scope'] = 'HTTP prototypes only; manual screen reader UNKNOWN, private host NOT RUN, file Gallery NOT RUN'
(directory / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(directory.relative_to(root) / 'results.json', flush=True)
