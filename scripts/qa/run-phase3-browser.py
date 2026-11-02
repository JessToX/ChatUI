"""Verify a freshly extracted candidate Gallery via the standardized CLI.

The default suite repeats all 128 layouts and 32 specialized interactions from
Phase 2B and adds explicit Phase 3 accessibility/performance evidence. A final
run requires --gallery-zip and --expected-head; directory runs are preflight
only and retain their honest capture SHA/dirty state. No browser installation,
private host, Safari setting or accessibility permission is changed.
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import json
from pathlib import Path, PurePosixPath
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import threading
import time
import zipfile
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import offline_final_identity

GALLERY_FILES = {'index.html', 'fixtures.json', 'renderer.html', 'README.md', 'THIRD_PARTY_NOTICES.md', 'manifest.json', 'SHA256SUMS'}
CHECK_NAMES = ['slice', 'layout', 'interaction', 'security', 'accessibility', 'performance']


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resource_hashes(directory: Path) -> dict[str, str]:
    return {str(path.relative_to(directory)): digest(path) for path in sorted(directory.rglob('*')) if path.is_file()}


def extract_gallery(archive: Path, destination: Path) -> Path:
    """Extract only the known Gallery files; fail before writing unsafe entries."""
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or set(names) != GALLERY_FILES:
            raise ValueError('Gallery ZIP must contain each of the seven allowlisted files exactly once')
        for entry in entries:
            path = PurePosixPath(entry.filename)
            mode = (entry.external_attr >> 16) & 0xffff
            if entry.is_dir() or path.is_absolute() or '..' in path.parts or '\\' in entry.filename or stat.S_ISLNK(mode):
                raise ValueError('Unsafe Gallery ZIP entry: ' + entry.filename)
            if entry.file_size > 4 * 1024 * 1024:
                raise ValueError('Unexpected Gallery resource size: ' + entry.filename)
        destination.mkdir(parents=True, exist_ok=False)
        for entry in entries:
            (destination / entry.filename).write_bytes(source.read(entry))
    manifest = json.loads((destination / 'manifest.json').read_text())
    for record in manifest['files']:
        if record['path'] not in GALLERY_FILES - {'manifest.json', 'SHA256SUMS'}:
            raise ValueError('Manifest path outside Gallery allowlist')
        path = destination / record['path']
        if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
            raise ValueError('Gallery manifest byte/hash mismatch: ' + record['path'])
    checksum_records = {}
    for line in (destination / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([^\r\n]+)', line)
        if not match or match.group(2) not in GALLERY_FILES - {'SHA256SUMS'} or match.group(2) in checksum_records:
            raise ValueError('Malformed/unsafe Gallery checksum record')
        checksum_records[match.group(2)] = match.group(1)
    if set(checksum_records) != GALLERY_FILES - {'SHA256SUMS'}:
        raise ValueError('Gallery checksum list is incomplete')
    if any(digest(destination / name) != checksum for name, checksum in checksum_records.items()):
        raise ValueError('Gallery checksum verification failed')
    return destination


def public_browser_inventory() -> dict:
    browsers = {}
    for name in ['Google Chrome', 'Chromium', 'Firefox', 'Safari']:
        info = Path('/Applications') / (name + '.app') / 'Contents/Info.plist'
        if info.is_file():
            metadata = plistlib.loads(info.read_bytes())
            browsers[name] = {'version': metadata.get('CFBundleShortVersionString'), 'build': metadata.get('CFBundleVersion'), 'applicationPath': str(info.parents[1])}
        else:
            browsers[name] = {'status': 'UNKNOWN / NOT RUN', 'reason': 'Not installed at standard public /Applications location; no install attempted'}
    return browsers


def command_version(command: list[str]) -> str:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=10)
    return (result.stdout + result.stderr).strip() if result.returncode == 0 else 'UNKNOWN'


def run() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--cli', type=Path, default=Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh')
    parser.add_argument('--session', default='phase3')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--gallery-zip', type=Path)
    source.add_argument('--gallery-dir', type=Path, help='Preflight only; final acceptance must start from ZIP')
    parser.add_argument('--expected-head', help='Require this clean final commit SHA')
    parser.add_argument('--mode', choices=['file', 'http', 'both'], default='both')
    parser.add_argument('--checks', nargs='+', choices=CHECK_NAMES, default=CHECK_NAMES)
    parser.add_argument('--reuse-session', action='store_true')
    parser.add_argument('--label', default='capture')
    parser.add_argument('--offline-final', action='store_true')
    args = parser.parse_args()
    state = offline_final_identity.capture(ROOT) if args.offline_final else {}
    if not shutil.which('npx'):
        parser.error('npx is unavailable; no package/browser installation attempted')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = subprocess.check_output(['git', 'status', '--porcelain', *(['--untracked-files=no'] if args.offline_final else [])], cwd=ROOT, text=True).splitlines()
    if args.expected_head and (head != args.expected_head or dirty):
        parser.error('--expected-head requires the exact clean final commit')
    if args.expected_head and not args.gallery_zip:
        parser.error('Final commit verification requires actual --gallery-zip extraction')
    label = re.sub(r'[^a-zA-Z0-9_-]', '-', args.label)[:64]
    run_id = f'{time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())}-{label}-{time.time_ns() % 1000000:06d}'
    directory = ROOT / '.local/phase3/browser' / run_id
    shots = ROOT / 'output/playwright/phase3' / run_id
    directory.mkdir(parents=True, exist_ok=False); shots.mkdir(parents=True, exist_ok=False)
    gallery = extract_gallery(args.gallery_zip.resolve(), directory / 'extracted-gallery') if args.gallery_zip else args.gallery_dir.resolve()
    if gallery.is_symlink() or any(path.is_symlink() for path in gallery.rglob('*')):
        parser.error('Gallery directory must contain regular resources only')
    entry = gallery / 'index.html'
    if not entry.is_file():
        parser.error('Gallery entry index.html is required')
    manifest = json.loads((gallery / 'manifest.json').read_text())
    hashes = resource_hashes(gallery)
    report = {
        **state, 'status': 'RUNNING', 'captureGitHead': head, 'captureWorktreeDirty': dirty,
        'finalCommitSHA': args.expected_head,
        'finalResourceVerification': 'PENDING' if args.expected_head else 'PREFLIGHT ONLY',
        'environment': {'platform': platform.platform(), 'python': platform.python_version(), 'node': command_version(['node', '--version']), 'npm': command_version(['npm', '--version']), 'browsers': public_browser_inventory()},
        'galleryResourceSHA256': hashes, 'fixtureHash': manifest.get('fixtureHash'), 'rendererResourceSHA256': digest(gallery / 'renderer.html'),
        'productionDocumentResourceSHA256': digest(ROOT / 'renderer/public/chatui-document.html'),
        'source': {'kind': 'fresh Gallery ZIP extraction' if args.gallery_zip else 'directory preflight', 'archivePath': str(args.gallery_zip.resolve()) if args.gallery_zip else None, 'archiveSHA256': digest(args.gallery_zip.resolve()) if args.gallery_zip else None, 'archiveBytes': args.gallery_zip.stat().st_size if args.gallery_zip else None, 'extractionPath': str(gallery), 'extractedBytes': sum(path.stat().st_size for path in gallery.rglob('*') if path.is_file())},
        'checks': [], 'limitations': {'Safari': 'UNKNOWN / NOT RUN: existing Safari Remote Automation restriction; no system setting change', 'Firefox': 'UNKNOWN / NOT RUN: not installed at standard public /Applications location', 'VoiceOver': 'UNKNOWN / NOT RUN: no manual screen reader session', 'nativeBrowserUIZoom': 'UNKNOWN / NOT RUN: CSS zoom surrogate and narrow reflow measured separately', 'realChatGPTHost': 'NOT RUN', 'userComprehension': 'NOT RUN'},
    }
    if args.expected_head:
        for name, resource_hash in hashes.items():
            committed = subprocess.check_output(['git', 'show', f'{head}:renderer/public/gallery/{name}'], cwd=ROOT)
            if hashlib.sha256(committed).hexdigest() != resource_hash:
                parser.error('Extracted ZIP bytes do not match final commit Gallery: ' + name)
    fixtures = json.loads((gallery / 'fixtures.json').read_text())
    fallbacks = {scene['id']: scene['text'] for scene in fixtures['scenarios']}
    tool_fallbacks = {scene['id']: scene['toolFallback'] for scene in fixtures['scenarios'] if 'toolFallback' in scene}
    def quiz_questions(blocks, grading):
        questions = []
        for block in blocks:
            if block.get('type') == 'quiz':
                # Independent fixed-fixture oracle, never production hydration.
                quiz = next(item for item in grading if item['id'] == block['id'])
                for question in block['data']['questions']:
                    grade = next(item for item in quiz['questions'] if item['id'] == question['id'])
                    questions.append({**question, **grade})
            questions.extend(quiz_questions(block.get('blocks', []), grading))
            for item in block.get('items', []):
                if isinstance(item, dict): questions.extend(quiz_questions(item.get('blocks', []), grading))
        return questions
    quiz_oracle = {scene['id']: quiz_questions(scene.get('view', {}).get('blocks', []), scene['_meta']['chatui']['quizGrading']['quizzes']) for scene in fixtures['scenarios'] if scene.get('hasQuiz')}
    golden = json.loads((ROOT / 'renderer/examples/math-physics-golden.json').read_text())
    def save():
        report['screenshots'] = {str(path.relative_to(ROOT)): digest(path) for path in sorted(shots.glob('*.png'))}
        (directory / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    save()
    def cli(command):
        return subprocess.run([str(args.cli), '-s=' + args.session, *command], cwd=ROOT, capture_output=True, text=True, timeout=1800)
    if not args.reuse_session:
        opened = cli(['open', 'about:blank', '--browser', 'chrome'])
        (directory / 'open.log').write_text(opened.stdout + opened.stderr)
        if opened.returncode or 'Error' in opened.stdout:
            report['status'] = 'BLOCKED'; save(); print(directory / 'results.json', flush=True); return 1
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs): super().__init__(*values, directory=str(gallery), **kwargs)
        def log_message(self, *_values): pass
    blocked = cli(['run-code', "async (page) => { await page.route('**/*', route => { const u = new URL(route.request().url()); return u.protocol === 'file:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1') ? route.continue() : route.abort(); }); return { externalRequests: 'blocked', scope: 'Gallery page only; system network remains unchanged' }; }"])
    (directory / 'network-isolation.log').write_text(blocked.stdout + blocked.stderr)
    if blocked.returncode or 'Error' in blocked.stdout:
        report['status'] = 'BLOCKED'; save(); return 1
    report['networkIsolation'] = 'Browser page route blocks every non-file/non-loopback request; every suite also asserts zero unexpected requests'
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        for mode in ['file', 'http'] if args.mode == 'both' else [args.mode]:
            url = entry.as_uri() if mode == 'file' else f'http://127.0.0.1:{server.server_port}/index.html'
            for name in args.checks:
                prefix = 'phase3' if name in ['accessibility', 'performance'] else 'phase2b'
                script = ROOT / 'renderer/scripts' / f'{prefix}-{name}-checks.js'
                config = {'url': url, 'mode': mode, 'screenshots': str(shots.relative_to(ROOT)), 'manifest': manifest, 'fallbacks': fallbacks, 'toolFallbacks': tool_fallbacks, 'quizOracle': quiz_oracle, 'golden': golden}
                code = f'async (page) => {{ const check = ({script.read_text()}); return check(page, {json.dumps(config, ensure_ascii=False)}); }}'
                before = resource_hashes(gallery)
                process = cli(['run-code', code])
                (directory / f'{mode}-{name}.log').write_text(process.stdout + process.stderr)
                match = re.search(r'### Result\n(.*?)\n### ', process.stdout, re.S)
                result = {'mode': mode, 'name': name, 'command': ['playwright-cli', '-s=' + args.session, 'run-code', str(script.relative_to(ROOT))], 'scriptSHA256': digest(script), 'exitCode': process.returncode, 'status': 'FAIL'}
                if process.returncode == 0 and match:
                    result['result'] = json.loads(match.group(1)); result['status'] = result['result'].get('status', 'FAIL')
                after = resource_hashes(gallery)
                result['resourceIdentity'] = {'before': before, 'after': after, 'byteEquality': before == after == hashes}
                if not result['resourceIdentity']['byteEquality']: result['status'] = 'FAIL'; result['resourceDrift'] = 'Extracted Gallery bytes changed during capture'
                report['checks'].append(result)
                report['status'] = 'RUNNING' if all(item['status'] == 'PASS' for item in report['checks']) else 'FAIL'
                save(); print(f'{mode} {name}: {result["status"]}', flush=True)
                if result['status'] != 'PASS':
                    failure = result.get('result', {})
                    print(json.dumps({'failures': failure.get('failures', []), 'checks': [item for item in failure.get('checks', []) if item['status'] != 'PASS'], 'pageErrors': failure.get('pageErrors', []), 'cliError': process.stdout[:1200] if not match else None}, ensure_ascii=False), flush=True)
                    print(directory / 'results.json', flush=True); return 1
        report['coverage'] = {'layoutCount': sum(item.get('result', {}).get('count', 0) for item in report['checks'] if item['name'] == 'layout'), 'specializedCount': sum(len(item.get('result', {}).get('checks', [])) for item in report['checks'] if item['name'] in ['interaction', 'security']), 'accessibilityCount': sum(len(item.get('result', {}).get('checks', [])) for item in report['checks'] if item['name'] == 'accessibility'), 'mountSamples': sum(len(item.get('result', {}).get('samples', [])) for item in report['checks'] if item['name'] == 'performance'), 'requiredModesAndChecksComplete': args.mode == 'both' and set(args.checks) == set(CHECK_NAMES)}
        report['status'] = 'PASS'
        if args.expected_head: report['finalResourceVerification'] = 'PASS: fresh ZIP/capture/final commit Gallery byte identity'
        report['scope'] = 'Real installed Chrome: selected Gallery bytes under file and loopback HTTP; explicit automatic a11y and mount checkpoints; no private host/manual screen reader acceptance'
        save(); print(directory / 'results.json', flush=True); return 0
    finally:
        server.shutdown(); server.server_close()
        if not args.reuse_session:
            closed = cli(['close']); (directory / 'close.log').write_text(closed.stdout + closed.stderr)


if __name__ == '__main__':
    raise SystemExit(run())
