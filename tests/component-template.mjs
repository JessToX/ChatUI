import { readFileSync } from 'node:fs';

// Exercise the actual compact files by default. Set CHATUI_TEST_TEMPLATE_PATH
// to the canonical kit to run the same behavior suite against the source.
export function componentTemplate(type) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(type)) throw new Error('Invalid component type');
  return readFileSync(process.env.CHATUI_TEST_TEMPLATE_PATH ||
    new URL(`../plugins/chatui/skills/chatui/assets/components/${type}.html`, import.meta.url), 'utf8');
}
