#!/usr/bin/env python3
"""Build a deterministic, standalone Renderer source ZIP without local deployment data."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

from validate import PROJECT_ROOT, SECRET_PATTERNS, ValidationError
from release_inventory import selected_files, checked_bytes
from release_documentation import validate_documentation_links

RENDERER = PROJECT_ROOT / 'renderer'
BLOCKED_DIRS = {'.git', 'node_modules', 'dist', '.next', '.vinext', '.openai', '.wrangler',
                '.sites-runtime', '.agents', '.codex', '.local', '.vercel', 'coverage',
                'outputs', 'output', 'work', '__pycache__', 'screenshots', 'conversation-exports'}
BLOCKED_NAMES = {'.DS_Store', 'credentials.json', 'cookies.json', 'conversations.json',
                 'chat.html', 'next-env.d.ts'}


def source_entries() -> dict[str, bytes]:
    entries = {}
    for name, path in selected_files('renderer'):
        relative = Path(name)
        if (set(relative.parts) & BLOCKED_DIRS or relative.name in BLOCKED_NAMES
                or relative.name.startswith('.env') or relative.suffix in {'.pem', '.key', '.pyc'}
                or relative.name.endswith('.tsbuildinfo')):
            continue
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(RENDERER.resolve()):
            raise ValidationError(f'Unsafe or missing Renderer source: {name}')
        entries[relative.as_posix()] = checked_bytes(path, name)
    # Keep operational documentation available even outside the monorepo.
    for name, path in selected_files('documents'):
        entries[name] = checked_bytes(path, name)
    # Current documentation links must retain the actual approved license and
    # notices in this older Renderer-only archive as well as the full Source ZIP.
    for name, path in selected_files('source'):
        if name in ('LICENSE', 'NOTICE.txt', 'THIRD_PARTY_NOTICES.md'):
            entries[name] = checked_bytes(path, name)
    entries['README.md'] = (
        '# Standalone Renderer source subset\n\n'
        'This legacy archive contains Renderer sources and documentation, not the complete ChatUI Source distribution. '
        'Use [Renderer instructions](renderer/README.md) for its local build. '
        'Full-project commands in the included documentation require the complete Source ZIP described in '
        '[distribution instructions](docs/release-preparation/DISTRIBUTION.md). '
        'This subset does not include the full root test harness or its PACKAGE-MANIFEST.\n\n'
        'Original contributions: [MIT](LICENSE), Copyright (c) 2026 Jess(T o X). '
        'See [third-party notices](THIRD_PARTY_NOTICES.md) and [current scope](docs/release-preparation/RELEASE-NOTES.md). '
        'No deployment or installed ChatGPT connection is provided.\n'
    ).encode()
    entries['docs/source-allowlist.json'] = (PROJECT_ROOT / 'scripts' / 'release-allowlist.json').read_bytes()
    for name, content in entries.items():
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            continue
        for kind, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                raise ValidationError(f'Private content ({kind}) in {name}; source package not created.')
    required = ('package.json', 'package-lock.json', 'hosting.example.json',
                'lib/vendor/component-kit.html', 'lib/vendor/component-examples.json',
                'lib/response.generated.mjs', 'public/chatui-response.html',
                'lib/html-policy.mjs', 'lib/html-surface.js',
                'lib/document.generated.mjs', 'public/chatui-document.html',
                'examples/rc-fixtures.mjs', 'examples/math-physics-golden.json',
                'lib/version.generated.mjs')
    if any(f'renderer/{name}' not in entries for name in required):
        raise ValidationError('Standalone Renderer source inventory is incomplete.')
    validate_documentation_links(entries)
    return entries


def package(output_dir: Path) -> Path:
    manifest = json.loads((RENDERER / 'package.json').read_text())
    lock = json.loads((RENDERER / 'package-lock.json').read_text())
    version = manifest['version']
    if lock['version'] != version or lock['packages']['']['version'] != version:
        raise ValidationError('Renderer manifest and lockfile versions differ.')
    destination = output_dir.resolve()
    if destination.is_relative_to(RENDERER.resolve()):
        raise ValidationError('Output directory must be outside renderer/.')
    entries = source_entries()
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / f'chatui-renderer-{version}-source.zip'
    temporary = archive.with_suffix('.zip.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
            for name, content in sorted(entries.items()):
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = (0o100755 if name.endswith('.sh') else 0o100644) << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(entry, content, compresslevel=9)
        with zipfile.ZipFile(temporary) as check:
            if check.testzip() is not None:
                raise ValidationError('Source archive integrity check failed.')
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=PROJECT_ROOT / 'dist')
    args = parser.parse_args()
    try:
        archive = package(args.output_dir)
    except (OSError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as exc:
        print(f'Renderer packaging failed: {exc}', file=sys.stderr)
        return 1
    print(archive)
    print(f'SHA256 {hashlib.sha256(archive.read_bytes()).hexdigest()}')
    print('Packaged only; no Site deployment or ChatGPT acceptance is implied.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
