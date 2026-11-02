"""Public release boundaries, using constructed synthetic values only."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import release_privacy as privacy
from release_inventory import checked_bytes
from validate import ValidationError

spec = importlib.util.spec_from_file_location('decoded_delivery', ROOT / 'scripts/qa/package-phase3.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


def synthetic_values():
    identifier = '12345678-1234-4234-8234-123456789012'
    return [
        '/' + 'Users/' + 'SYNTHETIC_USER/project/',
        'https://' + 'chatgpt.com/c/' + identifier,
        'https://' + 'chatgpt.com/g/g-public-example/c/' + identifier,
        'ghp_' + 'a' * 36,
        'sk-' + 'a' * 36,
        '-----BEGIN ' + 'PRIVATE KEY----- synthetic data',
        'appgprj_' + 'a' * 32,
    ]


def escaped(value):
    return ''.join('\\u%04x' % ord(char) for char in value)


class PrivacyDecodingTests(unittest.TestCase):
    def assert_rejected(self, data, **kwargs):
        with self.assertRaises(ValidationError) as result:
            privacy.validate_public_content(data, **kwargs)
        for value in synthetic_values():
            self.assertNotIn(value, str(result.exception))

    def test_every_category_in_json_values_and_keys(self):
        for value in synthetic_values():
            for document in ['{"value":"' + escaped(value) + '"}',
                             '{"' + escaped(value) + '":"public"}',
                             '[{"nested":["' + escaped(value) + '"]}]']:
                with self.subTest(category=synthetic_values().index(value)):
                    self.assert_rejected(document.encode(), json_document=True)

    def test_plain_and_escaped_input_rejected_at_file_and_zip_boundaries(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'fixture.json'
            for value in synthetic_values()[:3]:
                for body in [json.dumps({'value': value}), '{"value":"' + escaped(value) + '"}']:
                    path.write_text(body)
                    with self.assertRaises(ValidationError):
                        checked_bytes(path, 'fixture.json')
                    with self.assertRaises(ValidationError):
                        delivery.zipped({'fixture.json': body.encode()})

    def test_duplicate_json_keys_do_not_hide_earlier_value(self):
        value = synthetic_values()[0]
        self.assert_rejected(('{"a":"' + escaped(value) + '","a":"public"}').encode())

    def test_html_percent_and_json_slash_encodings(self):
        for value in synthetic_values()[:3]:
            variants = [value.replace('/', r'\/'), quote(value, safe=''),
                        ''.join('&#%d;' % ord(char) for char in value)]
            for variant in variants:
                # Slash escaping is a JSON syntax boundary; the other two
                # encodings are normalized once after parsing the document.
                body = '{"value":"' + variant + '"}'
                self.assert_rejected(body.encode(), json_document=True)

    def test_percent_encoded_json_value_after_unicode_decode(self):
        value = quote(synthetic_values()[1], safe='')
        self.assert_rejected(('{"value":"' + escaped(value) + '"}').encode())

    def test_existing_archive_is_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'fixture.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                item = zipfile.ZipInfo('fixture.json', (1980, 1, 1, 0, 0, 0))
                item.create_system = 3
                item.external_attr = 0o100644 << 16
                output.writestr(item, '{"value":"' + escaped(synthetic_values()[0]) + '"}')
            target = Path(temporary) / 'not-created'
            with self.assertRaises(ValidationError):
                delivery.verify_extract(archive, destination=target)
            self.assertFalse(target.exists())

    def test_public_unicode_notices_links_and_placeholder_preserved(self):
        data = json.dumps({'label': '正常 Unicode café 🌹',
                           'notice': 'Copyright Third Party Authors <author@example.invalid> MIT',
                           'link': 'https://chatgpt.com/features',
                           'example': 'https://example.invalid/private-conversation-01',
                           'uri': 'ui://chatui/document-v4.html',
                           'version': '1.6.1-iteration.1',
                           'binding': 'connector_synthetic_local_placeholder'}).encode()
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'public.json'
            path.write_bytes(data)
            self.assertEqual(checked_bytes(path, 'public.json'), data)
        with zipfile.ZipFile(io.BytesIO(delivery.zipped({'public.json': data}))) as archive:
            self.assertEqual(archive.read('public.json'), data)

    def test_lone_surrogate_and_huge_number_do_not_raise_decoder_errors(self):
        for data in [b'{"label":"\\ud800"}', ('{"number":' + '1' * 5000 + '}').encode()]:
            privacy.validate_public_content(data, json_document=True)

    def test_malformed_declared_json_fails_without_echo(self):
        self.assert_rejected(b'{"private-looking-field":', json_document=True)
        # Plain prose containing a brace is not a declared JSON document.
        privacy.validate_public_content(b'Example syntax: { unfinished')

    def test_json_depth_budget_fails_closed(self):
        data = ('[' * (privacy.MAX_JSON_DEPTH + 1) + '0' + ']' * (privacy.MAX_JSON_DEPTH + 1)).encode()
        self.assert_rejected(data, json_document=True)

    def test_json_node_and_content_budgets_fail_closed(self):
        with patch.object(privacy, 'MAX_JSON_NODES', 8):
            self.assert_rejected(json.dumps(['public'] * 20).encode(), json_document=True)
        with patch.object(privacy, 'MAX_CONTENT_BYTES', 8):
            self.assert_rejected(b'public text over limit')

    def test_quoted_brackets_do_not_consume_depth_budget(self):
        privacy.validate_public_content(json.dumps({'label': '[' * 1000}).encode(), json_document=True)

    def test_normalization_is_bounded_and_does_not_mutate_input(self):
        data = json.dumps({'literal': '&amp;lt; %2520 \\u4e2d'}).encode()
        values = list(privacy.privacy_texts(data, json_document=True))
        self.assertIn('&lt; %20 \\u4e2d', values)
        self.assertNotIn('<   中', values)
        self.assertEqual(json.loads(data)['literal'], '&amp;lt; %2520 \\u4e2d')

    def test_generic_plugin_binding_mode_still_checks_private_strings(self):
        binding = synthetic_values()[-1].encode()
        privacy.validate_public_content(binding, bindings=False)
        self.assert_rejected(json.dumps(synthetic_values()[0]).encode(), bindings=False)

    def test_declared_json_rejects_invalid_utf8(self):
        self.assert_rejected(b'{"label":"\xff"}', json_document=True)

    def test_invalid_utf8_cannot_hide_ascii_secret_marker(self):
        self.assert_rejected(b'\xff' + synthetic_values()[3].encode())


if __name__ == '__main__':
    unittest.main()
