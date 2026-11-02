#!/usr/bin/env python3
"""Fill the bundled component fragment with JSON; never execute its data."""

import argparse
import json
import re
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / 'assets' / 'component-kit.html'
TEMPLATES = TEMPLATE.parent / 'components'
TYPES = {'progress', 'timeline', 'profile', 'comparison', 'steps', 'rhythm', 'quiz', 'geometry', 'answer', 'line-chart', 'force-diagram', 'motion-lab', 'media-panel', 'tabs', 'reveal-steps', 'data-table', 'input-form'}


def compose(config, component_id):
    if not re.fullmatch(r'chatui-[a-z0-9]+(?:-[a-z0-9]+)*', component_id):
        raise ValueError('Use a unique lowercase chatui-... component ID.')
    if not isinstance(config, dict) or config.get('schemaVersion') != 1 or config.get('type') not in TYPES:
        raise ValueError('Expected schemaVersion 1 and a supported component type.')
    if not isinstance(config.get('contentId'), str) or not config['contentId'].strip():
        raise ValueError('A contentId is required for state identity.')
    if not isinstance(config.get('data'), dict):
        raise ValueError('data must be an object.')
    # Escaping < prevents data from ending its application/json script element.
    payload = json.dumps(config, ensure_ascii=False, allow_nan=False, indent=2).replace('<', '\\u003c')
    source = (TEMPLATES / (config['type'] + '.html')).read_text(encoding='utf-8').replace('chatui-component', component_id)
    pattern = re.compile(r'(<script type="application/json" id="' + re.escape(component_id) + r'-config">)\s*[\s\S]*?(</script>)')
    result, count = pattern.subn(lambda match: match[1] + '\n' + payload + '\n' + match[2], source)
    if count != 1:
        raise ValueError('Expected exactly one configuration slot in template.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--id', required=True, dest='component_id')
    args = parser.parse_args()
    result = compose(json.loads(args.config.read_text(encoding='utf-8')), args.component_id)
    output = args.output.resolve()
    if output == TEMPLATE.resolve() or output.is_relative_to(TEMPLATES.resolve()):
        parser.error('Output must not overwrite a bundled template or its directory.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(result, encoding='utf-8')
    print(args.output)


if __name__ == '__main__':
    main()
