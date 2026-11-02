#!/usr/bin/env python3
"""Build small self-contained templates from the single canonical component kit.

Only explicitly delimited renderer and optional helper regions are removed.
Included helpers and shared CSS remain verbatim (including security checks). Missing/duplicate/malformed regions or registry drift fail the
build instead of silently producing an incomplete component. --check is used by
package validation; generation itself requires only Python's standard library.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SKILL = PROJECT_ROOT / "plugins/chatui/skills/chatui"
MAX_TEMPLATE_BYTES = 50_000
RENDERERS = {
    "progress": "progress", "timeline": "timeline", "profile": "profile",
    "comparison": "comparison", "steps": "data => timeline(data, true)",
    "rhythm": "rhythm", "quiz": "quiz", "geometry": "geometry",
    "answer": "answer", "line-chart": "lineChart", "force-diagram": "forceDiagram",
    "motion-lab": "motionLab", "media-panel": "mediaPanel", "data-table": "dataTable",
    "tabs": "tabs", "reveal-steps": "revealSteps", "input-form": "inputForm",
}
FUNCTIONS = {
    "progress", "timeline", "profile", "comparison", "rhythm", "quiz", "geometry",
    "answer", "lineChart", "forceDiagram", "motionLab", "mediaPanel", "dataTable",
    "tabs", "revealSteps", "inputForm",
}
REGION = re.compile(
    r"^  // chatui:renderer ([A-Za-z]+) begin\n"
    r"([\s\S]*?)^  // chatui:renderer \1 end\n", re.MULTILINE
)
# Optional helpers are a reviewed, explicit set, just like renderers. Preserve
# their full validation policy whenever ANY public/internal symbol is referenced.
HELPERS = {"form": {"formFieldError", "validateInputForm"}, "math": {"MATH_ATTRIBUTES", "mathLengths", "validateMathAttributes", "safeMath", "formula"}}
HELPER_REGION = re.compile(
    r"^  // chatui:helper ([A-Za-z]+) begin\n"
    r"([\s\S]*?)^  // chatui:helper \1 end\n", re.MULTILINE
)
REGISTRY = re.compile(r"^    const renderers = \{ (.+) \};$", re.MULTILINE)
CONFIG = re.compile(r'(<script type="application/json" id="chatui-component-config">)\s*[\s\S]*?(</script>)')


class TemplateBuildError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise TemplateBuildError(message)


def compact(expression: str) -> str:
    return re.sub(r"\s+", "", expression)


def build_templates(source: str, examples: dict) -> dict[str, str]:
    """Return all derived files, rejecting ambiguous source structure."""
    regions = list(REGION.finditer(source))
    names = [match[1] for match in regions]
    require(len(names) == len(set(names)) and set(names) == FUNCTIONS,
            "Renderer regions must contain each expected function exactly once.")
    require(source.count("// chatui:renderer ") == 2 * len(regions),
            "Malformed or unmatched renderer boundary.")
    bodies = {match[1]: match[2] for match in regions}
    for name, body in bodies.items():
        require(re.match(r"  const " + name + r" = (?:data|\(data, isSteps = false\)) => \{\n", body) is not None
                and body.rstrip().endswith("  };"), f"Invalid renderer boundary for {name}.")
        declarations = re.findall(r"^  (?:const|let|function) (\w+)", body, re.MULTILINE)
        require(declarations == [name], f"Unexpected top-level declaration in renderer {name}.")
    common = REGION.sub("", source)
    # The contiguous region section prevents code from falling between regions
    # and accidentally surviving removal or being dropped with its neighbour.
    require("".join(match[0] for match in regions) == source[regions[0].start():regions[-1].end()],
            "Renderer regions must be contiguous; put shared helpers before them.")
    require(not any(re.search(r"^  const " + name + r"\b", common, re.MULTILINE) for name in FUNCTIONS),
            "Renderer declaration found outside an explicit region.")
    registries = list(REGISTRY.finditer(source))
    require(len(registries) == 1, "Expected exactly one renderer registry.")
    # Compare registry entries as a whole with a known generated form. This does
    # not parse JavaScript and deliberately rejects new expressions until the
    # builder has an explicit, reviewed mapping for them.
    expected = ", ".join(f"'{key}': {value}" for key, value in RENDERERS.items())
    original = re.sub(r"(^|,\s*)(\w+)(?=\s*(?:,|$))", lambda match: match[1] + match[2] + ": " + match[2], registries[0][1])
    require(compact(original).replace("'", "") == compact(expected).replace("'", ""),
            "Renderer registry changed; update the explicit build mapping.")
    configurations = {value.get("type"): value for value in examples.values()}
    require(set(configurations) == set(RENDERERS), "Example types must cover the full renderer registry.")
    require(len(list(CONFIG.finditer(source))) == 1, "Expected exactly one JSON configuration slot.")
    helpers = list(HELPER_REGION.finditer(source))
    require([match[1] for match in helpers] == list(HELPERS)
            and source.count("// chatui:helper ") == 2 * len(helpers),
            "Optional helper regions must contain each reviewed group exactly once.")
    helper_bodies = {match[1]: match[2] for match in helpers}
    without_helpers = HELPER_REGION.sub("", source)
    for group, symbols in HELPERS.items():
        declarations = re.findall(r"^  (?:const|let|function) (\w+)", helper_bodies[group], re.MULTILINE)
        require(len(declarations) == len(symbols) and set(declarations) == symbols,
                f"Optional helper declarations changed: {group}.")
        require(not any(re.search(r"^  (?:const|let|function) " + symbol + r"\b", without_helpers, re.MULTILINE)
                        for symbol in symbols), "Optional helper declared outside its region.")
    output = {}
    for component_type, expression in RENDERERS.items():
        needed = {name for name in FUNCTIONS if re.search(r"\b" + name + r"\b", expression)}
        # Conservatively include references to other known renderer functions.
        # A name in a string/comment may over-include code, never omit a dependency.
        while True:
            dependencies = {name for body_name in needed for name in FUNCTIONS
                            if re.search(r"\b" + name + r"\b", bodies[body_name])}
            if dependencies <= needed:
                break
            needed |= dependencies
        template = REGION.sub(lambda match: match[2] if match[1] in needed else "", source)
        registry = f"    const renderers = {{ '{component_type}': {expression} }};"
        template, replaced = REGISTRY.subn(lambda _: registry, template)
        require(replaced == 1, "Renderer registry replacement failed.")
        # Scan after removing unrelated renderers, but before removing helpers.
        # Strings/comments can only over-include; never drop a referenced helper.
        reachable = HELPER_REGION.sub("", template)
        needed_helpers = set()
        while True:
            additions = {group for group, symbols in HELPERS.items() if group not in needed_helpers
                         and any(re.search(r"\b" + symbol + r"\b", reachable) for symbol in symbols)}
            if not additions:
                break
            needed_helpers |= additions
            reachable += "".join(helper_bodies[group] for group in sorted(additions))
        template = HELPER_REGION.sub(lambda match: match[2] if match[1] in needed_helpers else "", template)
        payload = json.dumps(configurations[component_type], ensure_ascii=False, indent=2, allow_nan=False).replace("<", "\\u003c")
        template = CONFIG.sub(lambda match: match[1] + "\n" + payload + "\n" + match[2], template)
        template = "<!-- Generated from component-kit.html; edit that source and rebuild. -->\n" + template
        require(len(template.encode("utf-8")) < MAX_TEMPLATE_BYTES,
                f"{component_type} exceeds {MAX_TEMPLATE_BYTES} UTF-8 bytes; split shared resources deliberately.")
        output[component_type + ".html"] = template
    return output


def generated_templates(skill_dir: Path) -> dict[str, str]:
    assets = skill_dir / "assets"
    return build_templates((assets / "component-kit.html").read_text(encoding="utf-8"),
                           json.loads((assets / "component-examples.json").read_text(encoding="utf-8")))


def check_templates(skill_dir: Path) -> dict[str, int]:
    expected = generated_templates(skill_dir)
    directory = skill_dir / "assets/components"
    actual = {path.name for path in directory.glob("*") if path.is_file()}
    require(actual == set(expected), "Derived component template set is missing or has unexpected files; rebuild.")
    for name, source in expected.items():
        path = directory / name
        require(not path.is_symlink() and path.read_bytes() == source.encode("utf-8"),
                f"Derived component template is stale or modified: {name}; rebuild from the canonical kit.")
    return {name: len(source.encode("utf-8")) for name, source in expected.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", type=Path, default=DEFAULT_SKILL)
    parser.add_argument("--check", action="store_true", help="Reject missing/stale output without writing any files.")
    args = parser.parse_args()
    try:
        if not args.check:
            templates = generated_templates(args.skill_dir)
            destination = args.skill_dir / "assets/components"
            require(not destination.is_symlink(), "Derived template directory cannot be a symlink.")
            destination.mkdir(parents=True, exist_ok=True)
            require(not any((destination / name).is_symlink() for name in templates),
                    "Derived template files cannot be symlinks.")
            for name, source in templates.items():
                with (destination / name).open("w", encoding="utf-8", newline="\n") as output:
                    output.write(source)
        sizes = check_templates(args.skill_dir)
    except (TemplateBuildError, OSError, ValueError) as exc:
        print(f"Component template validation failed: {exc}", file=sys.stderr)
        return 1
    for name, size in sorted(sizes.items()):
        print(f"{name}: {size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
