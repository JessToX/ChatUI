#!/usr/bin/env python3
"""Verify local Phase 2B engineering and a fresh standalone source extraction.

Browser, screen-reader and real-host acceptance are separate evidence. This
runner never starts a server, migrates a database, deploys or publishes.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import stat
import statistics
import subprocess
import time
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
BASELINE_SHA = 'be6e0ae2d4446e9a8df709c7f19d18e6fb93bf8c'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*command):
    return subprocess.check_output(['git', *command], cwd=ROOT, text=True).strip()


def test_counts(text):
    counts = {}
    for field in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        found = re.findall(r'^(?:#|ℹ) ' + field + r' (\d+)$', text, re.M)
        if found:
            counts[field] = int(found[-1])
    python = re.search(r'^Ran (\d+) tests? in ', text, re.M)
    if python:
        counts = {'tests': int(python.group(1)), 'result': 'OK' if re.search(r'^OK$', text, re.M) else 'FAIL'}
    return counts


def hardware():
    result = {'architecture': platform.machine(), 'cpu': platform.processor() or 'UNKNOWN', 'memoryBytes': 'UNKNOWN'}
    if platform.system() == 'Darwin':
        try:
            result['cpu'] = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True).strip()
            result['memoryBytes'] = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True).strip())
        except (OSError, ValueError, subprocess.CalledProcessError):
            pass
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['precommit', 'final'], required=True)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--skip-install', action='store_true', help='Development only; final verification forbids this option')
    args = parser.parse_args()
    if args.phase == 'final' and args.skip_install:
        parser.error('Final verification requires locked installs')
    source_sha = git('rev-parse', 'HEAD')
    base = args.output_dir or (ROOT / '.local/phase2b/engineering' / (args.phase + '-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())))
    base = base.resolve()
    base.mkdir(parents=True, exist_ok=False)
    logs = base / 'logs'
    logs.mkdir()
    result_path = logs / 'results.json'
    report = {
        'clientDate': '2026-10-11', 'sourceSha': source_sha, 'phase': args.phase,
        'captureGitHead': source_sha, 'captureWorktreeDirty': bool(git('status', '--porcelain')),
        'baselineSha': BASELINE_SHA, 'branch': git('branch', '--show-current'),
        'environment': {
            'node': subprocess.check_output(['node', '--version'], text=True).strip(),
            'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
            'python': platform.python_version(), 'os': platform.platform(),
            'hardware': hardware(),
        },
        'checks': [], 'standalone': [], 'status': 'RUNNING',
        'scope': 'Local engineering only; Gallery browser, manual accessibility and real host evidence are separate',
        'lockSha256': {name: digest(ROOT / name) for name in ['package-lock.json', 'renderer/package-lock.json']},
        'lockedInstallsExecuted': not args.skip_install,
        'buildIsolation': 'npm run build executes only in fresh allowlisted standalone extraction with public placeholder; original hosting bindings and env files are excluded',
        'typecheckIsolation': 'fresh public-placeholder standalone only',
    }

    def record():
        result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    def require(condition, message):
        if not condition:
            report.update(status='FAIL', failure=message)
            record()
            raise SystemExit(message)

    def run(name, cwd, command, extra=None, standalone=False):
        log = logs / (('standalone-' if standalone else '') + name + '.log')
        started = time.monotonic()
        with log.open('w') as output:
            result = subprocess.run(command, cwd=cwd, env={**os.environ, **(extra or {})}, stdout=output, stderr=subprocess.STDOUT)
        entry = {
            'name': name, 'cwd': str(cwd.relative_to(ROOT)) if cwd.is_relative_to(ROOT) else str(cwd),
            'command': command, 'explicitEnvironment': extra or {},
            'exitCode': result.returncode, 'status': 'PASS' if result.returncode == 0 else 'FAIL',
            'seconds': round(time.monotonic() - started, 3),
            'log': str(log.relative_to(ROOT)) if log.is_relative_to(ROOT) else str(log),
            'logSha256': digest(log), 'testCounts': test_counts(log.read_text()),
        }
        report['standalone' if standalone else 'checks'].append(entry)
        if result.returncode:
            report['status'] = 'FAIL'
        record()
        print(('standalone ' if standalone else '') + name + ' ' + entry['status'], flush=True)
        if result.returncode:
            raise SystemExit(result.returncode)

    record()
    require(report['branch'] == 'codex/final-edition', 'Unexpected branch')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', BASELINE_SHA, 'HEAD'], cwd=ROOT).returncode == 0,
            'Phase 2A.1 baseline must remain an ancestor')
    if args.phase == 'final':
        require(not report['captureWorktreeDirty'], 'Final verification requires a clean source tree')

    checks = []
    if not args.skip_install:
        checks += [
            ('root-install', ROOT, ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {}),
            ('renderer-install', ROOT / 'renderer', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {}),
        ]
    checks += [
        ('component-generation', ROOT, ['python3', 'scripts/build_component_templates.py', '--check'], {}),
        ('generation', ROOT, ['node', 'renderer/scripts/check-generation.mjs'], {}),
        ('metadata', ROOT, ['python3', 'scripts/sync-plugin-metadata.py', '--check'], {}),
        ('validate', ROOT, ['python3', 'scripts/validate.py'], {}),
        ('components', ROOT, ['npm', 'run', 'test:components'], {}),
        ('canonical-components', ROOT, ['npm', 'run', 'test:components'],
         {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
        ('golden-compact', ROOT, ['node', '--test', 'tests/test_math_physics_golden.mjs'], {}),
        ('golden-canonical', ROOT, ['node', '--test', 'tests/test_math_physics_golden.mjs'],
         {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
        ('golden-vendor', ROOT, ['node', '--test', 'tests/test_math_physics_golden.mjs'],
         {'CHATUI_TEST_TEMPLATE_PATH': 'renderer/lib/vendor/component-kit.html'}),
        ('renderer-tests', ROOT / 'renderer', ['npm', 'test'], {}),
        ('golden-renderer', ROOT / 'renderer', ['node', '--test', 'tests/math-physics-golden.test.mjs'], {}),
        ('python', ROOT, ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {}),
        ('lint', ROOT / 'renderer', ['npm', 'run', 'lint'], {}),
        ('packages', ROOT, ['python3', 'scripts/verify-source-packages.py', '--output-dir', str(base / 'packages')], {}),
        ('cold-warm', ROOT / 'renderer', ['node', 'scripts/rc-cold-warm.mjs'], {}),
    ]
    for name, cwd, command, extra in checks:
        run(name, cwd, command, extra)
    cold_warm = json.loads((logs / 'cold-warm.log').read_text())
    require(cold_warm['compilations'] == 330 and cold_warm['failures'] == 0, 'RC compilation gate failed')
    report['rcCompilations'] = {'compilations': 330, 'failures': 0, 'scope': 'Compiler only; not host end-to-end timing'}
    timing_bytes = (ROOT / 'renderer/outputs/rc-cold-warm.json').read_bytes()
    (logs / 'rc-cold-warm.samples.json').write_bytes(timing_bytes)
    timing = json.loads(timing_bytes)

    def distribution(samples):
        ordered = sorted(samples)
        return {'samples': len(ordered), 'minMs': ordered[0], 'medianMs': statistics.median(ordered),
                'p95Ms': ordered[max(0, math.ceil(len(ordered) * .95) - 1)], 'maxMs': ordered[-1]}

    report['compilerTiming'] = {
        'method': timing['method'], 'clock': 'Node performance.now monotonic milliseconds',
        'scope': 'Local fixed RC compiler inputs only; neither Gallery mount nor real host end-to-end latency',
        'compilerColdFirstCalculus': distribution([process[0]['ms'] for process in timing['processes']]),
        'warmRepeatedAllFixtures': distribution([sample['ms'] for process in timing['processes'] for sample in process if sample['run'] > 0]),
        'rawSamples': str(logs / 'rc-cold-warm.samples.json'),
    }
    packages = json.loads((logs / 'packages.log').read_text())
    report['packages'] = packages
    archive_info = next(item for item in packages['archives'] if 'renderer' in item['archive'])
    archive = base / 'packages' / archive_info['archive']
    standalone_base = base / ('standalone-' + args.phase + '-' + source_sha[:12])
    standalone_base.mkdir()
    with ZipFile(archive) as zipped:
        names = zipped.namelist()
        require(len(names) == len(set(names)), 'Duplicate standalone ZIP path')
        for item in zipped.infolist():
            path = Path(item.filename)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in item.filename,
                    'Unsafe standalone ZIP path')
            require(stat.S_IFMT(item.external_attr >> 16) != stat.S_IFLNK, 'Standalone symlink entry')
        zipped.extractall(standalone_base)
    standalone = standalone_base / 'renderer'
    require(not (standalone / '.openai').exists(), 'Source archive unexpectedly contains deployment config')
    readme = (standalone / 'README.md').read_text()
    quickstart = re.findall(r'```sh\n(.*?)\n```', readme, re.S)[0]
    run('readme-quickstart', standalone, ['bash', '-euxo', 'pipefail', '-c', quickstart], standalone=True)
    require((standalone / '.openai/hosting.json').read_bytes() == (standalone / 'hosting.example.json').read_bytes(),
            'Fresh README quickstart did not create the public placeholder')
    run('generation', standalone, ['node', 'scripts/check-generation.mjs'], standalone=True)
    run('golden', standalone, ['node', '--test', 'tests/math-physics-golden.test.mjs'], standalone=True)
    resources = []
    for name in ['widget', 'explanation', 'response', 'document']:
        for relative in [f'lib/{name}.generated.mjs', f'public/chatui-{"component" if name == "widget" else name}.html']:
            content = (ROOT / 'renderer' / relative).read_bytes()
            require(content == (standalone / relative).read_bytes(), 'Monorepo/standalone resource mismatch: ' + relative)
            resources.append({'file': relative, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
    require((ROOT / 'plugins/chatui/skills/chatui/assets/component-kit.html').read_bytes() == (standalone / 'lib/vendor/component-kit.html').read_bytes(),
            'Canonical/vendor mismatch')
    source_generation = json.loads((logs / 'generation.log').read_text())
    standalone_generation = json.loads((logs / 'standalone-generation.log').read_text())
    common = set(source_generation['sha256']) & set(standalone_generation['sha256'])
    require(all(source_generation['sha256'][key] == standalone_generation['sha256'][key] for key in common),
            'Shared generated file hash mismatch')
    report['resourceEquality'] = {'monorepoStandaloneIdentical': True, 'canonicalVendorIdentical': True,
                                 'sharedGeneratedFiles': len(common), 'resources': resources}
    gallery_files = ['index.html', 'fixtures.json', 'renderer.html', 'README.md', 'THIRD_PARTY_NOTICES.md', 'manifest.json', 'SHA256SUMS']
    gallery = standalone / 'public/gallery'
    require(gallery.is_dir() and sorted(item.name for item in gallery.iterdir()) == sorted(gallery_files),
            'Standalone Gallery inventory differs from seven declared files')
    gallery_hashes = {}
    for name in gallery_files:
        path = gallery / name
        require(path.is_file() and not path.is_symlink(), 'Unsafe standalone Gallery file: ' + name)
        require(path.read_bytes() == (ROOT / 'renderer/public/gallery' / name).read_bytes(),
                'Monorepo/standalone Gallery mismatch: ' + name)
        gallery_hashes[name] = digest(path)
    manifest = json.loads((gallery / 'manifest.json').read_text())
    require(manifest['fixtureHash'] == gallery_hashes['fixtures.json'] and manifest['rendererResourceSHA256'] == gallery_hashes['renderer.html'],
            'Standalone Gallery manifest resource hashes differ')
    report['standaloneGallery'] = {
        'directory': str(gallery), 'monorepoStandaloneIdentical': True,
        'fixtureHash': manifest['fixtureHash'], 'rendererResourceSHA256': manifest['rendererResourceSHA256'],
        'files': gallery_hashes,
        'browserStatus': 'NOT RUN BY ENGINEERING RUNNER; test this exact fresh directory separately in file and HTTP modes',
    }
    require(git('rev-parse', 'HEAD') == source_sha, 'Commit changed during verification')
    require(report['lockSha256'] == {name: digest(ROOT / name) for name in report['lockSha256']}, 'Lock bytes changed during verification')
    if args.phase == 'final':
        require(not git('status', '--porcelain'), 'Candidate source changed during final verification')
        committed_resources = {}
        for relative in [entry['file'] for entry in resources] + ['public/gallery/' + name for name in gallery_files]:
            committed = subprocess.check_output(['git', 'show', source_sha + ':renderer/' + relative], cwd=ROOT)
            require(committed == (ROOT / 'renderer' / relative).read_bytes(),
                    'Final committed resource differs: ' + relative)
            committed_resources[relative] = hashlib.sha256(committed).hexdigest()
        report['finalCommitSHA'] = source_sha
        report['finalResourceVerification'] = {
            'verified': True, 'scope': 'Generated core and Gallery bytes checked against final git blobs, locks, clean source and fresh standalone',
            'sha256': committed_resources,
        }
    report['status'] = 'PHASE 2B ENGINEERING PASS' if args.phase == 'final' else 'PRECOMMIT ENGINEERING PASS'
    record()
    print(report['status'] + ' ' + source_sha, flush=True)
    print(result_path, flush=True)


if __name__ == '__main__':
    main()
