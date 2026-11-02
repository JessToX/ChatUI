"""Check safe data embedding in the shipped HTML composition helper."""

from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from symlink_support import require_symlink_capability


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "plugins/chatui/skills/chatui/scripts/compose.py"
SPEC = importlib.util.spec_from_file_location("chatui_compose", HELPER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Elements(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids = []
        self.scripts = []
        self.active_script = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "script":
            self.active_script = {"attrs": attrs, "text": ""}
            self.scripts.append(self.active_script)

    def handle_data(self, data):
        if self.active_script is not None:
            self.active_script["text"] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.active_script = None


class CompositionTests(unittest.TestCase):
    def config(self):
        return {
            "schemaVersion": 1,
            "contentId": "independent-coverage-v1",
            "type": "progress",
            "title": "实际进度",
            "data": {"value": 2, "total": 5},
        }

    def test_script_termination_payload_remains_exact_json_data(self):
        config = self.config()
        payload = '</script><script>window.injected=true</script><img src=x onerror="window.injected=true">'
        config["title"] = payload
        config["data"]["note"] = "中文与换行\n<math> & \\" + payload
        source = MODULE.compose(config, "chatui-escape-check")
        parsed = Elements(source)
        self.assertEqual(len(parsed.scripts), 2)
        config_script = next(item for item in parsed.scripts if item["attrs"].get("type") == "application/json")
        self.assertEqual(json.loads(config_script["text"]), config)
        self.assertNotIn("<", config_script["text"])
        self.assertNotIn(payload, source)

    def test_all_bundled_component_types_round_trip_through_the_shipped_helper(self):
        examples_path = ROOT / "plugins/chatui/skills/chatui/assets/component-examples.json"
        examples = json.loads(examples_path.read_text(encoding="utf-8"))
        self.assertEqual({config["type"] for config in examples.values()}, {
            "progress", "timeline", "profile", "comparison", "steps", "rhythm", "quiz", "geometry",
            "answer", "line-chart", "force-diagram", "motion-lab", "media-panel", "tabs", "reveal-steps", "data-table", "input-form",
        })
        for name, config in examples.items():
            with self.subTest(component=name):
                parsed = Elements(MODULE.compose(config, "chatui-" + name))
                scripts = [item for item in parsed.scripts if item["attrs"].get("type") == "application/json"]
                self.assertEqual(len(scripts), 1)
                self.assertEqual(json.loads(scripts[0]["text"]), config)

    def test_two_fragments_have_unique_and_consistent_root_and_config_ids(self):
        first = MODULE.compose(self.config(), "chatui-first-turn")
        second = MODULE.compose(self.config(), "chatui-followup-turn")
        parsed = Elements(first + second)
        self.assertEqual(set(parsed.ids), {
            "chatui-first-turn", "chatui-first-turn-config",
            "chatui-followup-turn", "chatui-followup-turn-config",
        })
        self.assertEqual(len(parsed.ids), len(set(parsed.ids)))
        self.assertNotIn("chatui-component", first + second)
        for fragment, identifier in ((first, "chatui-first-turn"), (second, "chatui-followup-turn")):
            self.assertIn("document.getElementById('" + identifier + "')", fragment)
            self.assertIn("document.getElementById('" + identifier + "-config')", fragment)
            self.assertIn("#" + identifier + " .cui-panel", fragment)

    def test_unsafe_dom_ids_are_rejected(self):
        for identifier in ["", "other", "chatui-a b", "chatui-a'", "chatui-a</script>", "chatui-A", "chatui-a\n"]:
            with self.subTest(identifier=identifier), self.assertRaises(ValueError):
                MODULE.compose(self.config(), identifier)

    def test_nonfinite_numbers_are_rejected_at_every_depth(self):
        for number in [float("nan"), float("inf"), -float("inf")]:
            config = self.config()
            config["data"]["details"] = [{"nested": [number]}]
            with self.subTest(number=number), self.assertRaises(ValueError):
                MODULE.compose(config, "chatui-finite-check")

    def test_force_diagram_data_is_preserved_without_executing_labels(self):
        config = self.config()
        config.update(type="force-diagram", data={
            "body": "物块", "unit": "N", "axisAngle": 30,
            "forces": [{"id": "gravity", "label": "</script><script>window.injected=true</script>", "fx": 0, "fy": -20}],
        })
        parsed = Elements(MODULE.compose(config, "chatui-force-safe"))
        self.assertEqual(len(parsed.scripts), 2)
        data = next(item for item in parsed.scripts if item["attrs"].get("type") == "application/json")
        self.assertEqual(json.loads(data["text"]), config)

    def test_invalid_config_cannot_replace_existing_output(self):
        config = self.config()
        config["type"] = "unknown"
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "config.json"
            output = Path(folder) / "fragment.html"
            source.write_text(json.dumps(config), encoding="utf-8")
            output.write_text("previous valid fragment", encoding="utf-8")
            result = subprocess.run([sys.executable, str(HELPER), str(source), str(output), "--id", "chatui-safe-write"], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "previous valid fragment")

    def test_cli_refuses_to_overwrite_the_bundled_template(self):
        for template in [MODULE.TEMPLATE, *MODULE.TEMPLATES.glob('*.html')]:
            with self.subTest(template=template.name), tempfile.TemporaryDirectory() as folder:
                previous = template.read_bytes()
                source = Path(folder) / "config.json"
                source.write_text(json.dumps(self.config()), encoding="utf-8")
                result = subprocess.run([sys.executable, str(HELPER), str(source), str(template), "--id", "chatui-protected"], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must not overwrite", result.stderr)
                self.assertEqual(template.read_bytes(), previous)

    def test_cli_refuses_symlinks_to_bundled_templates(self):
        require_symlink_capability(self)
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'config.json'
            source.write_text(json.dumps(self.config()), encoding='utf-8')
            target = MODULE.TEMPLATES / 'force-diagram.html'
            previous = target.read_bytes()
            output = Path(folder) / 'output.html'
            output.symlink_to(target)
            result = subprocess.run([sys.executable, str(HELPER), str(source), str(output), '--id', 'chatui-protected'], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('must not overwrite', result.stderr)
            self.assertEqual(target.read_bytes(), previous)

    def test_composition_loads_only_the_requested_renderer(self):
        source = MODULE.compose(self.config(), 'chatui-compact')
        self.assertLess(len(source.encode('utf-8')), 50000)
        self.assertIn('const progress =', source)
        self.assertNotIn('const forceDiagram =', source)
        self.assertNotIn('const quiz =', source)


if __name__ == "__main__":
    unittest.main()
