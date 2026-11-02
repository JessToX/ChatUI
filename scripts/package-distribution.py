"""Create local source/Gallery archives from an exact clean commit; never publish."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
import tarfile
import zipfile

from release_documentation import validate_documentation_links

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('distribution_checks', ROOT / 'scripts/qa/package-phase3.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def sha(content):
    return hashlib.sha256(content).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def read_source(root):
    if git(root, 'status', '--porcelain=v1', '--untracked-files=all').strip():
        raise RuntimeError('Use a clean committed checkout')
    commit = git(root, 'rev-parse', 'HEAD').decode().strip()
    tree = git(root, 'rev-parse', 'HEAD^{tree}').decode().strip()
    modes = {}
    for line in git(root, 'ls-tree', '-rz', '--full-tree', 'HEAD').split(b'\0'):
        if not line:
            continue
        meta, name = line.split(b'\t', 1)
        mode, kind, _ = meta.split()
        if kind != b'blob' or mode not in (b'100644', b'100755'):
            raise RuntimeError('Only regular source files may be distributed')
        name = name.decode('utf-8')
        checks.safe_path(name)
        modes[name] = int(mode, 8) & 0o777
    entries = {}
    with tarfile.open(fileobj=io.BytesIO(git(root, 'archive', '--format=tar', commit))) as archive:
        for item in archive:
            if item.isdir():
                continue
            if not item.isfile() or item.name not in modes or item.name in entries:
                raise RuntimeError('Unexpected archive member')
            content = archive.extractfile(item).read()
            checks.scan(item.name, content)
            path = root / item.name
            if path.is_symlink() or path.resolve() != root.resolve() / item.name:
                raise RuntimeError('Worktree file is not a regular source path')
            if path.read_bytes() != content or stat.S_IMODE(path.stat().st_mode) != modes[item.name]:
                raise RuntimeError('Worktree differs from committed bytes or modes')
            entries[item.name] = content
    if set(entries) != set(modes):
        raise RuntimeError('Git archive omitted committed files')
    manifest = json.loads(entries['PACKAGE-MANIFEST.json'])
    if set(entries) != set(manifest['files']) | {'PACKAGE-MANIFEST.json'}:
        raise RuntimeError('Input inventory mismatch')
    if any(sha(entries[name]) != expected for name, expected in manifest['files'].items()):
        raise RuntimeError('Input manifest hash mismatch')
    validate_documentation_links(entries)
    return commit, tree, entries, modes


def zipped(entries, modes, prefix):
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(entries.items()):
            checks.scan(name, content)
            info = zipfile.ZipInfo(prefix + '/' + name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | modes[name]) << 16
            archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return result.getvalue()


def package(root, output):
    output = output.resolve()
    if output == root.resolve() or root.resolve() in output.parents:
        raise RuntimeError('Output must be outside the source checkout')
    if output.exists():
        raise RuntimeError('Output must be a new directory')
    commit, tree, source, modes = read_source(root)
    gallery = checks.gallery_entries(root)
    for name, content in gallery.items():
        if source['renderer/public/gallery/' + name] != content:
            raise RuntimeError('Gallery differs from committed source')
    gallery = {'gallery/' + name: content for name, content in gallery.items()}
    gallery.update({
        'LICENSE': source['LICENSE'],
        'NOTICE.txt': source['docs/release-preparation/GALLERY-NOTICE.txt'],
        'README.txt': source['docs/release-preparation/GALLERY-DISTRIBUTION.txt'],
    })
    validate_documentation_links(gallery)
    records, assets = {}, {}
    for label, entries, file_modes in (
        ('Source', source, modes), ('Gallery', gallery, {name: 0o644 for name in gallery})
    ):
        filename = 'ChatUI-' + label + '-' + commit[:12] + '.zip'
        content = zipped(entries, file_modes, 'ChatUI-' + label)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if archive.testzip() is not None:
                raise RuntimeError('ZIP CRC failure')
        assets[filename] = content
        records[filename] = {'sha256': sha(content), 'bytes': len(content), 'files': {
            name: {'sha256': sha(data), 'mode': oct(file_modes[name]), 'bytes': len(data)}
            for name, data in sorted(entries.items())}}
    metadata = {
        'schemaVersion': 1, 'status': 'LOCAL_CANDIDATE_NOT_PUBLISHED',
        'sourceCommit': commit, 'sourceTree': tree,
        'pluginVersion': json.loads(source['plugins/chatui/plugin.json'])['version'],
        'rendererVersion': json.loads(source['renderer/package.json'])['version'],
        'packageManifestSHA256': sha(source['PACKAGE-MANIFEST.json']),
        'validation': 'Content binding only; exact-candidate test results are separate.',
        'archives': records,
    }
    assets['release.json'] = canonical(metadata)
    checks.scan('release.json', assets['release.json'])
    assets['SHA256SUMS'] = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(assets.items())).encode()
    # Do not leave apparent final artifacts if any validation above fails.
    output.mkdir(parents=True, exist_ok=False)
    for name, content in assets.items():
        with (output / name).open('xb') as file:
            file.write(content)
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = package(ROOT, args.output)
    print(json.dumps({'sourceCommit': result['sourceCommit'], 'archives': {
        name: {'sha256': row['sha256'], 'bytes': row['bytes'], 'files': len(row['files'])}
        for name, row in result['archives'].items()}}, indent=2))
