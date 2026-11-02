#!/usr/bin/env python3
"""Create reproducible local RC Source/Gallery ZIPs; never publish or deploy.

Selection is explicit. Existing private configuration is neither read nor copied.
The source App binding is a generated, nonfunctional public test placeholder.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from release_inventory import BLOCKED_NAMES, BLOCKED_PARTS, checked_bytes, selected_files  # noqa: E402
from release_documentation import validate_documentation_links  # noqa: E402
from release_privacy import validate_public_content  # noqa: E402
from validate import ValidationError  # noqa: E402
import offline_final_identity  # noqa: E402

SOURCE_MANIFEST = 'RC-SOURCE-MANIFEST.json'
GALLERY_FILES = ('README.md', 'SHA256SUMS', 'THIRD_PARTY_NOTICES.md', 'fixtures.json',
                 'index.html', 'manifest.json', 'renderer.html')
PUBLIC_APP = (json.dumps({'apps': {'chatui': {'id': 'connector_synthetic_local_placeholder',
                                           'required': True}}}, indent=2) + '\n').encode()


def sha(content):
    return hashlib.sha256(content).hexdigest()


def canonical_json(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def safe_path(name):
    validate_public_content(name.encode('utf-8'))
    path = PurePosixPath(name)
    if (not name or '\x00' in name or path.is_absolute() or '..' in path.parts
            or '\\' in name or ':' in name or str(path) != name or name == '.'
            or set(path.parts) & BLOCKED_PARTS or path.name in BLOCKED_NAMES
            or path.name.startswith('.env') or path.suffix.lower() in {'.pem', '.key', '.p12', '.pyc'}):
        raise ValidationError('Unsafe archive path')


def scan(name, content):
    safe_path(name)
    validate_public_content(content, json_document=PurePosixPath(name).suffix.lower() == '.json')
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        if not name.endswith('.png'):
            raise ValidationError('Unexpected non-text source file: ' + name)
        return


def source_entries(root=ROOT, manifest=None):
    """Read selected public bytes only; never open the original App binding."""
    manifest = manifest or root / 'scripts/release-allowlist.json'
    entries, origins = {}, {}
    for scope in ('source', 'plugin', 'renderer', 'documents'):
        for name, path in selected_files(scope, root, manifest):
            if name == 'plugins/chatui/.app.json':
                entries[name] = PUBLIC_APP
                origins[name] = 'generated public nonfunctional App placeholder; original binding not read'
            else:
                entries[name] = checked_bytes(path, name)
                origins[name] = 'allowlisted source bytes'
            scan(name, entries[name])
    required = ('README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'requirements-phase3.txt',
                'scripts/build_component_templates.py', 'scripts/release-allowlist.json',
                'scripts/qa/package-phase3.py', 'scripts/qa/verify-phase3-engineering.py',
                'tests/component-template.mjs', 'tests/test_phase3_delivery.py',
                'renderer/package.json', 'renderer/package-lock.json',
                'renderer/hosting.example.json', 'renderer/lib/vendor/component-kit.html',
                'renderer/examples/math-physics-golden.json', 'renderer/scripts/generate-gallery.mjs',
                'docs/final-edition/phase3.md', 'docs/final-edition/release-candidate.md')
    if any(name not in entries for name in required):
        raise ValidationError('Incomplete independently buildable Phase 3 source inventory')
    validate_documentation_links(entries)
    return entries, origins


def gallery_entries(root=ROOT):
    directory = root / 'renderer/public/gallery'
    if directory.is_symlink() or sorted(path.name for path in directory.iterdir()) != sorted(GALLERY_FILES):
        raise ValidationError('Gallery must contain exactly the seven declared public files')
    entries = {}
    for name in GALLERY_FILES:
        path = directory / name
        if path.is_symlink() or not path.is_file() or path.resolve() != root.resolve() / 'renderer/public/gallery' / name:
            raise ValidationError('Unsafe Gallery source')
        entries[name] = checked_bytes(path, name)
        scan(name, entries[name])
    validate_documentation_links(entries)
    verify_sums(entries)
    metadata = json.loads(entries['manifest.json'])
    if metadata['fixtureHash'] != sha(entries['fixtures.json']) or metadata['rendererResourceSHA256'] != sha(entries['renderer.html']):
        raise ValidationError('Gallery manifest resource mismatch')
    return entries


def inventory(entries, origins=None):
    return [{'path': name, 'bytes': len(content), 'sha256': sha(content),
             **({'origin': origins[name]} if origins else {})} for name, content in sorted(entries.items())]


def with_source_identity(entries, origins, identity):
    entries = dict(entries)
    entries[SOURCE_MANIFEST] = canonical_json({
        'format': 'chatui-final-rc-source-v1', **identity,
        'selection': 'Exact public allowlist; original App binding, private configuration and logs not read',
        'publicPlaceholder': {'path': 'plugins/chatui/.app.json', 'nonfunctional': True, 'sha256': sha(PUBLIC_APP)},
        'files': inventory(entries, origins),
    })
    entries['SHA256SUMS'] = ('\n'.join(f'{sha(content)}  {name}' for name, content in sorted(entries.items())) + '\n').encode()
    return entries


def zipped(entries):
    # Validate privacy before link errors can echo an entry name or target.
    for name, content in entries.items():
        scan(name, content)
    validate_documentation_links(entries)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(entries.items()):
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = (0o100755 if name.endswith('.sh') else 0o100644) << 16
            item.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(item, content, compresslevel=9)
    return output.getvalue()


def verify_sums(entries):
    if 'SHA256SUMS' not in entries:
        return
    lines = entries['SHA256SUMS'].decode().splitlines()
    sums = {}
    for line in lines:
        expected, name = line.split('  ', 1)
        safe_path(name)
        if name in sums or name == 'SHA256SUMS' or name not in entries or expected != sha(entries[name]):
            raise ValidationError('Invalid or mismatched checksum inventory')
        sums[name] = expected
    if set(sums) != set(entries) - {'SHA256SUMS'}:
        raise ValidationError('Incomplete checksum inventory')


def read_archive(archive, expected=None):
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if source.testzip() or len(names) != len(set(names)):
            raise ValidationError('ZIP integrity/duplicate failure')
        if expected is not None and set(names) != set(expected):
            raise ValidationError('ZIP differs from exact declared inventory')
        entries = {}
        for item in source.infolist():
            safe_path(item.filename)
            if (item.date_time != (1980, 1, 1, 0, 0, 0)
                    or stat.S_IFMT(item.external_attr >> 16) != stat.S_IFREG
                    or item.create_system != 3):
                raise ValidationError('Noncanonical timestamp or nonregular ZIP member')
            content = source.read(item)
            scan(item.filename, content)
            if expected is not None and content != expected[item.filename]:
                raise ValidationError('ZIP bytes differ from selected source: ' + item.filename)
            entries[item.filename] = content
    validate_documentation_links(entries)
    verify_sums(entries)
    if SOURCE_MANIFEST in entries:
        record = json.loads(entries[SOURCE_MANIFEST])
        rows = record.get('files', [])
        selected = set(entries) - {SOURCE_MANIFEST, 'SHA256SUMS'}
        if (record.get('format') != 'chatui-final-rc-source-v1' or not isinstance(rows, list)
                or len(rows) != len(selected) or {row.get('path') for row in rows} != selected):
            raise ValidationError('Source identity manifest inventory mismatch')
        for row in rows:
            content = entries[row['path']]
            if row.get('sha256') != sha(content) or row.get('bytes') != len(content):
                raise ValidationError('Source identity manifest bytes mismatch')
        if entries.get('plugins/chatui/.app.json') != PUBLIC_APP:
            raise ValidationError('Source App binding is not the public synthetic placeholder')
    return entries


def verify_extract(archive, expected=None, destination=None):
    """Validate all members before any extraction; destination must be empty."""
    entries = read_archive(archive, expected)
    directory = (Path(destination) if destination is not None else Path(tempfile.mkdtemp(prefix='chatui-phase3-rc-'))).resolve()
    if directory.exists() and any(directory.iterdir()):
        raise ValidationError('Fresh extraction destination must be empty')
    directory.mkdir(parents=True, exist_ok=True)
    for name, content in entries.items():
        path = directory / name
        if not path.resolve().is_relative_to(directory):
            raise ValidationError('Extraction containment failure')
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as output:
            output.write(content)
        if name.endswith('.sh'):
            path.chmod(0o755)
        if path.is_symlink() or path.read_bytes() != content:
            raise ValidationError('Fresh extracted bytes mismatch')
    return directory


def available(directory, stem):
    path, count = directory / (stem + '.zip'), 2
    while path.exists() or path.is_symlink():
        path = directory / f'{stem}-v{count}.zip'
        count += 1
    return path


def git(*args, root=ROOT):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def package(output_dir, phase='final', root=ROOT, offline_final=False):
    head = git('rev-parse', 'HEAD', root=root)
    state = offline_final_identity.capture(root) if offline_final else {}
    dirty = state['captureWorktreeDirty'] if offline_final else bool(git('status', '--porcelain', root=root))
    if not offline_final and git('branch', '--show-current', root=root) != 'codex/final-edition':
        raise ValidationError('RC packaging requires codex/final-edition')
    if phase == 'final' and dirty:
        raise ValidationError('Final RC packaging requires a clean local commit')
    entries, origins = source_entries(root)
    gallery = gallery_entries(root)
    identity = {**state, 'sourceSha': head, 'captureGitHead': head, 'captureWorktreeDirty': dirty,
                'phase': phase, 'candidateOnly': True,
                'galleryResourceSHA256': {name: sha(content) for name, content in sorted(gallery.items())},
                'lockSha256': {name: sha(entries[name]) for name in ('package-lock.json', 'renderer/package-lock.json')}}
    if phase == 'final':
        for name, content in entries.items():
            if name == 'plugins/chatui/.app.json':
                continue
            committed = subprocess.check_output(['git', 'show', head + ':' + name], cwd=root)
            if committed != content:
                raise ValidationError('Final allowlisted bytes differ from committed blob: ' + name)
    source = with_source_identity(entries, origins, identity)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {'status': 'PASS', **identity, 'selection': 'Public selected files only; no excluded private bytes read',
              'sourceManifest': SOURCE_MANIFEST, 'repeatedZipBytesIdentical': True}
    stems = ('ChatUI-Offline-Final-Source-Candidate', 'ChatUI-Offline-Final-Gallery-Candidate') if offline_final else ('ChatUI-Final-RC-Source', 'ChatUI-Final-RC-Gallery')
    for kind, stem, selected in [('source', stems[0], source), ('gallery', stems[1], gallery)]:
        archive = available(output_dir, stem)
        content = zipped(selected)
        if content != zipped(selected):
            raise ValidationError('Repeated ZIP bytes differ')
        with archive.open('xb') as output:
            output.write(content)
        extracted = verify_extract(archive, selected)
        result[kind] = {'path': str(archive), 'bytes': len(content), 'sha256': sha(content),
                        'extraction': str(extracted), 'unpackedBytes': sum(len(item) for item in selected.values()),
                        'files': len(selected), 'relativeDocumentationLinks': validate_documentation_links(selected),
                        'inventory': inventory(selected)}
    if offline_final:
        final_state = offline_final_identity.capture(root)
        offline_final_identity.require_same_source(state, final_state)
        final_dirty = final_state['captureWorktreeDirty']
    else:
        final_dirty = bool(git('status', '--porcelain', root=root))
    if git('rev-parse', 'HEAD', root=root) != head or final_dirty != dirty:
        raise ValidationError('Source identity changed during packaging')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--phase', choices=['precommit', 'final'], required=True)
    parser.add_argument('--offline-final', action='store_true', help='Require the exact latest safety baseline on an attached branch, including main')
    args = parser.parse_args()
    print(json.dumps(package(args.output_dir, args.phase, offline_final=args.offline_final), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
