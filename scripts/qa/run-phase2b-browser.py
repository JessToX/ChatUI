"""Run actual Chromium Gallery checks through the existing Playwright CLI.

No browser or package installation is performed by this entry point. Each run
has its own evidence and screenshot directory. HTTP serves only the selected
public Gallery directory on loopback; file mode opens the same entry bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import json
from pathlib import Path
import platform
import re
import subprocess
import threading
import time


ROOT = Path(__file__).resolve().parents[2]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--cli', type=Path, default=Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh')
    parser.add_argument('--session', default='phase2b')
    parser.add_argument('--gallery-dir', type=Path, default=ROOT / 'renderer/public/gallery')
    parser.add_argument('--mode', choices=['file', 'http', 'both'], default='both')
    parser.add_argument('--checks', nargs='+', choices=['slice', 'layout', 'interaction', 'security'], default=['slice', 'layout', 'interaction', 'security'])
    parser.add_argument('--reuse-session', action='store_true')
    parser.add_argument('--label', default='capture')
    args = parser.parse_args()
    gallery = args.gallery_dir.resolve()
    entry = gallery / 'index.html'
    if not entry.is_file() or entry.is_symlink():
        parser.error('Gallery entry must be a regular generated index.html')
    label = re.sub(r'[^a-zA-Z0-9_-]', '-', args.label)[:64]
    run_id = f'{time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())}-{label}-{time.time_ns() % 1000000:06d}'
    directory = ROOT / '.local/phase2b/browser' / run_id
    shots = ROOT / 'output/playwright/phase2b' / run_id
    directory.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    report = {
        'status': 'RUNNING', 'captureGitHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'captureWorktreeDirty': subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).splitlines(),
        'environment': {'platform': platform.platform(), 'python': platform.python_version()},
        'galleryResourceSHA256': {str(p.relative_to(gallery)): digest(p) for p in sorted(gallery.rglob('*')) if p.is_file()},
        'rendererResourceSHA256': digest(gallery / 'renderer.html') if (gallery / 'renderer.html').is_file() else None,
        'productionDocumentResourceSHA256': digest(ROOT / 'renderer/public/chatui-document.html'),
        'fixtureHash': None, 'checks': [], 'finalCommitSHA': None, 'finalResourceVerification': 'PENDING',
        'limitations': {'Safari': 'UNKNOWN: installed Safari 27.0; WebDriver session rejected because Allow remote automation is disabled; settings unchanged', 'Firefox': 'UNKNOWN: not installed', 'VoiceOver': 'UNKNOWN: no manual screen reader session', 'realChatGPTHost': 'NOT RUN', 'userComprehension': 'NOT RUN'},
    }
    manifest = gallery / 'manifest.json'
    if manifest.is_file():
        manifest_data = json.loads(manifest.read_text())
        report['fixtureHash'] = manifest_data.get('fixtureHash')
        report['rendererResourceSHA256'] = manifest_data.get('rendererResourceSHA256')
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
                if isinstance(item, dict):
                    questions.extend(quiz_questions(item.get('blocks', []), grading))
        return questions
    quiz_oracle = {scene['id']: quiz_questions(scene.get('view', {}).get('blocks', []), scene['_meta']['chatui']['quizGrading']['quizzes']) for scene in fixtures['scenarios'] if scene.get('hasQuiz')}
    golden = json.loads((ROOT / 'renderer/examples/math-physics-golden.json').read_text())

    def save() -> None:
        report['screenshots'] = {str(p.relative_to(ROOT)): digest(p) for p in sorted(shots.glob('*.png'))}
        (directory / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    save()

    def cli(command: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run([str(args.cli), '-s=' + args.session, *command], cwd=ROOT, capture_output=True, text=True)

    if not args.reuse_session:
        opened = cli(['open', 'about:blank'])
        (directory / 'open.log').write_text(opened.stdout + opened.stderr)
        if opened.returncode or 'Error' in opened.stdout:
            report['status'] = 'BLOCKED'
            save()
            print(directory / 'results.json', flush=True)
            return 1

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs):
            super().__init__(*values, directory=str(gallery), **kwargs)

        def log_message(self, *_values):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        modes = ['file', 'http'] if args.mode == 'both' else [args.mode]
        for mode in modes:
            mode_before = {str(p.relative_to(gallery)): digest(p) for p in sorted(gallery.rglob('*')) if p.is_file()}
            url = entry.as_uri() if mode == 'file' else f'http://127.0.0.1:{server.server_port}/index.html'
            for name in args.checks:
                script = ROOT / 'renderer/scripts' / f'phase2b-{name}-checks.js'
                config = {'url': url, 'mode': mode, 'screenshots': str(shots.relative_to(ROOT)), 'manifest': json.loads(manifest.read_text()) if manifest.is_file() else {}, 'fallbacks': fallbacks, 'toolFallbacks': tool_fallbacks, 'quizOracle': quiz_oracle, 'golden': golden}
                code = f'async (page) => {{ const check = ({script.read_text()}); return check(page, {json.dumps(config, ensure_ascii=False)}); }}'
                process = cli(['run-code', code])
                (directory / f'{mode}-{name}.log').write_text(process.stdout + process.stderr)
                match = re.search(r'### Result\n(.*?)\n### ', process.stdout, re.S)
                result = {'mode': mode, 'name': name, 'command': ['playwright-cli', '-s=' + args.session, 'run-code', str(script.relative_to(ROOT))], 'exitCode': process.returncode, 'status': 'FAIL'}
                if process.returncode == 0 and match:
                    result['result'] = json.loads(match.group(1))
                    result['status'] = result['result'].get('status', 'FAIL')
                report['checks'].append(result)
                mode_after = {str(p.relative_to(gallery)): digest(p) for p in sorted(gallery.rglob('*')) if p.is_file()}
                result['resourceIdentity'] = {'before': mode_before, 'after': mode_after, 'byteEquality': mode_before == mode_after}
                if mode_before != mode_after:
                    result['status'] = 'FAIL'
                    result['resourceDrift'] = 'Gallery bytes changed during browser capture; repeat after resources are locked'
                report['status'] = 'PASS' if all(c['status'] == 'PASS' for c in report['checks']) else 'FAIL'
                save()
                print(f'{mode} {name}: {result["status"]}', flush=True)
                if result['status'] != 'PASS':
                    failure = result.get('result', {})
                    print(json.dumps({'failures': failure.get('failures', []), 'checks': [item for item in failure.get('checks', []) if item['status'] != 'PASS'], 'pageErrors': failure.get('pageErrors', []), 'cliError': process.stdout[:1200] if not match else None}, ensure_ascii=False), flush=True)
                    return 1
        report['screenshots'] = {str(p.relative_to(ROOT)): digest(p) for p in sorted(shots.glob('*.png'))}
        report['captureResourceBytes'] = {str(p.relative_to(ROOT)): digest(p) for p in sorted((ROOT / 'renderer/public').rglob('*')) if p.is_file()}
        report['scope'] = 'Real Chromium: same generated Gallery bytes under file and loopback HTTP; no private host or manual screen reader acceptance'
        save()
        print(directory / 'results.json', flush=True)
        return 0
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    raise SystemExit(run())
