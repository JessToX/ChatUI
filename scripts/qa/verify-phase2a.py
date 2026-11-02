"""Local Phase 2A core verification. Browser evidence is recorded separately."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time
from zipfile import ZipFile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['precommit', 'final'], required=True)
parser.add_argument('--iteration', choices=['phase2a', 'phase2a1'], default='phase2a')
args = parser.parse_args()
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
base = root / '.local' / args.iteration / 'acceptance' / (args.phase + '-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
base.mkdir(parents=True, exist_ok=False)
logs = base / 'logs'
logs.mkdir(parents=True, exist_ok=True)
packages = base / 'packages'
result_path = logs / 'results.json'
report = {
    'clientDate': '2026-10-11', 'sourceSha': sha, 'phase': args.phase, 'iteration': args.iteration,
    'environment': {
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
        'python': platform.python_version(), 'os': platform.platform(),
    }, 'checks': [], 'standalone': [], 'status': 'RUNNING',
    'scope': 'Local engineering only; browser and manual accessibility evidence recorded separately',
    'lockSha256': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in ['package-lock.json', 'renderer/package-lock.json']},
}

def record():
    result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

def run(name, cwd, command, extra=None, standalone=False):
    log = logs / (('standalone-' if standalone else '') + name + '.log')
    start = time.monotonic()
    with log.open('w') as output:
        result = subprocess.run(command, cwd=cwd, env={**os.environ, **(extra or {})},
                                stdout=output, stderr=subprocess.STDOUT)
    entry = {'name': name, 'cwd': str(cwd.relative_to(root)), 'command': command,
             'explicitEnvironment': extra or {}, 'exitCode': result.returncode,
             'status': 'PASS' if result.returncode == 0 else 'FAIL',
             'seconds': round(time.monotonic() - start, 3), 'log': str(log.relative_to(root))}
    report['standalone' if standalone else 'checks'].append(entry)
    if result.returncode:
        report['status'] = 'FAIL'
    record()
    print(('standalone ' if standalone else '') + name + ' ' + entry['status'], flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)

def require(condition, message):
    if not condition:
        report['status'] = 'FAIL'
        report['failure'] = message
        record()
        raise SystemExit(message)

if args.phase == 'final':
    require(not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip(),
            'Final verification requires clean tracked source')

record()
checks = [
    ('root-install', root, ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {}),
    ('renderer-install', root / 'renderer', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {}),
    ('component-generation', root, ['python3', 'scripts/build_component_templates.py', '--check'], {}),
    ('generation', root, ['node', 'renderer/scripts/check-generation.mjs'], {}),
    ('metadata', root, ['python3', 'scripts/sync-plugin-metadata.py', '--check'], {}),
    ('validate', root, ['python3', 'scripts/validate.py'], {}),
    ('components', root, ['npm', 'run', 'test:components'], {}),
    ('canonical-components', root, ['npm', 'run', 'test:components'],
     {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
    ('golden-compact', root, ['node', '--test', 'tests/test_math_physics_golden.mjs'], {}),
    ('golden-canonical', root, ['node', '--test', 'tests/test_math_physics_golden.mjs'],
     {'CHATUI_TEST_TEMPLATE_PATH': 'plugins/chatui/skills/chatui/assets/component-kit.html'}),
    ('golden-vendor', root, ['node', '--test', 'tests/test_math_physics_golden.mjs'],
     {'CHATUI_TEST_TEMPLATE_PATH': 'renderer/lib/vendor/component-kit.html'}),
    ('renderer-tests', root / 'renderer', ['npm', 'test'], {}),
    ('golden-renderer', root / 'renderer', ['node', '--test', 'tests/math-physics-golden.test.mjs'], {}),
    ('python', root, ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {}),
    ('typescript', root / 'renderer', ['./node_modules/.bin/tsc', '--noEmit', '--incremental', 'false'], {}),
    ('lint', root / 'renderer', ['npm', 'run', 'lint'], {}),
    ('build', root / 'renderer', ['npm', 'run', 'build'], {}),
    ('packages', root, ['python3', 'scripts/verify-source-packages.py', '--output-dir', str(packages)], {}),
    ('cold-warm', root / 'renderer', ['node', 'scripts/rc-cold-warm.mjs'], {}),
]
for name, cwd, command, extra in checks:
    run(name, cwd, command, extra)

cold_warm = json.loads((logs / 'cold-warm.log').read_text())
require(cold_warm['compilations'] == 330 and cold_warm['failures'] == 0, 'RC compilation gate failed')
package_report = json.loads((logs / 'packages.log').read_text())
report['packages'] = package_report
archive_info = next(item for item in package_report['archives'] if 'renderer' in item['archive'])
archive = packages / archive_info['archive']
standalone_base = base / ('standalone-' + args.phase + '-' + sha[:12])
require(not standalone_base.exists(), 'Preserve existing standalone extraction')
standalone_base.mkdir()
with ZipFile(archive) as zipped:
    for name in zipped.namelist():
        path = Path(name)
        require(not path.is_absolute() and '..' not in path.parts, 'Unsafe archive path')
    zipped.extractall(standalone_base)
standalone = standalone_base / 'renderer'
require(not (standalone / '.openai').exists(), 'Source archive unexpectedly contains deployment config')

# Execute the reviewed README quickstart as authored, without injecting bindings.
readme = (standalone / 'README.md').read_text()
quickstart = re.findall(r'```sh\n(.*?)\n```', readme, re.S)[0]
run('readme-quickstart', standalone, ['bash', '-euxo', 'pipefail', '-c', quickstart], standalone=True)
require((standalone / '.openai/hosting.json').read_bytes() == (standalone / 'hosting.example.json').read_bytes(),
        'Fresh quickstart did not use the public placeholder')
run('generation', standalone, ['node', 'scripts/check-generation.mjs'], standalone=True)
run('golden', standalone, ['node', '--test', 'tests/math-physics-golden.test.mjs'], standalone=True)

resources = []
for name in ['widget', 'explanation', 'response', 'document']:
    for relative in [f'lib/{name}.generated.mjs', f'public/chatui-{"component" if name == "widget" else name}.html']:
        content = (root / 'renderer' / relative).read_bytes()
        require(content == (standalone / relative).read_bytes(), 'Monorepo/standalone resource mismatch: ' + relative)
        original = subprocess.check_output(['git', 'show', '145232f2c4f6efefa701557fe560eddc7e6d1b35:renderer/' + relative], cwd=root)
        resources.append({'file': relative, 'bytes': len(content),
                          'sha256': hashlib.sha256(content).hexdigest(), 'changedFromB1': content != original})
require((root / 'plugins/chatui/skills/chatui/assets/component-kit.html').read_bytes()
        == (standalone / 'lib/vendor/component-kit.html').read_bytes(), 'Canonical/vendor mismatch')
monorepo_generation = json.loads((logs / 'generation.log').read_text())
standalone_generation = json.loads((logs / 'standalone-generation.log').read_text())
common = set(monorepo_generation['sha256']) & set(standalone_generation['sha256'])
require(all(monorepo_generation['sha256'][key] == standalone_generation['sha256'][key] for key in common),
        'Shared generation file hash mismatch')
equality = {'sourceSha': sha, 'monorepoStandaloneIdentical': True, 'canonicalVendorIdentical': True,
            'sharedGeneratedFiles': len(common), 'resources': resources,
            'b1Differences': 'Document reading tools and styles; shared compositor bytes change while legacy behavior is regression tested'}
(logs / 'resource-equality.json').write_text(json.dumps(equality, indent=2) + '\n')
report['resourceEquality'] = equality
require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == sha,
        'Commit changed during verification')
if args.phase == 'final':
    require(not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip(),
            'Candidate changed during final verification')
report['status'] = ('PHASE 2A.1 CORE PASS' if args.iteration == 'phase2a1' else 'PHASE 2A CORE PASS') if args.phase == 'final' else 'PRECOMMIT CHECKS PASS'
record()
print(report['status'] + ' ' + sha, flush=True)
print(result_path.relative_to(root), flush=True)
