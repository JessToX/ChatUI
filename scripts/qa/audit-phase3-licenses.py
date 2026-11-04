#!/usr/bin/env python3
"""Reconcile local candidate notices with public lockfiles and shipped licenses."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYTHON_LICENSES = {'matplotlib': 'Matplotlib license (PSF based)', 'numpy': 'BSD-3-Clause and bundled-library notices',
                   'Pillow': 'MIT-CMU', 'contourpy': 'BSD-3-Clause', 'cycler': 'BSD-3-Clause',
                   'fonttools': 'MIT', 'kiwisolver': 'BSD-3-Clause', 'packaging': 'Apache-2.0 OR BSD-2-Clause',
                   'pyparsing': 'MIT', 'python-dateutil': 'Apache-2.0 OR BSD-3-Clause', 'six': 'MIT'}


def audit(root=ROOT):
    inventories, direct = [], []
    for scope, base in [('root-test', root), ('renderer', root / 'renderer')]:
        lock_path, package_path = base / 'package-lock.json', base / 'package.json'
        lock = json.loads(lock_path.read_text())
        package = json.loads(package_path.read_text())
        rows = []
        for path, dependency in sorted(lock['packages'].items()):
            if not path:
                continue
            if not dependency.get('version') or not dependency.get('license'):
                raise ValueError('Missing pinned version or declared dependency license: ' + path)
            rows.append({'path': path, 'version': dependency['version'], 'license': dependency['license'],
                         'dev': dependency.get('dev', False), 'optional': dependency.get('optional', False),
                         'integrity': dependency.get('integrity', '')})
        for kind in ('dependencies', 'devDependencies'):
            for name in sorted(package.get(kind, {})):
                dependency = lock['packages']['node_modules/' + name]
                direct.append({'scope': scope, 'name': name, 'version': dependency['version'],
                               'license': dependency['license'], 'role': 'install/build/test' if kind == 'devDependencies' else 'server/app install dependency'})
        inventories.append({'scope': scope, 'lockfile': lock_path.relative_to(root).as_posix(),
                            'lockSha256': hashlib.sha256(lock_path.read_bytes()).hexdigest(), 'packages': rows})
    python = []
    for line in (root / 'requirements-phase3.txt').read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        name, version = line.split('==')
        python.append({'name': name, 'version': version, 'license': PYTHON_LICENSES[name],
                       'role': 'optional static-force PNG/SVG adapter acceptance environment; not shipped code'})
    return {'format': 'chatui-third-party-lock-inventory-v1',
            'scope': 'Public lock metadata only. node_modules is not shipped. Metadata licenses are not a blanket project license.',
            'embeddedRuntime': [{'name': 'DOMPurify', 'version': '3.4.17', 'license': '(MPL-2.0 OR Apache-2.0)',
                                 'chosenNotice': 'Apache-2.0', 'shippedIn': 'response generated resources only; absent from Document Gallery'},
                                {'name': 'regenerator-runtime helper', 'version': 'bundled helper within DOMPurify 3.4.17; no separate npm version asserted',
                                 'license': 'MIT', 'shippedIn': 'response generated resources only; absent from Document Gallery',
                                 'copyright': 'Copyright (c) 2014-present, Facebook, Inc.'},
                                {'name': 'shadcn', 'version': 'tailwind-4.13.0 vendored stylesheet', 'license': 'MIT',
                                 'shippedIn': 'renderer/vendor/shadcn-tailwind-4.13.0.css'}],
            'copiedBuildSource': [{'name': 'OpenAI Sites Vite plugin', 'version': 'vendored source declares 0.2.0 (openai/sites#9)',
                                  'sourceSha256': hashlib.sha256((root / 'renderer/build/sites-vite-plugin.ts').read_bytes()).hexdigest(),
                                  'provenanceScope': 'Repository source attribution; upstream origin not independently revalidated in Phase 3',
                                  'license': 'MIT', 'shippedIn': 'renderer/build/sites-vite-plugin.ts'},
                                 {'name': 'Official Next.js OG security backport', 'version': 'Next 16.4.1 patch for @vercel/og 1.0.1',
                                  'sourceSha256': hashlib.sha256((root / 'renderer/vendor/og-security/next-16.4.1.patch').read_bytes()).hexdigest(),
                                  'license': 'MIT (Next.js patch); MPL-2.0 (modified OG files)',
                                  'shippedIn': 'renderer/vendor/og-security',
                                  'provenance': 'renderer/vendor/og-security/provenance.json'}],
            'direct': direct, 'locks': inventories, 'pythonInstallDependencies': python}


def outputs(root=ROOT):
    record = audit(root)
    inventory = (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode()
    rows = '\n'.join(f"| {row['scope']} | `{row['name']}` | {row['version']} | {row['license']} | {row['role']} |" for row in record['direct'])
    python_rows = '\n'.join(f"| `{row['name']}` | {row['version']} | {row['license']} |" for row in record['pythonInstallDependencies'])
    text = f'''# ChatUI local RC third-party notices

This is a local Release Candidate, not a published release. Original ChatUI contributions are licensed under MIT; Copyright (c) 2026 Jess(T o X). See [LICENSE](LICENSE). Third-party code and assets retain their original licenses and copyright notices; the root MIT license does not relicense them.

## Shipped code and generated artifacts

| Material | Exact version or source identity | License | Distribution role |
|---|---|---|---|
| DOMPurify | 3.4.17 | MPL-2.0 OR Apache-2.0; Apache-2.0 notice retained below | Embedded in response generated JS/HTML only. The offline Document Gallery does not embed DOMPurify. |
| regenerator-runtime helper | bundled in DOMPurify 3.4.17; no separate npm version asserted | MIT, Copyright (c) 2014-present Facebook, Inc. | Embedded in response generated JS/HTML only; absent from Document Gallery. |
| shadcn stylesheet | vendored `shadcn-tailwind-4.13.0.css` | MIT | Stylesheet shipped in Source ZIP; copyright notice retained below. |
| OpenAI Sites Vite plugin | vendored source declares 0.2.0 (`openai/sites#9`); exact source hash in inventory | MIT | Source/build integration only; original notice retained below. Upstream origin not independently revalidated in Phase 3. |
| KaTeX | 0.19.0 | MIT | Trusted server/build compiler produces fixed MathML. Library JavaScript/fonts are not in Gallery. |
| marked | 18.1.0 | MIT, with original Markdown BSD notice | Trusted server/build Markdown compiler. Not shipped as Gallery runtime code. |
| sanitize-html | 2.18.1 | MIT | Trusted server/build HTML sanitizer. Not shipped as Gallery runtime code. |
| esbuild | 0.28.2 | MIT | Build bundler. Not shipped as Gallery runtime code. |

The Gallery is exactly seven static files, includes the separate notice copy below, and loads no npm library, remote script, CDN or remote font. Generated markup and authored ChatUI runtime are distinct from the installed server/build dependencies.

## Locked install dependencies

The Source ZIP ships manifests/lockfiles and the code that imports dependencies; it excludes `node_modules`. The table identifies all direct dependencies at their resolved lockfile versions. Dev dependencies run installation/build/tests; the other Renderer dependencies are installed for server/app use and are not thereby embedded into the Gallery. Transitive dependencies, optional platform packages, integrity strings and per-lock hashes are recorded in the [full dependency inventory](docs/final-edition/third-party-dependencies.json). The inventory uses each package's declared license metadata, with no missing license entries. Installed dependencies retain their own npm license files when fetched by locked install; this source distribution does not redistribute their complete packages.

| Scope | Dependency | Locked version | Declared license | Role |
|---|---|---|---|---|
{rows}

## Optional Python install dependencies

`requirements-phase3.txt` pins the isolated environment used to exercise the optional static force PNG/SVG adapter. The Gallery, JavaScript renderer and Python stdlib generation do not need these packages. They are external install dependencies, not code redistributed in this Source ZIP; each installation retains its own license and any wheel-bundled native-library notices. Versions and licenses below were checked against the existing installed distribution metadata; the inventory is regenerated from the public requirements file and the recorded license identity, without reading personal configuration.

| Dependency | Pinned version | Distribution license |
|---|---|---|
{python_rows}

## Compiler and generated-resource notices

'''
    text += (root / 'renderer/gallery/THIRD_PARTY_NOTICES.md').read_text()
    text += '\n\n## Vendored shadcn stylesheet\n\n' + (root / 'renderer/vendor/shadcn-tailwind-4.13.0.LICENSE.md').read_text()
    text += '\n\n## Copied OpenAI Sites build integration\n\n' + (root / 'renderer/build/sites-vite-plugin.LICENSE').read_text()
    text += '\n\n## Bundled regenerator-runtime helper\n\n' + (root / 'renderer/vendor/shadcn-tailwind-4.13.0.LICENSE.md').read_text().replace('Copyright (c) 2023 shadcn', 'Copyright (c) 2014-present, Facebook, Inc.')
    text += '\n\n## Official OG security backport\n\n' + (root / 'renderer/vendor/og-security/NOTICE.txt').read_text()
    for license_file in ('LICENSE-NEXT-MIT.txt', 'LICENSE-OG-MPL-2.0.txt'):
        text += '\n\n' + (root / 'renderer/vendor/og-security' / license_file).read_text()
    return {'THIRD_PARTY_NOTICES.md': text.encode(), 'docs/final-edition/third-party-dependencies.json': inventory}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, content in outputs().items():
        path = ROOT / name
        if args.check:
            if not path.is_file() or path.read_bytes() != content:
                raise ValueError('Stale local RC license inventory/notice: ' + name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print('PASS: public lock licenses and shipped third-party notices are synchronized')


if __name__ == '__main__':
    main()
