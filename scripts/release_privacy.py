"""Bounded release-only privacy checks; errors never include matched bytes.

Inspect raw text and one JSON document's keys/string values. Each text gets one
HTML entity, Markdown underscore and URL-percent normalization pass. This is a
scanner, not a content transformer or recursive interpreter of serialized text.
"""
import html
import json
import re
from urllib.parse import unquote

from validate import SECRET_PATTERNS, ValidationError

BINDING = re.compile(r'\b(?:appg(?:prj|dep|ver)|asdk_app|connector|templated_apps)_[A-Za-z0-9_-]{16,}', re.I)
PUBLIC_BINDINGS = frozenset({'connector_synthetic_local_placeholder'})
MAX_CONTENT_BYTES = 32 * 1024 * 1024
MAX_JSON_DEPTH = 64
MAX_JSON_NODES = 200000


def _bounded_json(text, required):
    # Only complete JSON documents are parsed. Arbitrary JS, Markdown code
    # snippets and JSON serialized inside a string are not evaluated again.
    if not required and not text.lstrip().startswith(('{', '[', '"')):
        return None
    depth = 0
    quoted = escaped = False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in '{[':
            depth += 1
            if depth > MAX_JSON_DEPTH:
                raise ValidationError('Privacy scan JSON depth limit exceeded; content not displayed')
        elif char in '}]':
            depth -= 1
    try:
        # Preserve duplicate object keys and values, including overwritten
        # values. Numbers are irrelevant to string scanning; do not convert
        # attacker-sized integer literals into Python integers.
        return json.loads(text, object_pairs_hook=lambda pairs: pairs,
                          parse_int=lambda value: None, parse_float=lambda value: None,
                          parse_constant=lambda value: None)
    except (ValueError, RecursionError):
        if required:
            raise ValidationError('Invalid JSON in public content; bytes not displayed') from None
        return None


def _json_strings(value):
    stack = [value]
    visited = 0
    while stack:
        item = stack.pop()
        visited += 1
        if visited > MAX_JSON_NODES:
            raise ValidationError('Privacy scan JSON node limit exceeded; content not displayed')
        if isinstance(item, str):
            yield item
        elif isinstance(item, (list, tuple)):
            stack.extend(item)


def privacy_texts(content, *, json_document=False):
    """Yield bounded raw/decoded representations without changing input bytes."""
    if len(content) > MAX_CONTENT_BYTES:
        raise ValidationError('Privacy scan size limit exceeded; content not displayed')
    # Keep ASCII markers visible in binary carriers. Separate package gates
    # still enforce allowed file types; this is not binary metadata extraction.
    try:
        text = content.decode('utf-8', errors='strict' if json_document else 'replace')
    except UnicodeDecodeError:
        raise ValidationError('Invalid UTF-8 JSON in public content; bytes not displayed') from None
    yield text
    normalized = unquote(html.unescape(text).replace(r'\_', '_'), errors='replace')
    if normalized != text:
        yield normalized
    value = _bounded_json(text, json_document)
    for item in _json_strings(value):
        yield item
        normalized = unquote(html.unescape(item).replace(r'\_', '_'), errors='replace')
        if normalized != item:
            yield normalized


def validate_public_content(content, *, json_document=False, bindings=True):
    for text in privacy_texts(content, json_document=json_document):
        if bindings and any(match.group() not in PUBLIC_BINDINGS for match in BINDING.finditer(text)):
            raise ValidationError('Private deployment binding identifier in public release; bytes not displayed')
        for kind, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                raise ValidationError('Private content category ' + kind + '; bytes not displayed')


def validate_public_bindings(content):
    """Compatibility entry point: the release gate now checks all categories."""
    validate_public_content(content)
