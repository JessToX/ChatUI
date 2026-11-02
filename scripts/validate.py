#!/usr/bin/env python3
"""Validate ChatUI skills and an optional private App dependency with Python's stdlib."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_component_templates import TemplateBuildError, check_templates


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLUGIN = PROJECT_ROOT / "plugins" / "chatui"
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# App IDs are opaque platform identifiers, not plugin IDs, Site IDs or endpoints.
# Connector/templated prefixes occur in official .app.json packages; asdk_app
# is the Apps SDK identity family advertised by platform plugin discovery.
APP_ID = re.compile(r"^(?:connector_|asdk_app_|templated_apps_)[A-Za-z0-9][A-Za-z0-9_-]*$")
APP_REFERENCE = "./.app.json"
LINK = re.compile(r"!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[\"'][^\n]*?[\"'])?\s*\)")
REFERENCE_LINK = re.compile(r"^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)", re.MULTILINE)
SECRET_PATTERNS = (
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b")),
    ("API key", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b")),
    ("macOS user path", re.compile(r"/Users/[A-Za-z0-9._-]+/")),
    ("ChatGPT conversation URL", re.compile(r"https://chatgpt\.com/(?:g/[^\s)]+/)?c/[a-fA-F0-9-]{20,}")),
)
TEXT_SUFFIXES = {".md", ".json", ".yaml", ".yml", ".txt", ".svg", ".html", ".css", ".js", ".py"}
BLOCKED_NAMES = {"mcp.json", ".mcp.json", ".env", ".ds_store", "credentials.json", "cookies.json", "conversations.json", "chat.html"}
BLOCKED_DIRS = {".git", "node_modules", "__pycache__", "hooks", "private", "screenshots", "conversation-exports"}


class ValidationError(ValueError):
    """One or more package checks failed."""


def _yaml_scalar(value: str) -> str:
    value = value.strip()
    if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def read_frontmatter(text: str) -> dict[str, str]:
    """Read required scalar fields; support ordinary and block YAML scalars."""
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValidationError("SKILL.md must begin with YAML frontmatter (---).")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValidationError("SKILL.md frontmatter has no closing ---.") from exc
    fields: dict[str, str] = {}
    for index, line in enumerate(lines[1:end], 1):
        match = re.match(r"^(name|description):\s*(.*)$", line)
        if not match:
            continue
        key, value = match.groups()
        if key in fields:
            raise ValidationError(f"Duplicate frontmatter field: {key}")
        if value.strip() in {">", "|-", ">-", "|", "|+", ">+"}:
            block = []
            for following in lines[index + 1:end]:
                if following and not following[0].isspace():
                    break
                block.append(following.strip())
            value = " ".join(block)
        fields[key] = _yaml_scalar(value)
    for key in ("name", "description"):
        if not fields.get(key, "").strip():
            raise ValidationError(f"SKILL.md needs a nonempty {key} field.")
    if not "\n".join(lines[end + 1:]).strip():
        raise ValidationError("SKILL.md needs workflow instructions after frontmatter.")
    return fields


def _allows_implicit(text: str) -> bool:
    """Check the documented policy mapping without requiring a YAML library."""
    in_policy = False
    found = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line == "policy:":
            in_policy = True
            continue
        if line and not line[0].isspace():
            in_policy = False
        if in_policy:
            match = re.match(r"^  allow_implicit_invocation:\s*(true|false)\s*(?:#.*)?$", line)
            if match:
                found.append(match.group(1))
    return found == ["true"]


def _reference_problem(value: str, base: Path, root: Path) -> str | None:
    value = value.strip("<>")
    parsed = urlsplit(value)
    if parsed.scheme in {"https", "http", "mailto"} or value.startswith("#"):
        return None
    if parsed.scheme or parsed.netloc:
        return f"unsupported resource reference: {value}"
    raw = unquote(parsed.path)
    if not raw:
        return None
    if Path(raw).is_absolute() or "\\" in raw:
        return f"resource must use a portable relative path: {value}"
    target = (base / raw).resolve()
    if not target.is_relative_to(root):
        return f"resource escapes plugin directory: {value}"
    if not target.exists():
        return f"resource does not exist: {value}"
    return None


def _unique_app_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate key in .app.json.")
        result[key] = value
    return result


def _app_problems(root: Path, openai: dict) -> list[str]:
    """Check the one supported private binding; connection requires a live check."""
    if "apps" not in openai:
        return []
    if openai["apps"] != APP_REFERENCE:
        return ["extensions.com.openai.apps must be exactly './.app.json'."]
    path = root / ".app.json"
    if path.is_symlink():
        return ["Symlinks are not permitted for .app.json."]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_app_object)
    except (OSError, UnicodeError, ValueError):
        return ["Cannot read .app.json as unique-key UTF-8 JSON."]
    if not isinstance(payload, dict) or set(payload) != {"apps"}:
        return [".app.json must contain only an 'apps' object."]
    apps = payload["apps"]
    if not isinstance(apps, dict) or len(apps) != 1:
        return [".app.json must declare exactly one App dependency."]
    alias, dependency = next(iter(apps.items()))
    errors = []
    if not SLUG.fullmatch(alias) or len(alias) > 64:
        errors.append("App dependency alias must be lowercase kebab-case, at most 64 characters.")
    if not isinstance(dependency, dict) or set(dependency) != {"id", "required"}:
        return errors + ["App dependency must contain only 'id' and 'required'."]
    app_id = dependency["id"]
    if (not isinstance(app_id, str) or len(app_id) > 256 or not APP_ID.fullmatch(app_id)
            or re.search(r"(?:^|[_-])(?:gh[pousr]_|github_pat_|sk-)", app_id)):
        errors.append("App dependency id must be a platform App/connector identifier, not a URL, secret, Site or plugin ID.")
    if dependency["required"] is not True:
        errors.append("App dependency required must be the boolean true.")
    return errors


def _overlay_problems(root: Path, manifest: dict, interface: dict, openai: dict) -> list[str]:
    """Check an optional account-generated legacy manifest without rewriting it."""
    path = root / ".codex-plugin" / "plugin.json"
    if not path.exists() and not path.is_symlink():
        return []
    if path.is_symlink() or path.parent.is_symlink():
        return ["Symlinks are not permitted for the legacy overlay."]
    try:
        overlay = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        return ["Cannot read .codex-plugin/plugin.json as UTF-8 JSON."]
    if not isinstance(overlay, dict):
        return [".codex-plugin/plugin.json must contain a JSON object."]

    errors = []
    for key in ("name", "version", "description", "author"):
        if overlay.get(key) != manifest.get(key):
            errors.append(f"Legacy overlay {key} must match portable plugin.json.")
    # Compare the original JSON values, including defaultPrompt string/list shape.
    if overlay.get("interface", {}) != interface:
        errors.append("Legacy overlay interface must match extensions.com.openai.interface exactly.")
    if overlay.get("skills") != "./skills":
        errors.append("Legacy overlay skills must be './skills'.")
    if "apps" in openai:
        if overlay.get("apps") != openai["apps"]:
            errors.append("Legacy overlay apps must match extensions.com.openai.apps exactly.")
    scopes = [("legacy overlay", overlay)]
    extensions = overlay.get("extensions")
    if isinstance(extensions, dict) and isinstance(extensions.get("com.openai"), dict):
        scopes.append(("legacy overlay extensions.com.openai", extensions["com.openai"]))
    for scope, values in scopes:
        if "apps" in values and ("apps" not in openai or values["apps"] != openai["apps"]):
            errors.append(f"{scope}.apps must match the declared portable App dependency.")
        for key in ("mcpServers", "hooks"):
            if key in values:
                errors.append(f"Unsupported ChatUI integration; remove {scope}.{key}.")
    return errors


def validate(plugin_dir: Path) -> tuple[dict, list[Path]]:
    """Return the manifest and sorted files, or raise ValidationError.

    Privacy scanning catches obvious accidental exports, paths and credentials;
    it does not replace a human review for personal content.
    """
    if plugin_dir.is_symlink():
        raise ValidationError("The plugin directory must not be a symlink.")
    root = plugin_dir.resolve()
    errors: list[str] = []
    manifest_path = root / "plugin.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValidationError(f"Cannot read plugin.json: {exc}") from exc
    if not isinstance(manifest, dict):
        raise ValidationError("plugin.json must contain a JSON object.")
    if manifest.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json":
        errors.append("plugin.json must declare the Agent Plugins 1.0 schema.")
    name = manifest.get("name")
    if not isinstance(name, str) or not SLUG.fullmatch(name) or len(name) > 64:
        errors.append("Plugin name must be lowercase kebab-case, at most 64 characters.")
    elif name != root.name:
        errors.append("Plugin name must match its containing directory.")
    version = manifest.get("version")
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        errors.append("Plugin version must be a semantic version, such as 0.1.0.")
    if not isinstance(manifest.get("description"), str) or not manifest["description"].strip():
        errors.append("Plugin description must be a nonempty string.")
    for key in ("skills", "mcpServers", "apps", "interface", "hooks"):
        if key in manifest:
            errors.append(f"Portable manifest must not declare top-level {key}.")
    extensions = manifest.get("extensions", {})
    if not isinstance(extensions, dict):
        errors.append("extensions must be an object.")
        extensions = {}
    openai = extensions.get("com.openai", {})
    if not isinstance(openai, dict):
        errors.append("extensions.com.openai must be an object.")
        openai = {}
    for key in ("hooks", "mcpServers"):
        if key in openai:
            errors.append(f"Unsupported ChatUI integration; remove extensions.com.openai.{key}.")
    errors.extend(_app_problems(root, openai))
    interface = openai.get("interface", {})
    if not isinstance(interface, dict):
        errors.append("Plugin interface must be an object.")
        interface = {}
    errors.extend(_overlay_problems(root, manifest, interface, openai))
    subtitle = interface.get("shortDescription")
    if subtitle is not None and (not isinstance(subtitle, str) or len(subtitle) > 30):
        errors.append("Listing shortDescription must be a string of at most 30 characters.")
    for key in ("logo", "logoDark", "composerIcon", "composerIconDark", "screenshots"):
        values = interface.get(key, [])
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list):
            errors.append(f"interface.{key} must contain relative asset paths.")
            continue
        for value in values:
            if not isinstance(value, str) or not value.startswith("./"):
                errors.append(f"interface.{key} must use ./ relative asset paths.")
            elif problem := _reference_problem(value, root, root):
                errors.append(problem)
    files = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root)
        if path.is_symlink():
            errors.append(f"Symlinks are not permitted: {relative.as_posix()}")
            continue
        if any(part.lower() in BLOCKED_DIRS for part in relative.parts):
            errors.append(f"Unwanted package directory: {relative.as_posix()}")
            continue
        if path.is_dir():
            continue
        if path.name.lower() == ".app.json" and (relative.as_posix() != ".app.json" or openai.get("apps") != APP_REFERENCE):
            errors.append(f"Unwanted undeclared App dependency file: {relative.as_posix()}")
            continue
        if path.name.lower() in BLOCKED_NAMES or path.name.lower().startswith(".env."):
            errors.append(f"Unwanted package file: {relative.as_posix()}")
            continue
        if path.suffix.lower() in {".pem", ".key", ".p12", ".zip", ".gz", ".sqlite", ".db", ".har"}:
            errors.append(f"Private, generated or archive file is not allowed: {relative.as_posix()}")
            continue
        files.append(path)
        if path.suffix.lower() in TEXT_SUFFIXES:
            try:
                content = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                errors.append(f"Text file is not readable UTF-8: {relative.as_posix()}")
                continue
            # Local import avoids a module cycle; generic plugin validation
            # permits declared App bindings, unlike the public release gate.
            from release_privacy import validate_public_content
            try:
                validate_public_content(content.encode('utf-8'),
                                        json_document=path.suffix.lower() == '.json',
                                        bindings=False)
            except ValidationError as error:
                errors.append(str(error))
            if path.suffix.lower() == ".md":
                for match in [*LINK.finditer(content), *REFERENCE_LINK.finditer(content)]:
                    if problem := _reference_problem(match.group(1), path.parent, root):
                        errors.append(f"{relative.as_posix()}: {problem}")
    skills_dir = root / "skills"
    skills = sorted(skills_dir.glob("*/SKILL.md"))
    if not skills:
        errors.append("ChatUI must contain at least one skills/<name>/SKILL.md.")
    if set(skills_dir.rglob("SKILL.md")) != set(skills):
        errors.append("Every SKILL.md must be directly under skills/<name>/; nested skill entrypoints are not permitted.")
    for skill in skills:
        label = skill.relative_to(root).as_posix()
        try:
            fields = read_frontmatter(skill.read_text(encoding="utf-8"))
            if (fields["name"] != skill.parent.name or not SLUG.fullmatch(fields["name"])
                    or len(fields["name"]) > 64):
                errors.append(f"{label}: Skill name must be kebab-case, at most 64 characters, and match its directory.")
        except (OSError, UnicodeError, ValidationError) as exc:
            errors.append(f"{label}: {exc}")
        policy = skill.parent / "agents" / "openai.yaml"
        policy_label = policy.relative_to(root).as_posix()
        try:
            policy_text = policy.read_text(encoding="utf-8")
            if not _allows_implicit(policy_text):
                errors.append(f"{policy_label} must explicitly set policy.allow_implicit_invocation: true.")
            for match in re.finditer(r"^  (icon_small|icon_large):\s*(.+)$", policy_text, re.MULTILINE):
                value = _yaml_scalar(match.group(2))
                if not value.startswith("./"):
                    errors.append(f"{policy_label}: Skill {match.group(1)} must use a ./ relative asset path.")
                elif problem := _reference_problem(value, skill.parent, root):
                    errors.append(f"{policy_label}: {problem}")
        except (OSError, UnicodeError):
            errors.append(f"{label}: Skill must include readable agents/openai.yaml.")
    for source in skills_dir.glob('*/assets/component-kit.html'):
        try:
            check_templates(source.parent.parent)
        except (TemplateBuildError, OSError, ValueError) as exc:
            errors.append(f"Component templates: {exc}")
    if errors:
        raise ValidationError("\n".join(f"- {error}" for error in errors))
    return manifest, files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, epilog="Checks packaging and obvious privacy mistakes; does not prove Chat activation, UI rendering or absence of all personal information.")
    parser.add_argument("plugin_dir", nargs="?", type=Path, default=DEFAULT_PLUGIN, help="Plugin directory (default: ../plugins/chatui relative to this script).")
    args = parser.parse_args()
    try:
        manifest, files = validate(args.plugin_dir)
    except ValidationError as exc:
        print(f"Validation failed:\n{exc}", file=sys.stderr)
        return 1
    has_app = manifest.get("extensions", {}).get("com.openai", {}).get("apps") == APP_REFERENCE
    skill_root = args.plugin_dir.resolve() / "skills"
    skill_count = sum(path.name == "SKILL.md" and path.parent.parent == skill_root for path in files)
    mode = f"{skill_count} implicit skill{'s' if skill_count != 1 else ''}"
    mode += " with one declared App dependency" if has_app else "; skills-only"
    print(f"Validated {manifest['name']} {manifest['version']}: {len(files)} files; {mode}.")
    print("Manual checks still required: personal-content review, App identity/connection when declared, Chat activation, rendering and interactions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
