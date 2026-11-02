"""Physical invariants and real output checks for the static force adapter."""

import importlib.util
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "plugins/chatui/skills/chatui/scripts/render_force.py"
SPEC = importlib.util.spec_from_file_location("chatui_force_plot", HELPER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
EXAMPLES = ROOT / "plugins/chatui/skills/chatui/assets/component-examples.json"


class ForceFixtures:
    def config(self):
        return json.loads(EXAMPLES.read_text(encoding="utf-8"))["force-diagram"]

    def direction_config(self):
        config = self.config()
        config["data"].pop("unit")
        config["data"].update(mode="direction", forces=[
            dict(id="normal", label="支持力", angle=90),
            dict(id="weight", label="重力", angle=-90),
            dict(id="friction", label="摩擦力", angle=180),
        ])
        return config

    def slope_config(self):
        config = self.config()
        config["data"].update(axisAngle=30, body="光滑斜面上的物块", forces=[
            dict(id="weight", label="重力", fx=0, fy=-20, tone="orange"),
            dict(id="normal", label="支持力", fx=-5 * math.sqrt(3), fy=15, tone="blue"),
        ])
        return config


class ForceAnalysisTests(ForceFixtures, unittest.TestCase):
    def test_four_real_forces_sum_to_four_newtons_right(self):
        result = MODULE.analyze(self.config())
        self.assertEqual(result["resultant"], dict(fx=4, fy=0, magnitude=4))
        self.assertFalse(result["showResultant"])
        self.assertEqual(result["components"], [])

    def test_balanced_input_has_literal_zero_resultant(self):
        config = self.config()
        config["data"]["forces"][0]["fx"] = 2
        result = MODULE.analyze(config, resultant=True)
        self.assertEqual(result["resultant"], dict(fx=0, fy=0, magnitude=0))

    def test_small_real_force_survives_large_cancelling_pair(self):
        config = self.config()
        config["data"]["forces"] = [dict(id=str(i), label="力", fx=value, fy=0) for i, value in enumerate((1e12, 1e-8, -1e12))]
        self.assertEqual(MODULE.analyze(config)["resultant"]["fx"], 1e-8)

    def test_slope_projections_are_not_counted_twice(self):
        config = self.slope_config()
        result = MODULE.analyze(config, resultant=True, components="weight")
        self.assertEqual(len(result["forces"]), 2)
        self.assertAlmostEqual(result["resultant"]["fx"], -5 * math.sqrt(3))
        self.assertAlmostEqual(result["resultant"]["fy"], -5)
        self.assertAlmostEqual(result["resultant"]["magnitude"], 10)
        projections = result["components"]
        self.assertAlmostEqual(projections[0]["value"], -10)
        self.assertAlmostEqual(projections[1]["value"], -10 * math.sqrt(3))
        self.assertAlmostEqual(sum(item["fx"] for item in projections), 0)
        self.assertAlmostEqual(sum(item["fy"] for item in projections), -20)
        self.assertEqual(config, self.slope_config(), "analysis must not mutate the caller's force list")

    def test_forty_five_degree_slope_changes_real_support_force(self):
        config = self.slope_config()
        config["data"]["axisAngle"] = 45
        config["data"]["forces"][1].update(fx=-10, fy=10)
        result = MODULE.analyze(config, components="weight")
        self.assertEqual(result["resultant"]["fx"], -10)
        self.assertEqual(result["resultant"]["fy"], -10)
        self.assertAlmostEqual(result["components"][0]["value"], -math.sqrt(200))

    def test_direction_mode_has_equal_vectors_and_no_inferred_result(self):
        result = MODULE.analyze(self.direction_config())
        self.assertIsNone(result["resultant"])
        self.assertTrue(all(item["magnitude"] == 1 for item in result["forces"]))
        self.assertEqual([(item["fx"], item["fy"]) for item in result["forces"]], [(0, 1), (0, -1), (-1, 0)])

    def test_unknown_magnitudes_cannot_be_summed_or_decomposed(self):
        for options in ({"resultant": True}, {"components": "weight"}):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, "Unknown force"):
                MODULE.analyze(self.direction_config(), **options)

    def test_unknown_and_nonfinite_numeric_values_are_rejected(self):
        for value in (None, "mg", "unknown", True, float("nan"), float("inf"), 1e13):
            config = self.config()
            config["data"]["forces"][0]["fx"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                MODULE.analyze(config)

    def test_direction_mode_rejects_numeric_fields_and_units(self):
        for field, value in (("fx", 2), ("fy", 0)):
            config = self.direction_config()
            config["data"]["forces"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                MODULE.analyze(config)
        config = self.direction_config()
        config["data"]["unit"] = "N"
        with self.assertRaises(ValueError):
            MODULE.analyze(config)

    def test_zero_force_is_kept_as_zero_in_table_data(self):
        config = self.config()
        config["data"]["forces"][0].update(fx=0, fy=0)
        self.assertEqual(MODULE.analyze(config)["forces"][0]["magnitude"], 0)

    def test_duplicate_ids_extra_fields_and_invalid_counts_are_rejected(self):
        configs = []
        duplicate = self.config()
        duplicate["data"]["forces"][1]["id"] = "pull"
        configs.append(duplicate)
        for count in (0, 13):
            config = self.config()
            config["data"]["forces"] = [dict(id=str(i), label="力", fx=1, fy=0) for i in range(count)]
            configs.append(config)
        extra = self.config()
        extra["data"]["forces"][0]["resultant"] = True
        configs.append(extra)
        for config in configs:
            with self.subTest(config=config), self.assertRaises(ValueError):
                MODULE.analyze(config)

    def test_invalid_axis_component_selection_and_unit_are_rejected(self):
        for angle in (361, "30", False, float("nan")):
            config = self.config()
            config["data"]["axisAngle"] = angle
            with self.subTest(angle=angle), self.assertRaises(ValueError):
                MODULE.analyze(config)
        with self.assertRaisesRegex(ValueError, "existing real force"):
            MODULE.analyze(self.config(), components="nonexistent")
        config = self.config()
        config["data"]["unit"] = "kN"
        with self.assertRaises(ValueError):
            MODULE.analyze(config)

    def test_missing_dependency_has_actionable_error_without_installing(self):
        original_import = __import__
        def blocked_import(name, *args, **kwargs):
            if name.startswith("matplotlib"):
                raise ImportError("unavailable")
            return original_import(name, *args, **kwargs)
        with patch("builtins.__import__", side_effect=blocked_import), self.assertRaisesRegex(RuntimeError, "No dependencies were installed"):
            MODULE._load_plotting()


class ForceImageTests(ForceFixtures, unittest.TestCase):
    """These are real matplotlib renders, not assertions about HTML strings."""

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_real_png_signature_size_and_nonblank_pixels(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "force.png"
            MODULE.render(self.config(), output)
            raw = output.read_bytes()
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            width, height = struct.unpack(">II", raw[16:24])
            self.assertGreater(width, 1000)
            self.assertGreater(height, 1000)
            with Image.open(output) as image:
                colors = image.convert("RGB").getcolors(width * height)
                self.assertGreater(len(colors), 100)

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_real_svg_has_paths_and_explicit_static_description_in_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "slope.svg"
            MODULE.render(self.slope_config(), output, theme="light", resultant=True, components="weight")
            root = ET.parse(output).getroot()
            self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
            self.assertGreater(len(root.findall(".//{http://www.w3.org/2000/svg}path")), 40)
            self.assertIn("ChatUI static force renderer", output.read_text())

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_direction_and_long_labels_have_no_glyph_warnings(self):
        import warnings
        config = self.direction_config()
        config["data"]["forces"][0]["label"] = "支持力来源于接触面的法向作用请不要与物体施加给接触面的反作用力混淆" * 2
        with tempfile.TemporaryDirectory() as folder, warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            MODULE.render(config, Path(folder) / "direction.png", theme="light")
            self.assertFalse(any("Glyph" in str(warning.message) for warning in caught))

    def test_invalid_data_preserves_previous_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "existing.png"
            output.write_bytes(b"previous valid image")
            config = self.config()
            config["data"]["forces"][0]["fx"] = "unknown"
            with self.assertRaises(ValueError):
                MODULE.render(config, output)
            self.assertEqual(output.read_bytes(), b"previous valid image")

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_failed_save_preserves_previous_output_and_removes_temporary_file(self):
        from matplotlib.figure import Figure
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "existing.png"
            output.write_bytes(b"previous valid image")
            with patch.object(Figure, "savefig", side_effect=OSError("simulated disk failure")), self.assertRaises(OSError):
                MODULE.render(self.config(), output)
            self.assertEqual(output.read_bytes(), b"previous valid image")
            self.assertEqual(list(Path(folder).iterdir()), [output])

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Font-rendering guard needs optional plotting runtime; do not pass on an unrelated import failure")
    def test_missing_font_cannot_replace_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "existing.png"
            output.write_bytes(b"previous valid image")
            with patch.object(MODULE, "_choose_font", side_effect=RuntimeError("No installed font")), self.assertRaises(RuntimeError):
                MODULE.render(self.config(), output)
            self.assertEqual(output.read_bytes(), b"previous valid image")

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_cli_produces_image_and_rejects_overwriting_source(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "config.json", Path(folder) / "force.png"
            source.write_text(json.dumps(self.config(), ensure_ascii=False), encoding="utf-8")
            before = source.read_bytes()
            result = subprocess.run([sys.executable, str(HELPER), str(source), str(output), "--resultant"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.read_bytes().startswith(b"\x89PNG"))
            result = subprocess.run([sys.executable, str(HELPER), str(source), str(source)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("must not overwrite", result.stderr)
            self.assertEqual(source.read_bytes(), before)

    def test_refuses_to_write_into_bundled_skill(self):
        with self.assertRaisesRegex(ValueError, "installed skill"):
            MODULE.render(self.config(), MODULE.SKILL_ROOT / "assets" / "force.png")

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_zero_vectors_and_zero_resultant_do_not_add_fake_arrows(self):
        config = self.config()
        for force in config["data"]["forces"]:
            force.update(fx=0, fy=0)
        figure = MODULE._make_figure(MODULE.analyze(config, resultant=True, components="weight"), "dark")
        try:
            # Only the two coordinate axes have arrows in this all-zero case.
            self.assertEqual(len(figure.axes[0].patches), 2)
        finally:
            figure.clear()

    @unittest.skipUnless(importlib.util.find_spec("matplotlib") and importlib.util.find_spec("PIL"), "Optional matplotlib/Pillow runtime absent; not installed by tests")
    def test_twelve_collinear_forces_and_long_labels_fit_inside_image(self):
        from matplotlib.text import Text
        config = self.config()
        config["title"] = "同向外力示意：检查长标题、编号与中文名称的完整显示" * 2
        config["data"]["forces"] = [dict(id=str(index), label="很长的作用力名称用于验证自动换行仍能保持完整可读" * 3, fx=10, fy=0) for index in range(12)]
        figure = MODULE._make_figure(MODULE.analyze(config, resultant=True), "light")
        try:
            figure.canvas.draw()
            renderer = figure.canvas.get_renderer()
            extent = figure.bbox
            for text in figure.findobj(Text):
                if text.get_visible() and text.get_text():
                    box = text.get_window_extent(renderer)
                    self.assertGreaterEqual(box.x0, 0, text.get_text())
                    self.assertGreaterEqual(box.y0, 0, text.get_text())
                    self.assertLessEqual(box.x1, extent.x1, text.get_text())
                    self.assertLessEqual(box.y1, extent.y1, text.get_text())
        finally:
            figure.clear()


if __name__ == "__main__":
    unittest.main()
