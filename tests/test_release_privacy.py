"""Release binding regressions use synthetic identifiers; never read private config."""
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from release_inventory import checked_bytes, selected_files
from validate import ValidationError

spec = importlib.util.spec_from_file_location('privacy_delivery', ROOT / 'scripts/qa/package-phase3.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


def synthetic_binding(family='prj'):
    prefix = 'appg' + family if family in ['prj', 'dep', 'ver'] else family
    return prefix + '_' + 'd' * 32


class ReleasePrivacyTests(unittest.TestCase):
    def test_selected_public_documents_have_no_concrete_platform_binding(self):
        pattern = re.compile(r'\bappg(?:prj|dep|ver)_[A-Za-z0-9_-]{16,}', re.I)
        for name, path in selected_files('documents'):
            self.assertFalse(bool(pattern.search(path.read_text())),
                             'Public document contains a concrete platform binding; value withheld')

    def test_selected_content_rejects_all_binding_families_without_echo(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'public.md'
            for family in ['prj', 'dep', 'ver', 'asdk_app', 'connector', 'templated_apps']:
                token = synthetic_binding(family)
                path.write_text('Historical target: ' + token)
                with self.assertRaises(ValidationError) as error:
                    checked_bytes(path, 'docs/public.md')
                self.assertNotIn(token, str(error.exception))

    def test_placeholder_exception_cannot_admit_a_different_connector(self):
        with self.assertRaises(ValidationError):
            delivery.zipped({'manifest.json': ('connector_synthetic_local_placeholder' + '_extra').encode()})

    def test_member_name_is_checked_before_documentation_errors(self):
        token = synthetic_binding()
        name = 'docs/' + token + '.md'
        with self.assertRaises(ValidationError) as error:
            delivery.zipped({name: b'[missing](absent.md)'})
        self.assertNotIn(token, str(error.exception))

    def test_link_target_is_checked_before_documentation_errors(self):
        token = synthetic_binding()
        with self.assertRaises(ValidationError) as error:
            delivery.zipped({'README.md': ('[missing](' + token + '.md)').encode()})
        self.assertNotIn(token, str(error.exception))

    def test_allowlist_metadata_is_scanned_before_selection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / 'allowlist.json'
            manifest.write_text(json.dumps({'schemaVersion': 1, 'documents': [],
                                            'privateProject': synthetic_binding()}))
            with self.assertRaises(ValidationError):
                selected_files('documents', root, manifest)

    def test_zip_writer_rejects_document_and_generated_content(self):
        for name in ['README.md', 'renderer/version.generated.mjs', 'manifest.json']:
            with self.subTest(kind=name), self.assertRaises(ValidationError):
                delivery.zipped({name: synthetic_binding().encode()})

    def test_generated_source_manifest_cannot_introduce_a_binding(self):
        entries = {'README.md': b'Public', 'plugins/chatui/.app.json': delivery.PUBLIC_APP}
        complete = delivery.with_source_identity(entries, {n: 'public' for n in entries},
                                                 {'sourceSha': '0' * 40,
                                                  'project_id': synthetic_binding()})
        with self.assertRaises(ValidationError):
            delivery.zipped(complete)

    def test_existing_archive_is_scanned_without_extracting(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'unsafe.zip'
            with zipfile.ZipFile(archive, 'w') as out:
                item = zipfile.ZipInfo('README.md', (1980, 1, 1, 0, 0, 0))
                item.create_system = 3
                item.external_attr = 0o100644 << 16
                out.writestr(item, synthetic_binding().encode())
            destination = Path(temporary) / 'not-created'
            with self.assertRaises(ValidationError):
                delivery.verify_extract(archive, destination=destination)
            self.assertFalse(destination.exists())

    def test_json_escape_and_markdown_escape_do_not_bypass_scan(self):
        token = synthetic_binding()
        payloads = [json.dumps({'project_id': token}).replace('_', '\\u005f').encode(),
                    ('Target `' + token.replace('_', '\\_') + '`').encode()]
        for payload in payloads:
            with self.assertRaises(ValidationError):
                delivery.zipped({'metadata.json': payload})

    def test_non_utf8_png_does_not_bypass_scan(self):
        with self.assertRaises(ValidationError):
            delivery.zipped({'preview.png': b'\xff' + synthetic_binding().encode()})

    def test_public_placeholder_and_notices_remain_packagable(self):
        entries = {'README.md': b'[notices](THIRD_PARTY_NOTICES.md)',
                   'THIRD_PARTY_NOTICES.md': b'Required attribution',
                   'hosting.example.json': json.dumps({'project_id': 'PUBLIC_PROJECT_ID',
                                                       'deployment_id': 'PUBLIC_DEPLOYMENT_ID'}).encode(),
                   'plugins/chatui/.app.json': delivery.PUBLIC_APP}
        with zipfile.ZipFile(io.BytesIO(delivery.zipped(entries))) as archive:
            self.assertEqual(set(archive.namelist()), set(entries))
            self.assertEqual(archive.read('plugins/chatui/.app.json'), delivery.PUBLIC_APP)


if __name__ == '__main__':
    unittest.main()
