"""Offline packaging checks. These do not run a ChatGPT conversation."""

from __future__ import annotations

import json
import os
from copy import deepcopy
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from package import package
from validate import ValidationError, main as validate_main, validate
from symlink_support import require_symlink_capability


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.plugin = self.base / "chatui"
        self.skill = self.plugin / "skills" / "conversation-ui"
        (self.skill / "agents").mkdir(parents=True)
        self.manifest = {
            "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            "name": "chatui", "version": "0.1.0", "description": "Conversation presentation guidance",
        }
        self.write_manifest()
        (self.skill / "SKILL.md").write_text(
            "---\nname: conversation-ui\ndescription: Help explain complex topics clearly.\n---\n\n"
            "Use [the guide](references/guide.md) when diagrams help.\n", encoding="utf-8"
        )
        (self.skill / "references").mkdir()
        (self.skill / "references" / "guide.md").write_text("# Guide\nUse source-backed diagrams.\n", encoding="utf-8")
        self.policy = self.skill / "agents" / "openai.yaml"
        self.policy.write_text("interface:\n  display_name: Conversation UI\npolicy:\n  allow_implicit_invocation: true\n", encoding="utf-8")

    def write_manifest(self):
        (self.plugin / "plugin.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def add_skill(self, name="project-progress"):
        skill = self.plugin / "skills" / name
        (skill / "agents").mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            f"---\nname: {name}\ndescription: Present known project progress.\n---\n\n"
            "Use [shared guidance](../conversation-ui/references/guide.md).\n", encoding="utf-8"
        )
        (skill / "agents" / "openai.yaml").write_text(
            "policy:\n  allow_implicit_invocation: true\n", encoding="utf-8"
        )
        return skill

    def write_overlay(self, overlay=None):
        if overlay is None:
            overlay = {key: deepcopy(self.manifest[key]) for key in ("name", "version", "description", "author") if key in self.manifest}
            overlay["interface"] = deepcopy(self.manifest.get("extensions", {}).get("com.openai", {}).get("interface", {}))
            overlay["skills"] = "./skills"
            if "apps" in self.manifest.get("extensions", {}).get("com.openai", {}):
                overlay["apps"] = self.manifest["extensions"]["com.openai"]["apps"]
        path = self.plugin / ".codex-plugin" / "plugin.json"
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(overlay), encoding="utf-8")
        return path

    def write_app(self, payload=None):
        # Offline fixture only; this ID is never installed or claimed connected.
        if payload is None:
            payload = {"apps": {"test-renderer": {"id": "connector_test_renderer", "required": True}}}
        self.manifest.setdefault("extensions", {}).setdefault("com.openai", {})["apps"] = "./.app.json"
        self.write_manifest()
        path = self.plugin / ".app.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_archive_is_reproducible_and_has_one_root(self):
        archive = package(self.plugin, self.base / "dist")
        original = archive.read_bytes()
        for file in self.plugin.rglob("*"):
            if file.is_file():
                os.utime(file, (1711111111, 1711111111))
        self.assertEqual(original, package(self.plugin, self.base / "dist").read_bytes())
        with zipfile.ZipFile(archive) as zipped:
            self.assertEqual(zipped.namelist(), sorted(zipped.namelist()))
            self.assertTrue(all(name.startswith("chatui/") for name in zipped.namelist()))
            self.assertEqual(zipped.read("chatui/plugin.json"), (self.plugin / "plugin.json").read_bytes())
            self.assertTrue(all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in zipped.infolist()))

    def test_invalid_source_does_not_replace_good_archive(self):
        archive = package(self.plugin, self.base / "dist")
        original = archive.read_bytes()
        (self.plugin / "mcp.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(ValidationError):
            package(self.plugin, self.base / "dist")
        self.assertEqual(original, archive.read_bytes())

    def test_optional_overlay_preserves_original_metadata_and_prompt_shape(self):
        self.manifest["author"] = {"name": "Example Author"}
        for prompt in ("Explain this idea.", ["Explain this idea.", "Compare these options."]):
            with self.subTest(prompt=prompt):
                self.manifest["extensions"] = {"com.openai": {"interface": {"defaultPrompt": prompt}}}
                self.write_manifest()
                path = self.write_overlay()
                overlay = json.loads(path.read_text(encoding="utf-8"))
                overlay["accountMetadata"] = {"formatRevision": 2, "label": "Preserve me"}
                self.write_overlay(overlay)
                original = path.read_bytes()
                archive = package(self.plugin, self.base / "dist")
                with zipfile.ZipFile(archive) as zipped:
                    self.assertEqual(zipped.read("chatui/.codex-plugin/plugin.json"), original)
                self.assertEqual(path.read_bytes(), original)

    def test_overlay_drift_is_rejected(self):
        self.manifest["extensions"] = {"com.openai": {"interface": {"defaultPrompt": "Explain this idea."}}}
        self.write_manifest()
        for key, changed, expected in (
            ("version", "0.0.1", "overlay version"),
            ("interface", {"defaultPrompt": ["Explain this idea."]}, "overlay interface"),
            ("skills", "../other-skills", "overlay skills"),
        ):
            with self.subTest(key=key):
                path = self.write_overlay()
                overlay = json.loads(path.read_text(encoding="utf-8"))
                overlay[key] = changed
                self.write_overlay(overlay)
                with self.assertRaisesRegex(ValidationError, expected):
                    validate(self.plugin)

    def test_overlay_cannot_add_integrations(self):
        for key in ("mcpServers", "apps", "hooks"):
            for nested in (False, True):
                with self.subTest(key=key, nested=nested):
                    path = self.write_overlay()
                    overlay = json.loads(path.read_text(encoding="utf-8"))
                    scope = overlay.setdefault("extensions", {}).setdefault("com.openai", {}) if nested else overlay
                    scope[key] = {"external": {"url": "https://example.com/integration"}}
                    self.write_overlay(overlay)
                    with self.assertRaisesRegex(ValidationError, key):
                        validate(self.plugin)

    def test_malformed_overlay_is_rejected(self):
        path = self.write_overlay()
        for content in (b"not JSON", b"[]", b"\xff"):
            with self.subTest(content=content):
                path.write_bytes(content)
                with self.assertRaisesRegex(ValidationError, r"\.codex-plugin/plugin.json"):
                    validate(self.plugin)

    def test_missing_resource_is_rejected(self):
        (self.skill / "references" / "guide.md").unlink()
        with self.assertRaisesRegex(ValidationError, "does not exist"):
            validate(self.plugin)

    def test_parent_resource_escape_is_rejected(self):
        (self.base / "private.md").write_text("Do not package", encoding="utf-8")
        with (self.skill / "SKILL.md").open("a", encoding="utf-8") as file:
            file.write("[Outside](../../../private.md)\n")
        with self.assertRaisesRegex(ValidationError, "escapes plugin"):
            validate(self.plugin)

    def test_symlink_is_rejected(self):
        require_symlink_capability(self)
        (self.skill / "linked.md").symlink_to(self.skill / "references" / "guide.md")
        with self.assertRaisesRegex(ValidationError, "Symlinks"):
            validate(self.plugin)

    def test_implicit_invocation_must_be_enabled(self):
        self.policy.write_text("policy:\n  allow_implicit_invocation: false\n", encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "allow_implicit_invocation"):
            validate(self.plugin)

    def test_missing_skill_icon_is_rejected(self):
        self.policy.write_text("interface:\n  icon_small: ./assets/missing.svg\npolicy:\n  allow_implicit_invocation: true\n", encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "does not exist"):
            validate(self.plugin)

    def test_private_path_and_export_are_rejected_without_echoing_content(self):
        (self.skill / "references" / "guide.md").write_text("Source: /" + "Users/sample-person/Documents/private.txt\n", encoding="utf-8")
        (self.plugin / "conversations.json").write_text("[]", encoding="utf-8")
        with self.assertRaises(ValidationError) as caught:
            validate(self.plugin)
        self.assertIn("macOS user path", str(caught.exception))
        self.assertIn("Unwanted package file", str(caught.exception))
        self.assertNotIn("sample-person", str(caught.exception))

    def test_missing_frontmatter_is_rejected(self):
        (self.skill / "SKILL.md").write_text("No metadata\n", encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "frontmatter"):
            validate(self.plugin)

    def test_multiple_skills_and_shared_resources_are_packaged(self):
        second = self.add_skill()
        archive = package(self.plugin, self.base / "dist")
        with zipfile.ZipFile(archive) as zipped:
            for skill in (self.skill, second):
                entry = "chatui/" + skill.relative_to(self.plugin).as_posix()
                self.assertEqual(zipped.read(entry + "/SKILL.md"), (skill / "SKILL.md").read_bytes())
                self.assertEqual(zipped.read(entry + "/agents/openai.yaml"), (skill / "agents/openai.yaml").read_bytes())
        output = StringIO()
        with patch.object(sys, "argv", ["validate.py", str(self.plugin)]), redirect_stdout(output):
            self.assertEqual(validate_main(), 0)
        self.assertIn("2 implicit skills", output.getvalue())

    def test_every_skill_needs_valid_metadata(self):
        second = self.add_skill()
        for metadata, expected in (
            ("name: wrong-name\ndescription: Progress", "Skill name"),
            ("name: project-progress", "description"),
            ("not frontmatter", "frontmatter"),
        ):
            with self.subTest(metadata=metadata):
                content = metadata if expected == "frontmatter" else f"---\n{metadata}\n---\nPresent progress.\n"
                (second / "SKILL.md").write_text(content, encoding="utf-8")
                with self.assertRaisesRegex(ValidationError, expected) as caught:
                    validate(self.plugin)
                self.assertIn("skills/project-progress/SKILL.md", str(caught.exception))

    def test_every_skill_needs_explicit_implicit_policy(self):
        second = self.add_skill()
        policy = second / "agents" / "openai.yaml"
        for content in ("policy:\n  allow_implicit_invocation: false\n", "interface:\n  display_name: Progress\n"):
            with self.subTest(content=content):
                policy.write_text(content, encoding="utf-8")
                with self.assertRaisesRegex(ValidationError, "allow_implicit_invocation") as caught:
                    validate(self.plugin)
                self.assertIn("skills/project-progress/agents/openai.yaml", str(caught.exception))
        policy.unlink()
        with self.assertRaisesRegex(ValidationError, "readable agents/openai.yaml"):
            validate(self.plugin)

    def test_second_skill_resources_are_checked(self):
        second = self.add_skill()
        with (second / "SKILL.md").open("a", encoding="utf-8") as file:
            file.write("[Missing](references/missing.md)\n")
        with self.assertRaisesRegex(ValidationError, "does not exist") as caught:
            validate(self.plugin)
        self.assertIn("skills/project-progress/SKILL.md", str(caught.exception))

    def test_missing_and_nested_skill_entrypoints_are_rejected(self):
        (self.skill / "SKILL.md").unlink()
        with self.assertRaisesRegex(ValidationError, "at least one"):
            validate(self.plugin)
        second = self.add_skill()
        nested = second / "nested"
        nested.mkdir()
        (nested / "SKILL.md").write_bytes((second / "SKILL.md").read_bytes())
        with self.assertRaisesRegex(ValidationError, "nested skill entrypoints"):
            validate(self.plugin)

    def test_required_app_is_packaged_with_both_manifest_references(self):
        app = self.write_app()
        overlay = self.write_overlay()
        archive = package(self.plugin, self.base / "dist")
        original = archive.read_bytes()
        self.assertEqual(original, package(self.plugin, self.base / "dist").read_bytes())
        with zipfile.ZipFile(archive) as zipped:
            self.assertEqual(zipped.read("chatui/.app.json"), app.read_bytes())
            self.assertEqual(zipped.read("chatui/.codex-plugin/plugin.json"), overlay.read_bytes())
            root = json.loads(zipped.read("chatui/plugin.json"))
            self.assertEqual(root["extensions"]["com.openai"]["apps"], "./.app.json")
        # The overlay is optional; portable packages keep working by themselves.
        overlay.unlink()
        validate(self.plugin)

    def test_app_file_is_rejected_when_undeclared_or_nested(self):
        app = self.write_app()
        del self.manifest["extensions"]["com.openai"]["apps"]
        self.write_manifest()
        with self.assertRaisesRegex(ValidationError, "undeclared App"):
            validate(self.plugin)
        self.write_app()
        (self.skill / ".app.json").write_bytes(app.read_bytes())
        with self.assertRaisesRegex(ValidationError, "undeclared App"):
            validate(self.plugin)

    def test_app_reference_must_be_exact_contained_path(self):
        self.write_app()
        for reference in (None, {}, ".app.json", "../.app.json", "./other.json", "/tmp/.app.json", "https://example.com/.app.json"):
            with self.subTest(reference=reference):
                self.manifest["extensions"]["com.openai"]["apps"] = reference
                self.write_manifest()
                with self.assertRaisesRegex(ValidationError, "exactly './.app.json'"):
                    validate(self.plugin)

    def test_missing_malformed_and_duplicate_app_files_are_rejected(self):
        app = self.write_app()
        app.unlink()
        with self.assertRaisesRegex(ValidationError, "Cannot read .app.json"):
            validate(self.plugin)
        for content in (b"not JSON", b"\xff", b'{"apps":{},"apps":{}}', b'{"apps":{"test":{"id":"connector_test","id":"connector_other","required":true}}}'):
            with self.subTest(content=content):
                app.write_bytes(content)
                with self.assertRaisesRegex(ValidationError, "unique-key UTF-8 JSON"):
                    validate(self.plugin)

    def test_app_file_cannot_be_a_symlink(self):
        require_symlink_capability(self)
        app = self.write_app()
        external = self.base / "outside.json"
        external.write_bytes(app.read_bytes())
        app.unlink()
        app.symlink_to(external)
        with self.assertRaisesRegex(ValidationError, "Symlinks"):
            validate(self.plugin)

    def test_app_schema_allows_only_one_required_dependency(self):
        entry = {"id": "connector_test_renderer", "required": True}
        for payload, expected in (
            ([], "only an 'apps' object"),
            ({"apps": {}, "token": "value"}, "only an 'apps' object"),
            ({"apps": []}, "exactly one"),
            ({"apps": {}}, "exactly one"),
            ({"apps": {"first": entry, "second": entry}}, "exactly one"),
            ({"apps": {"../outside": entry}}, "alias"),
            ({"apps": {"test": "connector_test_renderer"}}, "only 'id' and 'required'"),
            ({"apps": {"test": {"id": "connector_test_renderer"}}}, "only 'id' and 'required'"),
            ({"apps": {"test": {**entry, "url": "https://example.com"}}}, "only 'id' and 'required'"),
        ):
            with self.subTest(payload=payload):
                self.write_app(payload)
                with self.assertRaisesRegex(ValidationError, expected):
                    validate(self.plugin)
        for required in (False, None, "true", 1, [], {}):
            with self.subTest(required=required):
                self.write_app({"apps": {"test": {**entry, "required": required}}})
                with self.assertRaisesRegex(ValidationError, "boolean true"):
                    validate(self.plugin)

    def test_app_ids_reject_endpoints_secrets_and_wrong_identity_families(self):
        for app_id in (None, 12, {}, "", "test-renderer", "appgprj_123", "plugins_123", "plugin_asdk_app_123", "https://example.com/mcp", "connector_", "connector_test/extra", "connector_test?token=secret", "connector_sk-" + "x" * 40, "sk-" + "x" * 40, "ghp_" + "x" * 40):
            with self.subTest(app_id=app_id):
                self.write_app({"apps": {"test": {"id": app_id, "required": True}}})
                with self.assertRaisesRegex(ValidationError, "platform App/connector identifier") as caught:
                    validate(self.plugin)
                if isinstance(app_id, str) and len(app_id) > 20:
                    self.assertNotIn(app_id, str(caught.exception))
        for app_id in ("connector_test_renderer", "asdk_app_test_renderer", "templated_apps_TestRenderer"):
            with self.subTest(valid_format=app_id):
                self.write_app({"apps": {"test": {"id": app_id, "required": True}}})
                validate(self.plugin)

    def test_app_root_and_compatibility_declarations_must_agree(self):
        self.write_app()
        for mismatch in (None, "./elsewhere.json", {}):
            with self.subTest(mismatch=mismatch):
                overlay_path = self.write_overlay()
                overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
                overlay["apps"] = mismatch
                self.write_overlay(overlay)
                with self.assertRaisesRegex(ValidationError, "apps must match"):
                    validate(self.plugin)
        overlay_path = self.write_overlay()
        overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
        del overlay["apps"]
        self.write_overlay(overlay)
        with self.assertRaisesRegex(ValidationError, "apps must match"):
            validate(self.plugin)
        overlay["apps"] = "./.app.json"
        overlay["extensions"] = {"com.openai": {"apps": "./unexpected.json"}}
        self.write_overlay(overlay)
        with self.assertRaisesRegex(ValidationError, "portable App dependency"):
            validate(self.plugin)

    def test_app_support_keeps_other_integrations_and_private_data_blocked(self):
        self.write_app()
        for filename in ("mcp.json", ".mcp.json", "credentials.json", "cookies.json"):
            path = self.plugin / filename
            path.write_text("{}", encoding="utf-8")
            with self.subTest(filename=filename), self.assertRaisesRegex(ValidationError, "Unwanted package file"):
                validate(self.plugin)
            path.unlink()
        (self.skill / "references" / "guide.md").write_text("ghp_" + "x" * 40, encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "GitHub token"):
            validate(self.plugin)

    def test_validation_output_does_not_claim_app_connection(self):
        for has_app in (False, True):
            if has_app:
                self.write_app()
            output = StringIO()
            with patch.object(sys, "argv", ["validate.py", str(self.plugin)]), redirect_stdout(output):
                self.assertEqual(validate_main(), 0)
            text = output.getvalue()
            self.assertIn("declared App dependency" if has_app else "skills-only", text)
            self.assertIn("Manual checks still required", text)
            if has_app:
                self.assertNotIn("skills-only", text)

    def test_output_must_remain_outside_plugin(self):
        with self.assertRaisesRegex(ValidationError, "outside the plugin"):
            package(self.plugin, self.plugin / "dist")


if __name__ == "__main__":
    unittest.main()
