"""Explicit source selection. Excluded local/private files are never opened."""
import json
from pathlib import Path

from validate import PROJECT_ROOT, ValidationError
from release_privacy import validate_public_content

MANIFEST = PROJECT_ROOT / 'scripts' / 'release-allowlist.json'
BLOCKED_PARTS = {'.git', '.openai', '.wrangler', '.sites-runtime', '.local', 'node_modules',
                 'experiments', 'test-plugin', 'dist', 'outputs', 'output', '__pycache__'}
BLOCKED_NAMES = {'credentials.json', 'cookies.json', 'conversations.json', 'chat.html', 'hosting.json'}


def selected_files(scope, root=PROJECT_ROOT, manifest=MANIFEST):
    data = json.loads(checked_bytes(manifest, 'release allowlist'))
    prefixes = {'plugin': 'plugins/chatui/', 'renderer': 'renderer/', 'documents': 'docs/', 'source': ''}
    if data.get('schemaVersion') != 1 or scope not in prefixes:
        raise ValidationError('Invalid source allowlist scope/schema')
    names = data[scope]
    if not isinstance(names, list) or names != sorted(set(names)):
        raise ValidationError('Allowlist must contain sorted unique paths')
    prefix = prefixes[scope]
    result = []
    for name in names:
        if not isinstance(name, str):
            raise ValidationError('Allowlist path must be a string')
        relative = Path(name)
        if (relative.is_absolute() or '..' in relative.parts or relative.as_posix() != name
                or not name.startswith(prefix) or set(relative.parts) & BLOCKED_PARTS
                or relative.name in BLOCKED_NAMES or relative.name.startswith('.env') or ':' in name or '\\' in name
                or relative.suffix.lower() in {'.pem', '.key', '.p12', '.pyc', '.tsbuildinfo'}):
            raise ValidationError('Forbidden path in source allowlist')
        path = root / relative
        resolved = path.resolve()
        if (path.is_symlink() or not path.is_file() or not resolved.is_relative_to(root.resolve())
                or resolved != root.resolve() / relative):
            raise ValidationError(f'Unsafe or missing allowlisted source: {name}')
        result.append((name, path))
    return result


def checked_bytes(path, name):
    content = path.read_bytes()
    validate_public_content(content, json_document=Path(name).suffix.lower() == '.json')
    return content
