#!/usr/bin/env python3
"""Derive the legacy overlay from the portable manifest; never install a plugin."""
import argparse
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLUGIN = PROJECT_ROOT / 'plugins' / 'chatui'
CANDIDATE_PLUGIN_VERSION = '1.0.0'
CANDIDATE_RENDERER_VERSION = '1.6.1-iteration.1'


def expected_overlay(portable, previous):
    result = dict(previous)
    for key in ('name', 'version', 'description', 'author'):
        if key in portable:
            result[key] = portable[key]
        else:
            result.pop(key, None)
    extension = portable.get('extensions', {}).get('com.openai', {})
    result['interface'] = extension.get('interface', {})
    result['skills'] = './skills'
    if 'apps' in extension:
        result['apps'] = extension['apps']
    else:
        result.pop('apps', None)
    return result


def sync(plugin, check=False):
    portable = json.loads((plugin / 'plugin.json').read_text())
    path = plugin / '.codex-plugin' / 'plugin.json'
    previous = json.loads(path.read_text())
    expected = expected_overlay(portable, previous)
    if check:
        if previous != expected:
            raise ValueError('Overlay metadata differs from the portable source')
    elif previous != expected:
        path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')


def check_candidate(root=PROJECT_ROOT):
    """Check only public candidate sources; do not install or inspect bindings."""
    plugin = root / 'plugins' / 'chatui'
    sync(plugin, check=True)
    portable = json.loads((plugin / 'plugin.json').read_text())
    package = json.loads((root / 'renderer' / 'package.json').read_text())
    lock = json.loads((root / 'renderer' / 'package-lock.json').read_text())
    expected = {
        'portable': (portable.get('version'), CANDIDATE_PLUGIN_VERSION),
        'renderer': (package.get('version'), CANDIDATE_RENDERER_VERSION),
        'lockfile': (lock.get('version'), CANDIDATE_RENDERER_VERSION),
        'lockfile package': (lock.get('packages', {}).get('', {}).get('version'), CANDIDATE_RENDERER_VERSION),
    }
    for label, (actual, version) in expected.items():
        if actual != version:
            raise ValueError(f'{label} candidate version must be {version}')
    generated = (root / 'renderer' / 'lib' / 'version.generated.mjs').read_text()
    if f'export const rendererVersion = {json.dumps(CANDIDATE_RENDERER_VERSION)};' not in generated:
        raise ValueError('Generated renderer version differs; run generate:widget')
    descriptions = [portable.get('description', '')]
    for name in ('README.md', 'renderer/README.md',
                 'plugins/chatui/skills/chatui/SKILL.md',
                 'plugins/chatui/skills/chatui-progress/SKILL.md'):
        text = (root / name).read_text()
        if not all(version in text for version in (CANDIDATE_PLUGIN_VERSION, CANDIDATE_RENDERER_VERSION)):
            raise ValueError(f'Candidate version wording differs in {name}')
        descriptions.append(text)
    for description in descriptions:
        if not re.search(r'本地.*候选|local.*candidate', description, re.IGNORECASE):
            raise ValueError('Candidate metadata must explicitly identify its local candidate status')
        if not re.search(r'尚未发布|not published', description, re.IGNORECASE):
            raise ValueError('Candidate metadata must explicitly identify its unpublished status')
    return {label: actual for label, (actual, _) in expected.items()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--candidate', action='store_true', help='Read-only Phase 3 version/documentation check; requires --check.')
    parser.add_argument('--plugin-dir', type=Path, default=DEFAULT_PLUGIN)
    args = parser.parse_args()
    if args.candidate and not args.check:
        parser.error('--candidate requires --check; candidate checks never write')
    sync(args.plugin_dir, args.check)
    if args.candidate:
        if args.plugin_dir.resolve() != DEFAULT_PLUGIN.resolve():
            parser.error('--candidate checks the public project sources and does not accept --plugin-dir')
        check_candidate()
        print('Local candidate versions/README/Skills consistent; unpublished and no host acceptance implied')
    print('Portable/overlay metadata consistent; no install or publish action')
