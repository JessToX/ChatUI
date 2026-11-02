"""Check deterministic source-derived templates and fail-closed build guards."""

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_component_templates import (
    DEFAULT_SKILL, MAX_TEMPLATE_BYTES, RENDERERS, TemplateBuildError,
    build_templates, check_templates,
)
from validate import ValidationError, validate


class ComponentTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (DEFAULT_SKILL / 'assets/component-kit.html').read_text(encoding='utf-8')
        cls.examples = json.loads((DEFAULT_SKILL / 'assets/component-examples.json').read_text(encoding='utf-8'))

    def test_all_seventeen_templates_match_source_and_stay_under_read_limit(self):
        sizes = check_templates(DEFAULT_SKILL)
        self.assertEqual(set(sizes), {name + '.html' for name in RENDERERS})
        self.assertTrue(all(size < MAX_TEMPLATE_BYTES for size in sizes.values()))
        self.assertLess(sizes['force-diagram.html'], 40000)
        self.assertEqual(build_templates(self.source, self.examples), build_templates(self.source, self.examples))

    def test_steps_includes_its_actual_timeline_dependency_and_no_unrelated_renderer(self):
        source = build_templates(self.source, self.examples)['steps.html']
        self.assertIn('const timeline =', source)
        self.assertIn("'steps': data => timeline(data, true)", source)
        self.assertNotIn('const quiz =', source)

    def test_missing_duplicate_and_malformed_regions_fail_instead_of_dropping_code(self):
        region = '  // chatui:renderer progress begin\n'
        variants = [self.source.replace(region, '', 1),
                    self.source.replace(region, region + region, 1),
                    self.source.replace('// chatui:renderer progress end', '// chatui:renderer wrong end', 1),
                    self.source.replace('  const progress = data => {', '  const progressChanged = data => {', 1),
                    self.source.replace('  // chatui:renderer timeline begin', '  const outside = () => {};\n  // chatui:renderer timeline begin', 1)]
        for source in variants:
            with self.subTest(source=source[:30]), self.assertRaises(TemplateBuildError):
                build_templates(source, self.examples)

    def test_registry_changes_and_oversized_shared_resources_fail_explicitly(self):
        for source in [self.source.replace("'tabs': tabs", "'new-tabs': tabs", 1),
                       self.source.replace('<style>', '<style>\n/*' + 'x' * MAX_TEMPLATE_BYTES + '*/', 1)]:
            with self.assertRaises(TemplateBuildError):
                build_templates(source, self.examples)

    def test_new_cross_renderer_reference_brings_its_dependency(self):
        changed = self.source.replace('  const answer = data => {', '  const answer = data => {\n    if (data.asProgress) return progress(data);')
        source = build_templates(changed, self.examples)['answer.html']
        self.assertIn('const progress =', source)
        self.assertNotIn('const quiz =', source)

    def test_only_referenced_math_helpers_are_included_without_weakening_policy(self):
        templates = build_templates(self.source, self.examples)
        for kind in ('answer', 'comparison', 'timeline', 'steps', 'reveal-steps'):
            self.assertIn('function validateMathAttributes', templates[kind + '.html'])
            self.assertIn('const MATH_ATTRIBUTES =', templates[kind + '.html'])
        self.assertNotIn('const safeMath =', templates['force-diagram.html'])
        changed = self.source.replace('  const forceDiagram = data => {',
                                     '  const forceDiagram = data => {\n    if (data.math) formula(data.math);')
        self.assertIn('function validateMathAttributes', build_templates(changed, self.examples)['force-diagram.html'])

    def test_optional_helper_boundaries_and_declarations_fail_closed(self):
        marker = '  // chatui:helper math begin\n'
        variants = [self.source.replace(marker, '', 1),
                    self.source.replace(marker, marker + marker, 1),
                    self.source.replace('// chatui:helper math end', '// chatui:helper unknown end', 1),
                    self.source.replace('  const safeMath =', '  const newMath =', 1)]
        for source in variants:
            with self.assertRaises(TemplateBuildError):
                build_templates(source, self.examples)

    def test_packaging_rejects_stale_or_missing_generated_files(self):
        with tempfile.TemporaryDirectory() as folder:
            plugin = Path(folder) / 'chatui'
            shutil.copytree(DEFAULT_SKILL.parent.parent, plugin,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            skill = plugin / 'skills/chatui'
            target = skill / 'assets/components/force-diagram.html'
            original = target.read_bytes()
            target.write_bytes(original + b'\n<!-- stale -->')
            with self.assertRaisesRegex(ValidationError, 'stale or modified'):
                validate(plugin)
            target.unlink()
            with self.assertRaisesRegex(ValidationError, 'missing'):
                validate(plugin)
            target.write_bytes(original)
            validate(plugin)


if __name__ == '__main__':
    unittest.main()
