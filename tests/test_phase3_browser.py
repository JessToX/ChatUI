"""Regression coverage for the browser runner's final-ZIP trust boundary."""
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile


MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts/qa/run-phase3-browser.py'
SPEC = importlib.util.spec_from_file_location('phase3_browser', MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GalleryExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name).resolve()
        self.addCleanup(self.temporary.cleanup)
        self.contents = {name: ('public fixture ' + name).encode() for name in MODULE.GALLERY_FILES - {'manifest.json', 'SHA256SUMS'}}
        manifest = {'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(self.contents.items())]}
        self.contents['manifest.json'] = (json.dumps(manifest) + '\n').encode()
        self.contents['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(self.contents.items())).encode()

    def archive(self, contents=None, duplicate=None, symlink=None):
        path = self.directory / 'Gallery.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            for name, content in (contents or self.contents).items():
                if name == symlink:
                    entry = zipfile.ZipInfo(name)
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                    archive.writestr(entry, content)
                else:
                    archive.writestr(name, content)
            if duplicate:
                archive.writestr(duplicate, self.contents[duplicate])
        return path

    def extract(self, archive):
        return MODULE.extract_gallery(archive, self.directory / 'fresh-gallery')

    def test_exact_seven_regular_resources_extract(self):
        output = self.extract(self.archive())
        self.assertEqual({path.name for path in output.iterdir()}, MODULE.GALLERY_FILES)
        for name, content in self.contents.items():
            self.assertEqual((output / name).read_bytes(), content)

    def test_duplicate_rejected_before_any_resource_is_written(self):
        with self.assertWarns(UserWarning):
            archive = self.archive(duplicate='index.html')
        with self.assertRaisesRegex(ValueError, 'exactly once'):
            self.extract(archive)
        self.assertFalse((self.directory / 'fresh-gallery').exists())

    def test_zip_slip_rejected_before_extraction(self):
        contents = dict(self.contents)
        contents['../index.html'] = contents.pop('index.html')
        with self.assertRaises(ValueError):
            self.extract(self.archive(contents))
        self.assertFalse((self.directory / 'index.html').exists())

    def test_symlink_rejected_before_extraction(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            self.extract(self.archive(symlink='index.html'))
        self.assertFalse((self.directory / 'fresh-gallery').exists())

    def test_additional_resource_rejected(self):
        contents = dict(self.contents)
        contents['private.json'] = b'not a Gallery resource'
        with self.assertRaises(ValueError):
            self.extract(self.archive(contents))

    def test_missing_resource_rejected(self):
        contents = dict(self.contents)
        del contents['renderer.html']
        with self.assertRaises(ValueError):
            self.extract(self.archive(contents))

    def test_manifest_content_tamper_rejected(self):
        contents = dict(self.contents)
        contents['index.html'] += b' altered'
        with self.assertRaisesRegex(ValueError, 'manifest byte/hash'):
            self.extract(self.archive(contents))

    def test_checksum_content_tamper_rejected(self):
        contents = dict(self.contents)
        contents['SHA256SUMS'] = contents['SHA256SUMS'].replace(b'0', b'1', 1)
        with self.assertRaisesRegex(ValueError, 'checksum verification'):
            self.extract(self.archive(contents))

    def test_missing_checksum_record_rejected(self):
        contents = dict(self.contents)
        contents['SHA256SUMS'] = b'\n'.join(contents['SHA256SUMS'].splitlines()[1:]) + b'\n'
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            self.extract(self.archive(contents))

    def test_checksum_path_escape_rejected(self):
        contents = dict(self.contents)
        contents['SHA256SUMS'] = contents['SHA256SUMS'].replace(b'  index.html', b'  ../index.html')
        with self.assertRaisesRegex(ValueError, 'Malformed/unsafe'):
            self.extract(self.archive(contents))


if __name__ == '__main__':
    unittest.main()
