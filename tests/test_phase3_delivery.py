"""RC Source/Gallery integrity, privacy and deterministic archive regressions."""
import importlib.util
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('phase3_delivery', ROOT / 'scripts/qa/package-phase3.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
license_spec = importlib.util.spec_from_file_location('phase3_licenses', ROOT / 'scripts/qa/audit-phase3-licenses.py')
licenses = importlib.util.module_from_spec(license_spec)
license_spec.loader.exec_module(licenses)
review_spec = importlib.util.spec_from_file_location('phase3_review', ROOT / 'scripts/qa/package-phase3-review.py')
review = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(review)


class Phase3DeliveryTests(unittest.TestCase):
    def archive(self, directory, entries):
        path = directory / 'candidate.zip'
        path.write_bytes(delivery.zipped(entries))
        return path

    def test_same_inventory_repeats_bytes_and_preserves_shell_permissions(self):
        entries = {'README.md': b'[script](scripts/check.sh)', 'scripts/check.sh': b'#!/bin/sh\nexit 0\n'}
        first = delivery.zipped(entries)
        self.assertEqual(first, delivery.zipped(dict(reversed(list(entries.items())))))
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            self.assertEqual(archive.getinfo('scripts/check.sh').external_attr >> 16, 0o100755)
            self.assertTrue(all(row.date_time == (1980, 1, 1, 0, 0, 0) for row in archive.infolist()))

    def test_unsafe_names_rejected_before_writing(self):
        for name in ['../escape', '/absolute', 'a\\b', 'a/../b', 'C:drive', './a', 'a//b', '.', '',
                     '.git/config', 'renderer/.env.local', 'renderer/.openai/hosting.json', 'private.key']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                delivery.zipped({name: b'never written'})

    def test_duplicate_symlink_zip_slip_and_timestamp_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            for filename, mode, timestamp, duplicate in [
                    ('../escape', stat.S_IFREG | 0o644, (1980, 1, 1, 0, 0, 0), False),
                    ('link', stat.S_IFLNK | 0o777, (1980, 1, 1, 0, 0, 0), False),
                    ('safe.txt', stat.S_IFREG | 0o644, (2000, 1, 1, 0, 0, 0), False),
                    ('safe.txt', stat.S_IFREG | 0o644, (1980, 1, 1, 0, 0, 0), True)]:
                archive = base / 'malformed.zip'
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    with zipfile.ZipFile(archive, 'w') as output:
                        item = zipfile.ZipInfo(filename, timestamp)
                        item.create_system = 3
                        item.external_attr = mode << 16
                        output.writestr(item, b'fixture')
                        if duplicate:
                            output.writestr(item, b'duplicate')
                destination = base / 'untouched'
                with self.assertRaises(ValueError):
                    delivery.verify_extract(archive, destination=destination)
                self.assertFalse(destination.exists())

    def test_fresh_extraction_checks_bytes_and_refuses_existing_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            entries = {'README.md': b'[entry](index.html)', 'index.html': b'local'}
            archive = self.archive(base, entries)
            destination = base / 'fresh'
            extracted = delivery.verify_extract(archive, entries, destination)
            self.assertEqual((extracted / 'index.html').read_bytes(), b'local')
            with self.assertRaises(ValueError):
                delivery.verify_extract(archive, entries, destination)
            with self.assertRaises(ValueError):
                delivery.read_archive(archive, {'README.md': entries['README.md']})

    def test_checksums_require_every_file_and_identity_cannot_lie(self):
        entries = {'a.txt': b'public', 'b.txt': b'second', 'SHA256SUMS': f'{delivery.sha(b"public")}  a.txt\n'.encode()}
        with self.assertRaises(ValueError):
            delivery.verify_sums(entries)
        selected = {'a.txt': b'public', 'plugins/chatui/.app.json': delivery.PUBLIC_APP}
        origins = {name: 'public fixture' for name in selected}
        complete = delivery.with_source_identity(selected, origins, {'sourceSha': '0' * 40})
        record = json.loads(complete[delivery.SOURCE_MANIFEST])
        record['files'][0]['sha256'] = '0' * 64
        complete[delivery.SOURCE_MANIFEST] = delivery.canonical_json(record)
        complete['SHA256SUMS'] = ('\n'.join(f'{delivery.sha(content)}  {name}' for name, content in sorted(complete.items()) if name != 'SHA256SUMS') + '\n').encode()
        with tempfile.TemporaryDirectory() as temporary:
            archive = self.archive(Path(temporary), complete)
            with self.assertRaisesRegex(ValueError, 'identity manifest bytes'):
                delivery.read_archive(archive)

    def test_documentation_links_close_inside_archive(self):
        for target in ['../escape.md', 'missing.md', '/absolute.md', 'file:///tmp/absolute.md', '..%2fescape.md']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                delivery.zipped({'README.md': f'[bad]({target})'.encode()})

    def test_existing_delivery_names_get_suffix_without_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            first = base / 'ChatUI-Final-RC-Source.zip'
            first.write_bytes(b'existing delivery')
            second = delivery.available(base, 'ChatUI-Final-RC-Source')
            self.assertEqual(second.name, 'ChatUI-Final-RC-Source-v2.zip')
            self.assertEqual(first.read_bytes(), b'existing delivery')

    def test_source_preserves_root_build_entries_without_reading_original_binding(self):
        binding = ROOT / 'plugins/chatui/.app.json'
        original = Path.read_bytes
        def guarded(path):
            if path == binding or '.openai' in path.parts or path.name.startswith('.env'):
                self.fail('Excluded private bytes must never be read')
            return original(path)
        with patch.object(Path, 'read_bytes', guarded):
            entries, origins = delivery.source_entries()
        self.assertEqual(entries['plugins/chatui/.app.json'], delivery.PUBLIC_APP)
        self.assertIn('original binding not read', origins['plugins/chatui/.app.json'])
        for name in ['package-lock.json', 'scripts/build_component_templates.py', 'tests/test_components.mjs',
                     'tests/test_math_physics_golden.mjs', 'scripts/qa/verify-phase3-engineering.py']:
            self.assertIn(name, entries)
        self.assertFalse(any('.openai' in Path(name).parts or Path(name).name.startswith('.env') for name in entries))

    def test_license_notice_matches_all_public_lock_versions(self):
        generated = licenses.outputs()
        for name, content in generated.items():
            self.assertEqual((ROOT / name).read_bytes(), content, 'License inventory must be regenerated after lock changes')
        record = licenses.audit()
        self.assertTrue(all(row['license'] and row['version'] for lock in record['locks'] for row in lock['packages']))
        notice = generated['THIRD_PARTY_NOTICES.md'].decode()
        license_text = (ROOT / 'LICENSE').read_text()
        self.assertIn('MIT License', license_text)
        self.assertIn('Copyright (c) 2026 Jess(T o X)', license_text)
        self.assertIn('Original ChatUI contributions are licensed under MIT', notice)
        self.assertIn('Copyright (c) 2026 Jess(T o X)', notice)
        self.assertIn('Third-party code and assets retain their original licenses', notice)
        self.assertNotIn('许可选择待用户决定', notice)
        self.assertNotIn('project-level licensing remains pending', notice)

    def test_review_gate_rejects_partial_browser_and_different_engineering_archives(self):
        partial = {'status': 'PASS', 'checks': [{'mode': mode, 'name': 'slice', 'status': 'PASS',
                                               'result': {'status': 'PASS'}} for mode in ('file', 'http')]}
        with self.assertRaises(ValueError):
            review.require_browser(partial, '0' * 40, {})
        names = ['root-install', 'component-generation', 'third-party-notices', 'metadata', 'validate',
                 'components', 'canonical-components', 'golden-compact', 'golden-canonical', 'golden-vendor',
                 'python', 'standalone-readme-quickstart', 'generation-source', 'generation', 'golden-renderer', 'cold-warm']
        report = {'status': 'PHASE 3 ENGINEERING PASS', 'phase': 'final', 'sourceSha': '0' * 40,
                  'finalCommitSHA': '0' * 40, 'captureWorktreeDirty': False,
                  'checks': [{'name': name, 'status': 'PASS', 'exitCode': 0} for name in names],
                  'rcCompilations': {'compilations': 330, 'failures': 0}, 'canonicalVendorIdentical': True,
                  'freshGalleryZipIdentical': True, 'artifacts': {'source': {'sha256': 'old'}, 'gallery': {'sha256': 'old'}}}
        with self.assertRaisesRegex(ValueError, 'different final RC archive'):
            review.require_engineering(report, '0' * 40, {'source': {'sha256': 'new'}, 'gallery': {'sha256': 'new'}})
        report['checks'] = [row for row in report['checks'] if row['name'] != 'golden-vendor']
        with self.assertRaisesRegex(ValueError, 'incomplete or failed'):
            review.require_engineering(report, '0' * 40, {'source': {'sha256': 'old'}, 'gallery': {'sha256': 'old'}})

    def test_review_browser_requires_actual_records_clean_capture_and_tested_zip(self):
        head = '0' * 40
        checks = []
        for mode in ('file', 'http'):
            for name in ('slice', 'layout', 'interaction', 'security', 'accessibility', 'performance'):
                result = {'status': 'PASS'}
                if name == 'layout':
                    result['layouts'] = [{'scene': f'G{i:02}', 'theme': theme, 'width': width, 'status': 'PASS'}
                                         for i in range(1, 9) for theme in ('light', 'dark') for width in (320, 390, 768, 1024)]
                if name in ('interaction', 'security', 'accessibility'):
                    result['checks'] = [{'status': 'PASS'} for _ in range(27 if name == 'accessibility' else 8)]
                if name == 'performance':
                    result['samples'] = [{} for _ in range(8)]
                checks.append({'mode': mode, 'name': name, 'status': 'PASS', 'result': result,
                               'resourceIdentity': {'byteEquality': True}})
        report = {'status': 'PASS', 'checks': checks, 'finalCommitSHA': head, 'captureGitHead': head,
                  'captureWorktreeDirty': [], 'finalResourceVerification': 'PASS: verified final bytes',
                  'coverage': {'layoutCount': 128, 'specializedCount': 32, 'accessibilityCount': 54,
                               'mountSamples': 16, 'requiredModesAndChecksComplete': True},
                  'source': {'kind': 'fresh Gallery ZIP extraction', 'archiveSHA256': 'exact'},
                  'galleryResourceSHA256': {'index.html': 'bytehash'}}
        packages = {'gallery': {'sha256': 'exact', 'inventory': [{'path': 'index.html', 'sha256': 'bytehash'}]}}
        review.require_browser(report, head, packages)
        report['captureWorktreeDirty'] = ['M candidate']
        with self.assertRaisesRegex(ValueError, 'clean final commit'):
            review.require_browser(report, head, packages)
        report['captureWorktreeDirty'] = []
        report['source']['archiveSHA256'] = 'other'
        with self.assertRaisesRegex(ValueError, 'exact final Gallery ZIP'):
            review.require_browser(report, head, packages)
        report['source']['archiveSHA256'] = 'exact'
        report['checks'][-2]['result']['checks'].pop()
        with self.assertRaisesRegex(ValueError, 'complete actual passing records'):
            review.require_browser(report, head, packages)


if __name__ == '__main__':
    unittest.main()
