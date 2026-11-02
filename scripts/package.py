#!/usr/bin/env python3
"""Validate and build a reproducible, single-root ChatUI plugin ZIP."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import tempfile
import sys
import zipfile
from pathlib import Path

from validate import DEFAULT_PLUGIN, PROJECT_ROOT, ValidationError, validate
from release_inventory import selected_files, checked_bytes


def package(plugin_dir: Path, output_dir: Path) -> Path:
    # Real repository packages validate an allowlisted snapshot. Unknown local
    # files are never opened. Generic synthetic/test plugins retain validation.
    if plugin_dir.resolve() == DEFAULT_PLUGIN.resolve():
        if output_dir.resolve() == plugin_dir.resolve() or output_dir.resolve().is_relative_to(plugin_dir.resolve()):
            raise ValidationError('Output directory must be outside the plugin directory.')
        with tempfile.TemporaryDirectory() as temporary:
            selected = Path(temporary) / 'chatui'
            for name, source in selected_files('plugin'):
                relative = source.relative_to(DEFAULT_PLUGIN)
                target = selected / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(checked_bytes(source, name))
            return package(selected, output_dir)
    manifest, files = validate(plugin_dir)
    root = plugin_dir.resolve()
    destination = output_dir.resolve()
    if destination == root or destination.is_relative_to(root):
        raise ValidationError("Output directory must be outside the plugin directory.")
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / f"{manifest['name']}-{manifest['version']}.zip"
    temporary = archive.with_suffix(".zip.tmp")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
            for path in files:
                name = f"{manifest['name']}/{path.relative_to(root).as_posix()}"
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(entry, path.read_bytes(), compresslevel=9)
        with zipfile.ZipFile(temporary) as check:
            if check.testzip() is not None:
                raise ValidationError("ZIP integrity check failed.")
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, epilog="The ZIP contains one plugin-name/ root, fixed timestamps and sorted files. An existing archive of the same version is replaced only after successful validation and integrity checks.")
    parser.add_argument("plugin_dir", nargs="?", type=Path, default=DEFAULT_PLUGIN, help="Plugin directory (default: ../plugins/chatui relative to this script).")
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "dist", help="Directory outside the plugin for the ZIP (default: ../dist).")
    args = parser.parse_args()
    try:
        archive = package(args.plugin_dir, args.output_dir)
    except (ValidationError, OSError, zipfile.BadZipFile) as exc:
        print(f"Packaging failed:\n{exc}", file=sys.stderr)
        return 1
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(archive)
    print(f"SHA256 {digest}")
    print("Packaged only; Chat installation and conversation acceptance have not been verified by this command.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
