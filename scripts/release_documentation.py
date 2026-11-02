"""Check selected archive documentation references using archive paths only."""
import posixpath
import re
from urllib.parse import unquote, urlsplit

from validate import LINK, REFERENCE_LINK, ValidationError


def validate_documentation_links(entries):
    checked = 0
    for name, content in entries.items():
        if not name.endswith('.md'):
            continue
        text = content.decode('utf-8')
        for match in [*LINK.finditer(text), *REFERENCE_LINK.finditer(text)]:
            target = match.group(1).strip('<>')
            parsed = urlsplit(target)
            if parsed.scheme:
                if parsed.scheme.lower() == 'file' or re.match(r'^[A-Za-z]:[\\/]', target):
                    raise ValidationError(f'Absolute local documentation link in {name}')
                continue
            if parsed.netloc:
                continue
            path = unquote(parsed.path)
            if not path:
                continue
            if path.startswith('/') or '\\' in path:
                raise ValidationError(f'Absolute or nonportable local documentation link in {name}')
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), path))
            if resolved == '..' or resolved.startswith('../'):
                raise ValidationError(f'Escaping archive documentation link in {name}')
            if resolved not in entries:
                raise ValidationError(f'Missing archive documentation target: {name} -> {target}')
            checked += 1
    return checked
