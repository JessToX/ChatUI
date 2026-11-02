#!/usr/bin/env python3
"""Package clean final RC audit evidence only, after complete local acceptance."""
from __future__ import annotations
import argparse
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/qa' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


delivery = load_module('phase3_delivery_for_review', 'package-phase3.py')
legacy = load_module('phase2b_png_for_review', 'package-phase2b.py')


def sanitize(value):
    if isinstance(value, dict):
        return {key: sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        value = value.replace(str(ROOT), '[local-checkout]').replace(str(Path.home()), '[local-home]')
        return re.sub(r'/(?:Users|home)/[^\s`"<>]+', '[local-path]', value)
    return value


def portable(content):
    text = content.decode()
    # Review copies carry prose, not links into absent full-source files.
    text = re.sub(r'\[([^\]]+)\]\((?!https?://|#)[^)]+\)', r'\1', text)
    return sanitize(text).encode()


def validate_summary_identity(content, head, branch, baseline, status):
    """A readable summary must carry the same identity as machine evidence."""
    text = content.decode()
    match = re.search(r'Final local commit: `([^`]+)` on `([^`]+)`, baseline `([^`]+)`\.', text)
    if not match or match.groups() != (head, branch, baseline):
        raise ValueError('Review README identity differs from final evidence')
    if f'Status: **{status}**.' not in text:
        raise ValueError('Review README status differs from final evidence')


def require_browser(report, head, packages):
    legacy.require_browser(report, full=True)
    required = {(mode, name) for mode in ('file', 'http')
                for name in ('slice', 'layout', 'interaction', 'security', 'accessibility', 'performance')}
    checks = report.get('checks', [])
    if len(checks) != len(required) or {(row.get('mode'), row.get('name')) for row in checks} != required:
        raise ValueError('Final browser evidence must contain exactly both complete six-check suites')
    if any(row.get('status') != 'PASS' or row.get('result', {}).get('status') != 'PASS'
           or row.get('resourceIdentity', {}).get('byteEquality') is not True for row in checks):
        raise ValueError('Browser hard scope failed or resource identity drifted')
    for mode in ('file', 'http'):
        selected = {row['name']: row['result'] for row in checks if row['mode'] == mode}
        special = selected['interaction'].get('checks', []) + selected['security'].get('checks', [])
        accessibility = selected['accessibility'].get('checks', [])
        samples = selected['performance'].get('samples', [])
        if (len(special) != 16 or len(accessibility) != 27 or len(samples) != 8
                or any(row.get('status') != 'PASS' for row in special + accessibility)
                or any(selected[name].get('pageErrors') or selected[name].get('forbiddenRequests')
                       for name in selected)):
            raise ValueError('Reported browser coverage lacks complete actual passing records')
    coverage = report.get('coverage', {})
    if (coverage.get('layoutCount') != 128 or coverage.get('specializedCount') != 32
            or coverage.get('accessibilityCount') != 54 or coverage.get('mountSamples') != 16
            or coverage.get('requiredModesAndChecksComplete') is not True):
        raise ValueError('Browser layout/interaction/a11y/performance coverage is incomplete')
    if (report.get('finalCommitSHA') != head or report.get('captureGitHead') != head
            or report.get('captureWorktreeDirty') or not str(report.get('finalResourceVerification', '')).startswith('PASS')):
        raise ValueError('Final browser evidence does not bind the clean final commit')
    source = report.get('source', {})
    if source.get('kind') != 'fresh Gallery ZIP extraction' or source.get('archiveSHA256') != packages['gallery']['sha256']:
        raise ValueError('Browser did not test the exact final Gallery ZIP')
    expected = {row['path']: row['sha256'] for row in packages['gallery']['inventory']}
    if report.get('galleryResourceSHA256') != expected:
        raise ValueError('Browser resources differ from the final Gallery archive')


def require_engineering(report, head, packages):
    required = {'root-install', 'component-generation', 'third-party-notices', 'metadata', 'validate',
                'components', 'canonical-components', 'golden-compact', 'golden-canonical', 'golden-vendor',
                'python', 'standalone-readme-quickstart', 'generation-source', 'generation', 'golden-renderer', 'cold-warm'}
    checks = report.get('checks', [])
    if (report.get('status') not in ('PHASE 3 ENGINEERING PASS', 'OFFLINE FINAL ENGINEERING PASS') or report.get('phase') != 'final'
            or report.get('sourceSha') != head or report.get('finalCommitSHA') != head or report.get('captureWorktreeDirty')
            or not required.issubset({row.get('name') for row in checks})
            or any(row.get('status') != 'PASS' or row.get('exitCode') != 0 for row in checks)
            or report.get('rcCompilations') != {'compilations': 330, 'failures': 0}
            or report.get('canonicalVendorIdentical') is not True or report.get('freshGalleryZipIdentical') is not True):
        raise ValueError('Final full engineering acceptance is incomplete or failed')
    if report.get('status') == 'OFFLINE FINAL ENGINEERING PASS':
        extra = {'monorepo-readme-quickstart', 'vendor-components', 'standalone-package', 'standalone-generation', 'quiz-replay-limitation'}
        if not extra.issubset({row.get('name') for row in checks}):
            raise ValueError('Offline Final standalone and replay scope incomplete')
    for kind in ('source', 'gallery'):
        if report.get('artifacts', {}).get(kind, {}).get('sha256') != packages[kind]['sha256']:
            raise ValueError('Engineering verified different final RC archive bytes')


def selected_json(path):
    path = Path(path)
    resolved = path.resolve()
    if path.is_symlink() or not any(resolved.is_relative_to((ROOT / base).resolve()) for base in ('.local/phase3', '.local/offline-final')) or not path.is_file():
        raise ValueError('Evidence must be an explicitly selected regular local Phase 3 result')
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packages', type=Path, required=True)
    parser.add_argument('--engineering', type=Path, required=True)
    parser.add_argument('--browser', type=Path, required=True)
    parser.add_argument('--failure-summary', type=Path, help='Explicit public failure/repair summary; never raw private logs')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--offline-final', action='store_true')
    parser.add_argument('--second-engineering', type=Path)
    parser.add_argument('--history-risk', type=Path)
    args = parser.parse_args()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain', *(['--untracked-files=no'] if args.offline_final else [])], cwd=ROOT, text=True).strip():
        raise ValueError('Review packaging requires clean final commit')
    packages, engineering, browser = [selected_json(path) for path in (args.packages, args.engineering, args.browser)]
    if (packages.get('status') != 'PASS' or packages.get('phase') != 'final' or packages.get('sourceSha') != head
            or packages.get('captureWorktreeDirty') or packages.get('repeatedZipBytesIdentical') is not True):
        raise ValueError('Final RC package report identity is invalid')
    for kind in ('source', 'gallery'):
        record = packages[kind]
        archive = Path(record['path'])
        if archive.is_symlink() or not archive.is_file() or delivery.sha(archive.read_bytes()) != record['sha256']:
            raise ValueError('Final archive changed after packaging')
        content = delivery.read_archive(archive)
        if delivery.inventory(content) != record['inventory']:
            raise ValueError('Final archive inventory differs from package evidence')
    require_engineering(engineering, head, packages)
    require_browser(browser, head, packages)
    second = None
    if args.offline_final:
        state = delivery.offline_final_identity.require_clean(ROOT)
        for record in (packages, engineering):
            delivery.offline_final_identity.require_same_source(state, record)
        if not args.second_engineering or not args.history_risk:
            raise ValueError('Offline Final requires two independent builds and a history risk record')
        second = selected_json(args.second_engineering)
        delivery.offline_final_identity.require_same_source(state, second)
        require_engineering(second, head, packages)
        for record in (engineering, second):
            rebuilt = record.get('independentRebuild', {})
            if (not rebuilt.get('sourceZipIdentical') or not rebuilt.get('galleryZipIdentical')
                    or not record.get('replayLimitation', {}).get('observation', {}).get('completeOldPairAccepted')):
                raise ValueError('Independent rebuilt archives or formal replay observation missing')
        if Path(engineering['checks'][0]['log']).parent == Path(second['checks'][0]['log']).parent:
            raise ValueError('Independent builds reused the same directory')
    entries, origins = {}, {}
    for relative in ('docs/final-edition/phase3.md', 'docs/final-edition/release-candidate.md', 'docs/final-edition/security-and-limitations.md',
                     'docs/final-edition/host-validation-plan.md', 'docs/final-edition/release-and-archive-checklist.md'):
        path = ROOT / relative
        if path.is_symlink() or path.resolve() != ROOT / relative:
            raise ValueError('Unsafe selected review document')
        entries[relative] = portable(path.read_bytes())
        origins[relative] = {'source': relative, 'originalSha256': delivery.sha(path.read_bytes()), 'portableReviewCopy': True}
    acceptance = {'status': 'OFFLINE FINAL CANDIDATE READY WITH DECLARED LIMITATIONS' if args.offline_final else 'RC READY — OFFLINE VERIFIED WITH DECLARED LIMITATIONS', 'finalCommitSHA': head,
                  'engineering': sanitize(engineering), 'browser': sanitize(browser), 'packages': sanitize(packages)}
    if args.offline_final:
        acceptance['secondIndependentEngineering'] = sanitize(second)
        acceptance['hostStatus'] = 'NOT RUN / NOT VERIFIED'
        acceptance['releaseStatus'] = 'NOT PUBLISHED'
        entries['history-risk.json'] = delivery.canonical_json(sanitize(selected_json(args.history_risk)))
        origins['history-risk.json'] = {'source': 'scoped read-only repository history risk; no restricted content'}
        entries['replay-limitation.json'] = delivery.canonical_json(engineering['replayLimitation'])
        origins['replay-limitation.json'] = {'source': 'actual final standalone replay observation and log hash'}
        entries['RELEASE-NOTES.md'] = (f'# ChatUI Offline Final Edition\n\nDRAFT — NOT PUBLISHED. Plugin 1.0.0 / Renderer 1.6.0. Final source SHA: {head}.\n\nBoth Quiz safety commits are included. Chrome offline evidence does not validate a ChatGPT host. Complete old matched envelopes remain a replay limitation; client grading is inspectable. No project-level open-source license was added. F1–F2 complete; F3 independent review pending.\n\nSee [acceptance](acceptance.json), [security](docs/final-edition/security-and-limitations.md), [history risk](history-risk.json) and [formal replay observation](replay-limitation.json).\n').encode()
        origins['RELEASE-NOTES.md'] = {'source': 'unpublished final SHA bound release notes'}
    entries['acceptance.json'] = delivery.canonical_json(acceptance)
    origins['acceptance.json'] = {'source': 'complete selected final structured engineering/browser/package records'}
    for row in engineering['checks']:
        path = ROOT / row['log']
        if (path.is_symlink() or not path.is_file() or path.resolve() != ROOT / row['log']
                or not any(path.resolve().is_relative_to((ROOT / base).resolve()) for base in ('.local/phase3', '.local/offline-final'))):
            raise ValueError('Unsafe explicitly recorded fresh-engineering log')
        content = path.read_bytes()
        if delivery.sha(content) != row['logSha256']:
            raise ValueError('Recorded engineering log bytes changed')
        name = 'logs/' + row['name'] + '.log'
        entries[name] = sanitize(content.decode()).encode()
        origins[name] = {'source': row['log'], 'originalSha256': row['logSha256'], 'machinePathsSanitized': True,
                         'scope': 'explicit complete fresh-public-source command log only'}
    if args.failure_summary:
        path = args.failure_summary
        if path.is_symlink() or not any(path.resolve().is_relative_to((ROOT / base).resolve()) for base in ('.local/phase3', '.local/offline-final')):
            raise ValueError('Failure summary must be an explicitly selected regular Phase 3 public summary')
        name = 'failure-and-retest.json' if path.suffix == '.json' else 'failure-and-retest.md'
        entries[name] = delivery.canonical_json(sanitize(json.loads(path.read_text()))) if path.suffix == '.json' else portable(path.read_bytes())
        origins[name] = {'source': 'explicit selected public original-failure and retest summary'}
    screenshots = browser.get('screenshots', {})
    selected = [path for path in screenshots if re.search(r'-(light-390|dark-320|dark-768)(?:\.|-)', path)
                or any(marker in path for marker in ('interaction', 'security', 'vertical-slice', '-keyboard-', '-copy-', 'quiz-submitted', 'alternative-tab', 'safe-tex', 'a11y', 'accessibility'))]
    if not selected:
        raise ValueError('Final real representative screenshots are missing')
    for relative in selected:
        path = ROOT / relative
        base = ROOT / 'output/playwright/phase3'
        if path.is_symlink() or not path.is_file() or path.resolve() != ROOT / relative or not path.resolve().is_relative_to(base):
            raise ValueError('Unsafe explicitly selected screenshot source')
        content = path.read_bytes()
        legacy.png(content)
        if delivery.sha(content) != screenshots[relative]:
            raise ValueError('Final captured screenshot bytes changed')
        name = 'screenshots/' + path.name
        if name in entries:
            raise ValueError('Duplicate review screenshot filename')
        entries[name] = content
        origins[name] = {'source': relative, 'captureGitHead': browser['captureGitHead'],
                         'captureWorktreeDirty': browser['captureWorktreeDirty'], 'finalCommitSHA': head,
                         'rendererResourceSHA256': browser['rendererResourceSHA256']}
    def command_label(command):
        return json.dumps(command, ensure_ascii=False).replace('|', '\\|').replace('`', '&#96;')
    test_rows = '\n'.join(f"| {row['name']} | `{command_label(row['command'])}` | {row['status']} | {json.dumps(row.get('testCounts', {}), sort_keys=True)} | {row['logSha256']} |" for row in engineering['checks'])
    test_rows = sanitize(test_rows)
    browser_rows = '\n'.join(f"| {row['mode']} | {row['name']} | {row['status']} | {row['scriptSHA256']} |" for row in browser['checks'])
    entries['complete-test-report.md'] = f'''# Complete final local test report

Final commit: `{head}`. Exact environments, commands, timing, counts, full structured layout/interaction records, screen capture identities, declared limitations and per-file archive inventory are in [acceptance.json](acceptance.json). Raw local logs are retained locally and identified by SHA256; private or unselected logs are not in this ZIP.

| Engineering command | Exact invocation | Result | Test counts | Local log SHA256 |
|---|---|---|---|---|
{test_rows}

| Browser mode | Suite | Result | Check script SHA256 |
|---|---|---|---|
{browser_rows}

Browser coverage: 128 layouts, 32 original specialized checks, {browser['coverage']['accessibilityCount']} automatic accessibility checks and {browser['coverage']['mountSamples']} mount checkpoint samples. two-rAF checkpoints are not FCP. RC compiler runs: 330, zero failures. Safari/Firefox/manual VoiceOver/real ChatGPT host are limited to the explicit UNKNOWN/NOT RUN record; they are not reported as passing.
'''.encode()
    origins['complete-test-report.md'] = {'source': 'generated complete final command/check summary'}
    images = ''.join(f'<figure><img loading="lazy" src="{html.escape(name)}" alt="{html.escape(Path(name).stem)}"><figcaption>{html.escape(Path(name).stem)}</figcaption></figure>' for name in entries if name.endswith('.png'))
    entries['index.html'] = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ChatUI Offline Final review screenshots</title><style>body{font:16px system-ui;margin:24px}img{max-width:100%;height:auto}figure{margin:24px 0;border-top:1px solid #aaa;padding-top:12px}</style><h1>Offline Final · 实际候选 Gallery 截图</h1>' + images + '</html>').encode()
    origins['index.html'] = {'source': 'generated static screenshot index'}
    entries['README.md'] = f'''# ChatUI Offline Final Review

Status: **{acceptance['status']}**. F3 independent review is pending.

Final local commit: `{head}` on `{engineering['branch']}`, baseline `{engineering['baselineSha']}`.

Read [current candidate](docs/final-edition/release-candidate.md) and [security](docs/final-edition/security-and-limitations.md), [complete test report](complete-test-report.md), [full structured acceptance](acceptance.json) and [actual screenshot index](index.html). This ZIP is review evidence; runnable product is the separate Gallery ZIP, buildable source is the separate Source ZIP.

- Source: `{Path(packages['source']['path']).name}`, {packages['source']['bytes']} bytes, SHA256 `{packages['source']['sha256']}`.
- Gallery: `{Path(packages['gallery']['path']).name}`, {packages['gallery']['bytes']} bytes, SHA256 `{packages['gallery']['sha256']}`.

No push, deployment, real ChatGPT connection update, publishing, archive or Phase 4 occurred. Local RC ≠ Published Release ≠ Host Validated ≠ GitHub Archived. Project-level license selection remains pending the user's decision. Manual VoiceOver and real host acceptance are unperformed; browser limits and soft budgets are explicit in acceptance.json.
'''.encode()
    validate_summary_identity(entries['README.md'], head, engineering['branch'], engineering['baselineSha'], acceptance['status'])
    origins['README.md'] = {'source': 'generated final local delivery summary; identity independently checked'}
    entries['manifest.json'] = delivery.canonical_json({'format': 'chatui-offline-final-review-v1' if args.offline_final else 'chatui-phase3-review-v1', 'finalCommitSHA': head,
                                                     'source': sanitize(packages['source']), 'gallery': sanitize(packages['gallery']),
                                                     'files': [{**row, 'origin': origins[row['path']]} for row in delivery.inventory(entries)]})
    entries['SHA256SUMS'] = ('\n'.join(f'{delivery.sha(content)}  {name}' for name, content in sorted(entries.items())) + '\n').encode()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = delivery.available(output_dir, 'ChatUI-Offline-Final-Review' if args.offline_final else 'ChatUI-Phase3-Review')
    content = delivery.zipped(entries)
    if content != delivery.zipped(entries) or len(content) > 100 * 1024 * 1024:
        raise ValueError('Review ZIP nondeterministic or exceeds 100 MiB')
    with archive.open('xb') as output:
        output.write(content)
    extraction = delivery.verify_extract(archive, entries)
    report = {'status': 'PASS', 'finalCommitSHA': head, 'path': str(archive), 'bytes': len(content),
              'sha256': delivery.sha(content), 'extraction': str(extraction), 'screenshots': len(selected),
              'repeatedZipBytesIdentical': True, 'inventory': delivery.inventory(entries)}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
