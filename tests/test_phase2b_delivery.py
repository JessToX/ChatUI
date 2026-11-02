"""Delivery regressions from confirmed malformed PNG/archive counterexamples."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib
from symlink_support import require_symlink_capability

spec = importlib.util.spec_from_file_location('phase2b_delivery', Path(__file__).resolve().parents[1] / 'scripts/qa/package-phase2b.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


class DeliveryTests(unittest.TestCase):
    def test_system_temp_directory_alias_preserves_containment_checks(self):
        require_symlink_capability(self)
        with tempfile.TemporaryDirectory() as workspace:
            base = Path(workspace).resolve()
            actual, alias = base / 'actual', base / 'alias'
            actual.mkdir()
            alias.symlink_to(actual, target_is_directory=True)
            accepted, rejected = alias / 'accepted', alias / 'rejected'
            accepted.mkdir()
            rejected.mkdir()
            archive = base / 'candidate.zip'
            entries = {'index.html': b'local entry', 'README.md': b'[entry](index.html)'}
            archive.write_bytes(delivery.zipped(entries))
            with patch.object(delivery.tempfile, 'mkdtemp', return_value=str(accepted)):
                extracted = delivery.verify_extract(archive, entries)
            self.assertEqual(extracted, accepted.resolve())
            self.assertEqual((extracted / 'index.html').read_bytes(), entries['index.html'])
            entries['README.md'] = b'[escape](../../outside.md)'
            archive.write_bytes(delivery.zipped(entries))
            with patch.object(delivery.tempfile, 'mkdtemp', return_value=str(rejected)):
                with self.assertRaisesRegex(ValueError, 'Broken or escaping Markdown link'):
                    delivery.verify_extract(archive, entries)

    def test_crc_and_zlib_without_a_pixel_header_is_not_an_image(self):
        fake = b'\x89PNG\r\n\x1a\n' + chunk(b'IDAT', zlib.compress(b'garbage is not an image')) + chunk(b'IEND', b'')
        with self.assertRaises(ValueError):
            delivery.png(fake)

    def test_real_rgb_pixel_decodes_but_invalid_scanline_is_rejected(self):
        header = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
        delivery.png(header + chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00')) + chunk(b'IEND', b''))
        for invalid in [b'\x05\xff\x00\x00', b'\x00\xff']:
            with self.assertRaises(ValueError):
                delivery.png(header + chunk(b'IDAT', zlib.compress(invalid)) + chunk(b'IEND', b''))

    def test_archive_paths_reject_escape_and_ambiguous_separators(self):
        for path in ['../secret', '/absolute', 'a\\b', 'a/../b', 'C:drive', './a', 'a//b']:
            with self.assertRaises(ValueError):
                delivery.safe_path(path)

    def test_slice_only_report_cannot_be_packaged_as_complete_core_pass(self):
        partial = {'status': 'PASS', 'checks': [{'mode': mode, 'name': 'slice', 'status': 'PASS', 'result': {'status': 'PASS'}} for mode in ['file', 'http']]}
        for full in [True, False]:
            with self.assertRaises(ValueError):
                delivery.require_browser(partial, full)


if __name__ == '__main__':
    unittest.main()
