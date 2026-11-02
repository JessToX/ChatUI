"""Operate synthetic Gallery scenarios in local Chrome; never deploy or connect."""
import argparse
import hashlib
import http.server
import json
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import uuid

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    gallery = ROOT / 'renderer/public/gallery'
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in gallery.iterdir() if p.is_file()}
    for line in (gallery / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1)
        if hashes.get(name) != digest:
            raise ValueError('Gallery checksum mismatch')
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs):
            super().__init__(*values, directory=str(gallery), **kwargs)
        def log_message(self, *_values):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    session = 'iteration1-' + uuid.uuid4().hex[:8]
    cli_path = Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh'
    with tempfile.TemporaryDirectory(prefix='chatui-iteration1-cli-') as folder:
        work = Path(folder)
        def cli(*arguments):
            completed = subprocess.run([str(cli_path), '--session=' + session, *arguments], cwd=work, text=True, capture_output=True, timeout=180)
            if completed.returncode:
                raise RuntimeError((completed.stdout + completed.stderr)[-2000:])
            return completed.stdout
        try:
            cli('open', 'about:blank', '--browser', 'chrome', '--headed')
            source = (ROOT / 'renderer/scripts/iteration-one-browser-checks.js').read_text().strip().rstrip(';')
            config = {'url': f'http://127.0.0.1:{server.server_port}/index.html', 'screenshots': str(output)}
            (work / 'check.js').write_text('async (page) => { const check = (' + source + '); return check(page, ' + json.dumps(config) + '); }')
            result = cli('run-code', '--filename', str(work / 'check.js'))
            match = re.search(r'### Result\n(.*?)\n### ', result, re.S)
            if not match:
                raise RuntimeError('No browser result: ' + result[-2000:])
            report = json.loads(match.group(1))
        finally:
            try:
                cli('close')
            finally:
                server.shutdown()
                server.server_close()
    report.update(scope='Local headed Chrome, synthetic fixtures; real host NOT_RUN', baseline=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), rendererVersion=json.loads((ROOT / 'renderer/package.json').read_text())['version'], gallerySHA256=hashes, browserScriptSHA256=hashlib.sha256(source.encode()).hexdigest())
    report['resourceBytesUnchanged'] = hashes == {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in gallery.iterdir() if p.is_file()}
    if not report['resourceBytesUnchanged']:
        report['status'] = 'FAIL'
    (output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'checks': len(report['checks']), 'results': str(output / 'results.json')}, ensure_ascii=False))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
