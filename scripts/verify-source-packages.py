#!/usr/bin/env python3
"""Local reproducibility and allowlist verification; never install or publish."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import zipfile

from package import package
from release_inventory import BLOCKED_NAMES, BLOCKED_PARTS, selected_files
from release_documentation import validate_documentation_links
from validate import DEFAULT_PLUGIN, PROJECT_ROOT, ValidationError

spec = importlib.util.spec_from_file_location('renderer_package', PROJECT_ROOT / 'scripts' / 'package-renderer.py')
renderer_package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer_package)


def verify_archive(archive, selected):
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise ValidationError('ZIP integrity check failed')
        names = zipped.namelist()
        if len(names) != len(set(names)):
            raise ValidationError('Duplicate entry in ZIP')
        if set(names) != set(selected):
            raise ValidationError('Archive differs from exact allowlist')
        contents = {}
        for info in zipped.infolist():
            path = Path(info.filename)
            if (path.is_absolute() or '..' in path.parts or set(path.parts) & BLOCKED_PARTS
                    or path.name in BLOCKED_NAMES or path.name.startswith('.env')):
                raise ValidationError('Forbidden archive entry')
            if info.date_time != (1980, 1, 1, 0, 0, 0):
                raise ValidationError('Noncanonical archive timestamp')
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValidationError('Symlink in package')
            content = zipped.read(info.filename)
            if content != selected[info.filename].read_bytes():
                raise ValidationError(f'Archive source bytes differ: {info.filename}')
            contents[info.filename] = content
        return validate_documentation_links(contents)


def verify(destination):
    plugin = package(DEFAULT_PLUGIN, destination)
    renderer = renderer_package.package(destination)
    original = {path.name: path.read_bytes() for path in (plugin, renderer)}
    package(DEFAULT_PLUGIN, destination)
    renderer_package.package(destination)
    selected = {
        plugin.name: {'chatui/' + str(path.relative_to(DEFAULT_PLUGIN)): path for _, path in selected_files('plugin')},
        renderer.name: {name: path for name, path in selected_files('renderer')},
    }
    selected[renderer.name].update({name: path for name, path in selected_files('documents')})
    selected[renderer.name]['docs/source-allowlist.json'] = PROJECT_ROOT / 'scripts' / 'release-allowlist.json'
    results = []
    for archive in (plugin, renderer):
        if archive.read_bytes() != original[archive.name]:
            raise ValidationError('ZIP bytes changed between identical runs')
        links = verify_archive(archive, selected[archive.name])
        results.append({'archive': archive.name, 'files': len(selected[archive.name]), 'sha256': hashlib.sha256(original[archive.name]).hexdigest(), 'repeatBytesIdentical': True, 'relativeDocumentationLinks': links})
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=PROJECT_ROOT).decode().split('\0'))
    for scope in ('plugin', 'renderer', 'documents'):
        if not all(name in tracked for name, _ in selected_files(scope)):
            raise ValidationError('Untracked allowlisted input')
    return {'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=PROJECT_ROOT, text=True).strip(),
            'selection': 'Exact allowlisted tracked inputs only; excluded local/private bytes not scanned',
            'archives': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=PROJECT_ROOT / '.local/phase01/packages')
    args = parser.parse_args()
    print(json.dumps(verify(args.output_dir), indent=2))
