#!/usr/bin/env python3
"""Verify exact local RC archives in a fresh public-placeholder source tree.

Never reads original deployment configuration or runs deployment commands.
Final results bind the clean commit, locked dependencies and archive bytes.
"""
import argparse
import hashlib
import importlib.util
import importlib.metadata
import json
import math
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import statistics
import subprocess
import time
import zipfile
import sys
from datetime import datetime, timezone, timedelta


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import offline_final_identity

BASELINE = '49cb452f47008a9f89002cace50c34d862a07d4f'
FROZEN = {
    'renderer/examples/math-physics-golden.json': '2e156308edb021ea8e1499e9b6147be0aa0054ea11e7b9ff179225c9eb114961',
    'renderer/examples/gallery.mjs': '2c1411801234097f684b2f8f481c3b95295190a00c1b882346adafb16fd741b5',
    'renderer/examples/intellectual.mjs': 'd40faf8e874a82d227510fff0652b89b4cf1ed4c8206cae0a84fa5ee787fa518',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def counts(text):
    result = {}
    for field in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        found = re.findall(r'^(?:#|ℹ) ' + field + r' (\d+)$', text, re.M)
        if found:
            result[field] = int(found[-1])
    python = re.search(r'^Ran (\d+) tests? in ', text, re.M)
    if python:
        result = {'tests': int(python.group(1)), 'result': 'OK' if re.search(r'^OK$', text, re.M) else 'FAIL'}
    return result


def extract(archive, destination):
    destination.mkdir(exist_ok=False)
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if len(names) != len(set(names)) or source.testzip() is not None:
            raise ValueError('Duplicate or corrupt ZIP')
        for info in source.infolist():
            path = PurePosixPath(info.filename)
            if (path.is_absolute() or '..' in path.parts or '\\' in info.filename
                    or ':' in info.filename or str(path) != info.filename
                    or stat.S_IFMT(info.external_attr >> 16) != stat.S_IFREG
                    or info.date_time != (1980, 1, 1, 0, 0, 0)):
                raise ValueError('Noncanonical or unsafe ZIP entry')
            output = destination.joinpath(*path.parts)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(source.read(info.filename))
        return {name: hashlib.sha256(source.read(name)).hexdigest() for name in names}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['precommit', 'final'], required=True)
    parser.add_argument('--source-zip', type=Path, required=True)
    parser.add_argument('--gallery-zip', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--offline-final', action='store_true')
    args = parser.parse_args()
    state = offline_final_identity.capture(ROOT) if args.offline_final else {}
    source_sha = git('rev-parse', 'HEAD')
    base = (args.output_dir or ROOT / '.local/phase3/engineering' / (args.phase + '-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))).resolve()
    base.mkdir(parents=True, exist_ok=False)
    logs = base / 'logs'
    logs.mkdir()
    result_path = logs / 'results.json'
    report = {
        **state, 'clientDate': datetime.now(timezone(timedelta(hours=8))).date().isoformat(),
        'sourceSha': source_sha, 'baselineSha': offline_final_identity.BASELINE if args.offline_final else BASELINE,
        'phase': args.phase, 'branch': git('branch', '--show-current'),
        'captureGitHead': source_sha, 'captureWorktreeDirty': state['captureWorktreeDirty'] if args.offline_final else bool(git('status', '--porcelain')),
        'environment': {'node': subprocess.check_output(['node', '--version'], text=True).strip(),
                        'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
                        'python': platform.python_version(), 'os': platform.platform(),
                        'architecture': platform.machine()},
        'lockSha256': {name: digest(ROOT / name) for name in ('package-lock.json', 'renderer/package-lock.json')},
        'checks': [], 'status': 'RUNNING',
        'scope': 'Fresh RC Source ZIP: offline correctness, security, compatibility, reproducible build; actual browsers are separate evidence',
        'buildIsolation': 'Fresh source only; no inherited .openai/.env, synthetic public placeholder only',
        'artifacts': {},
    }
    report['environment']['pythonDependencies'] = {}
    requirements = ROOT / 'requirements-phase3.txt'
    if requirements.is_file():
        for line in requirements.read_text().splitlines():
            if not line.strip() or line.startswith('#'):
                continue
            name, expected = line.split('==')
            actual = importlib.metadata.version(name)
            report['environment']['pythonDependencies'][name] = {'expected': expected, 'actual': actual}
            if actual != expected:
                raise SystemExit('Python pinned dependency mismatch: ' + name)
    if platform.system() == 'Darwin':
        report['environment']['cpu'] = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True).strip()
        report['environment']['memoryBytes'] = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True).strip())

    def save():
        result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    def require(condition, reason):
        if not condition:
            report.update(status='FAIL', failure=reason)
            save()
            raise SystemExit(reason)

    isolated_env = {name: os.environ[name] for name in ('PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM') if name in os.environ}
    for config in ('empty-user.npmrc', 'empty-global.npmrc'):
        (base / config).touch(exist_ok=False)
    isolated_env.update(TZ='Asia/Shanghai', PYTHONDONTWRITEBYTECODE='1', CLOUDFLARE_CF_FETCH_ENABLED='false',
                        WRANGLER_SEND_METRICS='false', WRANGLER_WRITE_LOGS='false',
                        npm_config_userconfig=str(base / 'empty-user.npmrc'),
                        npm_config_globalconfig=str(base / 'empty-global.npmrc'),
                        npm_config_audit='false', npm_config_fund='false', MPLCONFIGDIR=str(base / 'matplotlib'))
    report['explicitBuildEnvironment'] = sorted(isolated_env)

    def run(name, cwd, command, extra=None):
        log = logs / (name + '.log')
        started = time.monotonic()
        with log.open('w') as output:
            result = subprocess.run(command, cwd=cwd, env={**(isolated_env if args.offline_final else os.environ), **(extra or {})}, stdout=output, stderr=subprocess.STDOUT)
        entry = {'name': name, 'cwd': str(cwd.relative_to(base)) if cwd.is_relative_to(base) else '.',
                 'command': command, 'explicitEnvironment': extra or {}, 'exitCode': result.returncode,
                 'status': 'PASS' if result.returncode == 0 else 'FAIL',
                 'seconds': round(time.monotonic() - started, 3), 'log': str(log.relative_to(ROOT)),
                 'logSha256': digest(log), 'testCounts': counts(log.read_text())}
        report['checks'].append(entry)
        save()
        print(name + ' ' + entry['status'], flush=True)
        require(result.returncode == 0, name + ' failed; original log preserved')

    save()
    require(report['branch'] == (state['branch'] if args.offline_final else 'codex/final-edition'), 'Unexpected branch')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', report['baselineSha'], 'HEAD'], cwd=ROOT).returncode == 0, 'Expected baseline is not an ancestor')
    if args.phase == 'final':
        require(not report['captureWorktreeDirty'], 'Final verification requires clean source')
    require(all(digest(ROOT / name) == expected for name, expected in FROZEN.items()), 'Independent oracle or fixed Gallery inputs changed')
    report['frozenInputs'] = FROZEN
    for kind, archive in [('source', args.source_zip.resolve()), ('gallery', args.gallery_zip.resolve())]:
        require(archive.is_file(), 'Missing RC archive')
        spec = importlib.util.spec_from_file_location('phase3_package', ROOT / 'scripts/qa/package-phase3.py')
        packaging = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(packaging)
        packaging.read_archive(archive)
        inventory = extract(archive, base / kind)
        report['artifacts'][kind] = {'archive': archive.name, 'bytes': archive.stat().st_size,
                                      'sha256': digest(archive), 'files': inventory}
    fresh = base / 'source'
    renderer = fresh / 'renderer'
    identity = json.loads((fresh / 'RC-SOURCE-MANIFEST.json').read_text())
    expected_entries, _origins = packaging.source_entries()
    require(set(report['artifacts']['source']['files']) == set(expected_entries) | {'RC-SOURCE-MANIFEST.json', 'SHA256SUMS'},
            'Source inventory differs from the exact candidate allowlist')
    require(set(report['artifacts']['gallery']['files']) == set(packaging.GALLERY_FILES),
            'Gallery inventory differs from the seven-file allowlist')
    for name, content in expected_entries.items():
        require((fresh / name).read_bytes() == content, 'Packaged allowlisted source differs: ' + name)
    identity_inventory = {item['path']: (item['bytes'], item['sha256']) for item in identity['files']}
    require(identity_inventory == {name: (len(content), hashlib.sha256(content).hexdigest()) for name, content in expected_entries.items()},
            'Source manifest does not describe the exact selected bytes')
    require(identity['sourceSha'] == source_sha and identity['phase'] == args.phase,
            'RC Source identity does not match this verification phase/HEAD')
    if args.phase == 'final':
        require(identity['captureWorktreeDirty'] is False, 'Final Source contains dirty capture identity')
    require((fresh / 'plugins/chatui/.app.json').read_bytes() == packaging.PUBLIC_APP,
            'Synthetic packaged App placeholder differs')
    require(not (renderer / '.openai').exists(), 'Private binding packaged')
    require(all(digest(fresh / name) == expected for name, expected in FROZEN.items()), 'Packaged fixed oracle inputs differ')
    require(all(digest(fresh / name) == value for name, value in report['lockSha256'].items()), 'Packaged locks differ')
    # Every source-controlled archive entry equals this candidate, except the
    # explicitly synthetic connector binding. Generated package metadata is
    # governed by the package verifier and is recorded in the exact inventory.
    tracked = set(git('ls-files').splitlines())
    verified_source = {}
    for name, value in report['artifacts']['source']['files'].items():
        if args.phase == 'final':
            require(name in tracked or name in ['RC-SOURCE-MANIFEST.json', 'SHA256SUMS'],
                    'Untracked final Source entry: ' + name)
        if name in tracked and name != 'plugins/chatui/.app.json':
            content = subprocess.check_output(['git', 'show', source_sha + ':' + name], cwd=ROOT) if args.phase == 'final' else (ROOT / name).read_bytes()
            require(hashlib.sha256(content).hexdigest() == value, 'Source archive differs from candidate: ' + name)
            verified_source[name] = value
    report['sourceByteVerification'] = {'verified': True, 'files': len(verified_source), 'declaredException': 'Synthetic public .app.json; original account binding never packaged'}
    commands = [
        ('root-install', fresh, ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {}),
        ('component-generation', fresh, ['python3', 'scripts/build_component_templates.py', '--check'], {}),
        ('third-party-notices', fresh, ['python3', 'scripts/qa/audit-phase3-licenses.py', '--check'], {}),
        ('metadata', fresh, ['python3', 'scripts/sync-plugin-metadata.py', '--check', '--candidate'], {}),
        ('validate', fresh, ['python3', 'scripts/validate.py'], {}),
        ('components', fresh, ['npm', 'run', 'test:components'], {}),
        ('canonical-components', fresh, ['npm', 'run', 'test:components'], {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
        ('golden-compact', fresh, ['node', '--test', 'tests/test_math_physics_golden.mjs'], {}),
        ('golden-canonical', fresh, ['node', '--test', 'tests/test_math_physics_golden.mjs'], {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
        ('golden-vendor', fresh, ['node', '--test', 'tests/test_math_physics_golden.mjs'], {'CHATUI_TEST_TEMPLATE_PATH': 'renderer/lib/vendor/component-kit.html'}),
        ('python', fresh, ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {}),
    ]
    for name, cwd, command, extra in commands:
        run(name, cwd, command, extra)
    quickstart = re.findall(r'```sh\n(.*?)\n```', (renderer / 'README.md').read_text(), re.S)[0]
    if args.offline_final:
        run('monorepo-readme-quickstart', renderer, ['bash', '-euxo', 'pipefail', '-c', quickstart])
        run('vendor-components', fresh, ['npm', 'run', 'test:components'], {'CHATUI_TEST_TEMPLATE_PATH': 'renderer/lib/vendor/component-kit.html'})
        run('standalone-package', fresh, ['python3', 'scripts/package-renderer.py', '--output-dir', str(base / 'standalone-packages')])
        standalone = packaging.verify_extract(base / 'standalone-packages/chatui-renderer-1.6.0-source.zip', destination=base / 'standalone')
        standalone_renderer = standalone / 'renderer'
        require(not (standalone / 'plugins').exists() and not (standalone_renderer / 'node_modules').exists() and not (standalone_renderer / '.openai').exists(), 'Standalone is not fresh and independent')
        run('standalone-readme-quickstart', standalone_renderer, ['bash', '-euxo', 'pipefail', '-c', quickstart])
        run('standalone-generation', standalone_renderer, ['node', 'scripts/check-generation.mjs'])
        run('quiz-replay-limitation', standalone_renderer, ['node', '--test', '--test-name-pattern=LIMITATION a complete old toolOutput', 'tests/quiz-bridge.test.mjs'])
        replay_text = (logs / 'quiz-replay-limitation.log').read_text()
        observed = re.search(r'(\{"status":"LIMITATION_OBSERVED_FULL_OLD_ENVELOPE"[^\n]+\})', replay_text)
        require(observed is not None, 'Formal complete old envelope limitation reproduction missing')
        report['replayLimitation'] = {'status': 'LIMITATION OBSERVED; NOT ANTI-REPLAY PASS', 'observation': json.loads(observed.group(1)), 'testFileSHA256': digest(standalone_renderer / 'tests/quiz-bridge.test.mjs'), 'logSha256': digest(logs / 'quiz-replay-limitation.log'), 'realHost': 'NOT RUN / NOT VERIFIED'}
        report['standalone'] = {'sourceArchiveSHA256': digest(base / 'standalone-packages/chatui-renderer-1.6.0-source.zip'), 'parentCanonicalAbsent': True, 'freshReadmeBuild': 'PASS'}
    else:
        run('standalone-readme-quickstart', renderer, ['bash', '-euxo', 'pipefail', '-c', quickstart])
    require((renderer / '.openai/hosting.json').read_bytes() == (renderer / 'hosting.example.json').read_bytes(), 'README did not create exact public placeholder')
    run('generation-source', renderer if args.offline_final else ROOT / 'renderer', ['node', 'scripts/check-generation.mjs'])
    for name, command in [('generation', ['node', 'scripts/check-generation.mjs']),
                           ('golden-renderer', ['node', '--test', 'tests/math-physics-golden.test.mjs']),
                           ('cold-warm', ['node', 'scripts/rc-cold-warm.mjs'])]:
        run(name, renderer, command)
    compile_result = json.loads((logs / 'cold-warm.log').read_text())
    require(compile_result['compilations'] == 330 and compile_result['failures'] == 0, '330 RC compiler gate failed')
    samples = json.loads((renderer / 'outputs/rc-cold-warm.json').read_text())
    (logs / 'rc-cold-warm.samples.json').write_text(json.dumps(samples, indent=2) + '\n')

    def distribution(values):
        values = sorted(values)
        return {'samples': len(values), 'minMs': values[0], 'medianMs': statistics.median(values),
                'p95Ms': values[max(0, math.ceil(len(values) * .95) - 1)], 'maxMs': values[-1]}

    report['compilerTiming'] = {'method': samples['method'], 'clock': 'Node performance.now monotonic milliseconds',
                               'scope': 'Compiler samples only; neither FCP nor host end-to-end latency',
                               'coldFirstCalculus': distribution([process[0]['ms'] for process in samples['processes']]),
                               'warmRepeated': distribution([sample['ms'] for process in samples['processes'] for sample in process if sample['run'] > 0])}
    resources = {}
    for name in ['widget', 'explanation', 'response', 'document', 'version']:
        relatives = ['renderer/lib/' + name + '.generated.mjs']
        if name != 'version':
            relatives += ['renderer/public/chatui-' + ('component' if name == 'widget' else name) + '.html']
        for relative in relatives:
            require((fresh / relative).read_bytes() == (ROOT / relative).read_bytes(), 'Fresh generated core resource mismatch: ' + relative)
            resources[relative] = {'bytes': (fresh / relative).stat().st_size, 'sha256': digest(fresh / relative)}
    require((fresh / 'plugins/chatui/skills/chatui/assets/component-kit.html').read_bytes() == (renderer / 'lib/vendor/component-kit.html').read_bytes(), 'Canonical/vendor mismatch')
    for name, value in report['artifacts']['gallery']['files'].items():
        require(digest(renderer / 'public/gallery' / name) == value, 'Gallery ZIP and fresh generation differ: ' + name)
        require(digest(ROOT / 'renderer/public/gallery' / name) == value, 'Gallery ZIP and candidate differ: ' + name)
    if args.offline_final:
        rebuilt, origins = packaging.source_entries(fresh)
        require(rebuilt == expected_entries, 'Independent generated source differs from final source')
        generated_identity = {key: value for key, value in identity.items() if key not in ('format', 'selection', 'publicPlaceholder', 'files')}
        source_rebuilt = packaging.with_source_identity(rebuilt, origins, generated_identity)
        rebuilt_gallery = packaging.gallery_entries(fresh)
        require(packaging.zipped(source_rebuilt) == args.source_zip.read_bytes(), 'Independent generated Source ZIP differs')
        require(packaging.zipped(rebuilt_gallery) == args.gallery_zip.read_bytes(), 'Independent generated Gallery ZIP differs')
        report['independentRebuild'] = {'freshLockedInstallAndBuild': True, 'generatedSourceBytesIdentical': True, 'sourceZipSHA256': packaging.sha(packaging.zipped(source_rebuilt)), 'galleryZipSHA256': packaging.sha(packaging.zipped(rebuilt_gallery)), 'sourceZipIdentical': True, 'galleryZipIdentical': True}
        report['thirdPartyNoticeHashes'] = {name: digest(fresh / name) for name in ('THIRD_PARTY_NOTICES.md', 'renderer/gallery/THIRD_PARTY_NOTICES.md', 'renderer/vendor/shadcn-tailwind-4.13.0.LICENSE.md', 'renderer/build/sites-vite-plugin.LICENSE')}
    require(git('rev-parse', 'HEAD') == source_sha, 'Commit changed during acceptance')
    if args.offline_final:
        offline_final_identity.require_same_source(state, offline_final_identity.capture(ROOT))
    require(report['lockSha256'] == {name: digest(ROOT / name) for name in report['lockSha256']}, 'Locks changed during acceptance')
    if args.phase == 'final':
        require(not (git('status', '--porcelain', '--untracked-files=no') if args.offline_final else git('status', '--porcelain')), 'Source changed during final acceptance')
        report['finalCommitSHA'] = source_sha
    report.update(status=('OFFLINE FINAL ENGINEERING PASS' if args.offline_final else 'PHASE 3 ENGINEERING PASS') if args.phase == 'final' else 'PRECOMMIT ENGINEERING PASS',
                  rcCompilations={'compilations': 330, 'failures': 0}, resources=resources,
                  canonicalVendorIdentical=True, freshGalleryZipIdentical=True)
    save()
    print(report['status'] + ' ' + source_sha, flush=True)
    print(result_path, flush=True)


if __name__ == '__main__':
    main()
