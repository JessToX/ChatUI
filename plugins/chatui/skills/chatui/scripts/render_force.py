#!/usr/bin/env python3
"""Render a validated force-diagram config to a static PNG or SVG, without HTML.

Requires an already available matplotlib installation. No downloads or dependency
installation are attempted. Only real forces contribute to the resultant.
"""

import argparse
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unicodedata


SKILL_ROOT = Path(__file__).resolve().parents[1]
TONES = {"blue", "green", "orange", "neutral"}
PALETTES = {
    "dark": dict(bg="#0d1015", panel="#151b24", text="#f3f6fb", muted="#aeb9c9",
                 line="#303d4e", blue="#4ea1ff", green="#35dc98", orange="#ffb24c", neutral="#bbcadd"),
    "light": dict(bg="#ffffff", panel="#f4f7fc", text="#152239", muted="#53647a",
                  line="#ced8e6", blue="#1564d1", green="#087c53", orange="#ac5600", neutral="#526780"),
}


def _number(value, label, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > maximum:
        raise ValueError(f"{label} must be a finite number with absolute value <= {maximum:g}.")
    return value


def _text(value, label, maximum, optional=False):
    if optional and value is None:
        return ""
    if not isinstance(value, str) or len(value) > maximum or (not optional and not value.strip()):
        raise ValueError(f"{label} must be {'non-empty ' if not optional else ''}text of at most {maximum} characters.")
    if any(unicodedata.category(char) == "Cc" and char not in "\n\t" for char in value):
        raise ValueError(f"{label} contains unsupported control characters.")
    return value


def _basis(angle):
    radians = math.radians(angle)
    # Snap only the dimensionless cardinal basis, never small real input forces.
    return tuple(0.0 if abs(value) < 1e-15 else value for value in (math.cos(radians), math.sin(radians)))


def analyze(config, *, resultant=False, components=None):
    """Validate shared component data and return the exact vectors to display."""
    if not isinstance(config, dict) or type(config.get("schemaVersion")) is not int or config["schemaVersion"] != 1 or config.get("type") != "force-diagram":
        raise ValueError("Expected schemaVersion 1 and type force-diagram.")
    _text(config.get("contentId"), "contentId", 200)
    title = _text(config.get("title", "受力分析"), "title", 200)
    data = config.get("data")
    if not isinstance(data, dict):
        raise ValueError("data must be an object.")
    body = _text(data.get("body"), "body", 120)
    note = _text(data.get("note"), "note", 1000, optional=True)
    mode = data.get("mode", "numeric")
    if mode not in ("numeric", "direction"):
        raise ValueError("mode must be numeric or direction.")
    numeric = mode == "numeric"
    if numeric and data.get("unit") != "N":
        raise ValueError("Numeric forces require unit N; convert the inputs first.")
    if not numeric and "unit" in data:
        raise ValueError("Direction-only forces have unknown magnitudes; omit unit.")
    if not numeric and (resultant or components is not None):
        raise ValueError("Unknown force magnitudes cannot be summed or decomposed numerically.")
    angle = _number(data.get("axisAngle", 0), "axisAngle", 360)
    forces = data.get("forces")
    if not isinstance(forces, list) or not 1 <= len(forces) <= 12:
        raise ValueError("Provide 1 to 12 real forces.")
    allowed = {"id", "label", "tone"} | ({"fx", "fy"} if numeric else {"angle"})
    identifiers, items = set(), []
    for index, force in enumerate(forces, 1):
        if not isinstance(force, dict) or not set(force) <= allowed:
            raise ValueError("Each force must be an object using only supported fields; do not add resultant or component vectors as forces.")
        identifier = _text(force.get("id"), "force.id", 80)
        label = _text(force.get("label"), "force.label", 120)
        if identifier in identifiers:
            raise ValueError("Force ids must be unique.")
        identifiers.add(identifier)
        tone = force.get("tone", ("blue", "green", "orange")[(index - 1) % 3])
        if not isinstance(tone, str) or tone not in TONES:
            raise ValueError("Force tone must be blue, green, orange or neutral.")
        if numeric:
            fx, fy = (_number(force.get(key), "force." + key, 1e12) for key in ("fx", "fy"))
        else:
            fx, fy = _basis(_number(force.get("angle"), "force.angle", 360))
        items.append(dict(id=identifier, label=label, tone=tone, index=index, fx=fx, fy=fy,
                          magnitude=math.hypot(fx, fy), angle=None if numeric else force["angle"]))
    if components is not None and components not in identifiers:
        raise ValueError("--components must name an existing real force id.")
    total = None
    if numeric:
        tx, ty = (math.fsum(item[key] for item in items) for key in ("fx", "fy"))
        total = dict(fx=tx, fy=ty, magnitude=math.hypot(tx, ty))
    projections = []
    if components is not None:
        selected = next(item for item in items if item["id"] == components)
        cosine, sine = _basis(angle)
        x_local = math.fsum((selected["fx"] * cosine, selected["fy"] * sine))
        y_local = math.fsum((-selected["fx"] * sine, selected["fy"] * cosine))
        projections = [dict(label="x'", value=x_local, fx=x_local * cosine, fy=x_local * sine),
                       dict(label="y'", value=y_local, fx=-y_local * sine, fy=y_local * cosine)]
    return dict(title=title, body=body, note=note, mode=mode, axisAngle=angle, forces=items,
                resultant=total, showResultant=bool(resultant), componentId=components, components=projections)


def _format(value):
    return "0" if value == 0 else f"{value:.4g}"


def _wrap(text, width):
    """Wrap CJK and unbroken strings; every visual row gets its own height."""
    lines, current, used = [], "", 0
    for char in text.replace("\t", "    "):
        size = 2 if unicodedata.east_asian_width(char) in "WF" or char in "MWmw@%" else 1
        if char == "\n" or used + size > width:
            lines.append(current)
            current, used = "", 0
        if char != "\n":
            current += char
            used += size
    lines.append(current)
    return "\n".join(lines)


def _load_plotting():
    try:
        import matplotlib
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        from matplotlib.figure import Figure
        from matplotlib import font_manager
        from matplotlib.ft2font import FT2Font
        from matplotlib.patches import FancyArrowPatch
        return matplotlib, Figure, FigureCanvasAgg, font_manager, FT2Font, FancyArrowPatch
    except ImportError as error:
        raise RuntimeError("Static force rendering requires matplotlib in the current Python environment. No dependencies were installed. Use an already available plotting runtime or report that this display channel is unavailable.") from error


def _choose_font(text, font_manager, FT2Font):
    required = {ord(char) for char in text if not char.isspace()}
    preferred = ["Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "PingFang HK", "Arial Unicode MS", "Microsoft YaHei", "WenQuanYi Zen Hei", "DejaVu Sans"]
    fonts = sorted(font_manager.fontManager.ttflist,
                   key=lambda font: (preferred.index(font.name) if font.name in preferred else len(preferred), font.name, font.fname))
    seen = set()
    for font in fonts:
        if font.fname in seen:
            continue
        seen.add(font.fname)
        try:
            face = FT2Font(font.fname)
            if all(face.get_char_index(code) for code in required):
                return font_manager.FontProperties(fname=font.fname)
        except (OSError, RuntimeError):
            continue
    raise RuntimeError("No installed font can render all diagram labels, including Chinese text. Use a runtime with a suitable CJK font; no output was replaced.")


def _make_figure(model, theme):
    matplotlib, Figure, Canvas, font_manager, FT2Font, Arrow = _load_plotting()
    palette = PALETTES[theme]
    numeric = model["mode"] == "numeric"
    title = _wrap(model["title"], 62)
    body = _wrap("受力对象：" + model["body"] + "（二维质点）", 88)
    mode_note = "所有真实力使用同一比例；编号对应下表。" if numeric else "仅示方向：箭头等长，大小未知，不能据此推断合力。"
    axes_note = "+x 向右，+y 向上。" if model["axisAngle"] == 0 else f"全局 +x 向右、+y 向上；局部 +x' 逆时针旋转 {_format(model['axisAngle'])}°。"
    header = "真实作用力  /  全局分量与大小（N）" if numeric else "真实作用力  /  方向角从全局 +x 逆时针测量"
    labels = [_wrap(item["label"], 42) for item in model["forces"]]
    footnotes = []
    if model["showResultant"]:
        total = model["resultant"]
        footnotes.append("R  合力：" + "，".join(f"{label} = {_format(total[key])} N" for label, key in (("Fx", "fx"), ("Fy", "fy"), ("|F|", "magnitude"))))
        if total["magnitude"] == 0:
            footnotes.append("合力为零，不绘制有长度的合力箭头。")
    if model["components"]:
        selected = next(item for item in model["forces"] if item["id"] == model["componentId"])
        footnotes.append(f"虚线：力 {selected['index']} 的分解；不是新增外力，不重复计入合力。")
        footnotes.append("；".join(f"F{item['label']} = {_format(item['value'])} N" for item in model["components"]))
    if model["note"]:
        footnotes.append(model["note"])
    footnotes.append("静态受力图；条件改变后重新生成。")
    footnotes = [_wrap(note, 90) for note in footnotes]
    all_text = " ".join([title, body, mode_note, axes_note, header, "编号 作用力 Fx Fy |F| 方向角 大小未知 R x' y' + 0123456789.-°", *labels, *footnotes])
    font = _choose_font(all_text, font_manager, FT2Font)
    top_height = 0.55 + 0.32 * len(title.splitlines()) + 0.24 * len(body.splitlines()) + 0.65
    plot_height = 5.25
    row_heights = [max(0.48, 0.23 * len(label.splitlines()) + 0.20) for label in labels]
    table_height = 0.7 + sum(row_heights)
    foot_height = sum(0.23 * len(note.splitlines()) + 0.12 for note in footnotes) + 0.3
    height = top_height + plot_height + table_height + foot_height
    with matplotlib.rc_context({"text.usetex": False, "svg.fonttype": "path"}):
        figure = Figure(figsize=(8.6, height), facecolor=palette["bg"])
        Canvas(figure)
        def text(x, y, value, *, size=11, color=None, **kwargs):
            return figure.text(x / 8.6, 1 - y / height, value, fontsize=size, fontproperties=font,
                               color=color or palette["text"], va="top", parse_math=False, **kwargs)
        text(0.4, 0.32, title, size=19, weight="bold")
        text(0.4, 0.42 + 0.32 * len(title.splitlines()), body, color=palette["muted"])
        text(0.4, top_height - 0.65, axes_note, size=10, color=palette["muted"])
        text(0.4, top_height - 0.36, mode_note, size=10, color=palette["muted"])
        ax = figure.add_axes([0.055, 1 - (top_height + plot_height) / height, 0.89, plot_height / height], facecolor=palette["panel"])
        ax.set_aspect("equal")
        ax.set_xlim(-1.32, 1.32)
        ax.set_ylim(-1.20, 1.20)
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_edgecolor(palette["line"])
        extent = max((item["magnitude"] for item in model["forces"]), default=0)
        if model["showResultant"]:
            extent = max(extent, model["resultant"]["magnitude"])
        scale = 0.86 / (extent or 1)
        cosine, sine = _basis(model["axisAngle"])
        for ux, uy, label in [(cosine, sine, "+x'" if model["axisAngle"] else "+x"), (-sine, cosine, "+y'" if model["axisAngle"] else "+y")]:
            ax.add_patch(Arrow((-ux * 1.08, -uy * 1.08), (ux * 1.08, uy * 1.08), arrowstyle="->", mutation_scale=9, linewidth=0.8, color=palette["line"], linestyle=(0, (4, 4)), zorder=1))
            ax.text(ux * 1.15, uy * 1.15, label, color=palette["muted"], fontproperties=font, ha="center", va="center", fontsize=10, parse_math=False)
        def arrow(fx, fy, color, *, dashed=False, width=2.4):
            # Preserve literal zero and exact common scale. No minimum-length arrows.
            if fx == 0 and fy == 0:
                return
            arrow_points = math.hypot(fx, fy) * scale * plot_height / 2.4 * 72
            head_size = min(12 if not dashed else 9, arrow_points * 0.4)
            ax.add_patch(Arrow((0, 0), (fx * scale, fy * scale), arrowstyle="-|>", mutation_scale=head_size,
                              shrinkA=0, shrinkB=0, linewidth=width, color=color, linestyle=(0, (4, 3)) if dashed else "solid", zorder=3 if not dashed else 4))
        for projection in model["components"]:
            arrow(projection["fx"], projection["fy"], palette["orange"], dashed=True, width=1.6)
        for item in sorted(model["forces"], key=lambda force: force["magnitude"], reverse=True):
            arrow(item["fx"], item["fy"], palette[item["tone"]])
        if model["showResultant"]:
            total = model["resultant"]
            arrow(total["fx"], total["fy"], palette["green"], width=3.2)
        ax.scatter([0], [0], s=52, color=palette["text"], edgecolors=palette["panel"], linewidths=1.5, zorder=5)
        # Compact identifiers stay near their tips; long names live in the table.
        # Greedy collision avoidance also handles multiple collinear forces.
        callouts = [dict(label=str(item["index"]), fx=item["fx"], fy=item["fy"], tone=item["tone"]) for item in model["forces"]]
        if model["showResultant"] and model["resultant"]["magnitude"] != 0:
            callouts.append(dict(label="R", **{key: model["resultant"][key] for key in ("fx", "fy")}, tone="green"))
        for projection in model["components"]:
            if projection["fx"] != 0 or projection["fy"] != 0:
                callouts.append(dict(label=projection["label"], fx=projection["fx"], fy=projection["fy"], tone="orange"))
        positions = []
        for item in callouts:
            tip = (item["fx"] * scale, item["fy"] * scale)
            direction = math.atan2(item["fy"], item["fx"])
            candidates = [(tip[0] + radius * math.cos(direction + offset * math.pi / 8), tip[1] + radius * math.sin(direction + offset * math.pi / 8))
                          for radius in (0.14, 0.24, 0.35, 0.47, 0.60, 0.74) for offset in range(16)]
            position = next((candidate for candidate in candidates if abs(candidate[0]) < 1.08 and abs(candidate[1]) < 1.05
                             and all(math.dist(candidate, previous) >= 0.19 for previous in positions)), None)
            if position is None:
                raise RuntimeError("Could not lay out force labels without collisions; simplify or split this diagram.")
            positions.append(position)
            ax.annotate(item["label"], xy=tip, xytext=position, ha="center", va="center", color=palette[item["tone"]],
                        fontsize=10, fontproperties=font, parse_math=False,
                        bbox=dict(boxstyle="circle,pad=0.22", fc=palette["panel"], ec=palette[item["tone"]], lw=1),
                        arrowprops=dict(arrowstyle="-", color=palette[item["tone"]], alpha=0.55, lw=0.8, shrinkA=5, shrinkB=4), zorder=6)
        y = top_height + plot_height + 0.25
        text(0.4, y, header, size=11, weight="bold")
        y += 0.32
        columns = [(4.95, "Fx"), (6.13, "Fy"), (7.31, "|F|")] if numeric else [(5.20, "方向角"), (6.70, "大小")]
        for x, label in columns:
            text(x, y, label, size=10, color=palette["muted"])
        y += 0.31
        for item, label, row_height in zip(model["forces"], labels, row_heights):
            text(0.43, y, str(item["index"]), color=palette[item["tone"]], weight="bold")
            text(0.82, y, label)
            values = [_format(item[key]) for key in ("fx", "fy", "magnitude")] if numeric else [_format(item["angle"]) + "°", "未知"]
            for (x, _), value in zip(columns, values):
                text(x, y, value, size=10)
            figure.add_artist(matplotlib.lines.Line2D([0.047, 0.953], [1 - (y + row_height - 0.10) / height] * 2, color=palette["line"], linewidth=0.5, transform=figure.transFigure))
            y += row_height
        y += 0.14
        for note in footnotes:
            text(0.4, y, note, size=10, color=palette["muted"])
            y += 0.23 * len(note.splitlines()) + 0.12
        return figure


def render(config, output, *, theme="dark", resultant=False, components=None, dpi=160):
    """Write a complete image atomically. Invalid data never replaces old output."""
    model = analyze(config, resultant=resultant, components=components)
    output = Path(output)
    if output.suffix.lower() not in (".png", ".svg"):
        raise ValueError("Output must end in .png or .svg.")
    if theme not in PALETTES:
        raise ValueError("theme must be dark or light.")
    if type(dpi) is not int or not 72 <= dpi <= 300:
        raise ValueError("dpi must be an integer from 72 to 300.")
    if output.resolve() == SKILL_ROOT or SKILL_ROOT in output.resolve().parents:
        raise ValueError("Output must not overwrite files inside the installed skill.")
    figure = _make_figure(model, theme)
    temporary = None
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".chatui-force-", suffix=output.suffix.lower(), dir=output.parent)
        os.close(descriptor)
        figure.savefig(temporary, format=output.suffix[1:].lower(), dpi=dpi, facecolor=figure.get_facecolor(), metadata={"Creator" if output.suffix.lower() == ".svg" else "Software": "ChatUI static force renderer"})
        os.replace(temporary, output)
        temporary = None
    finally:
        figure.clear()
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--theme", choices=PALETTES, default="dark")
    parser.add_argument("--resultant", action="store_true", help="Explicitly show the computed resultant.")
    parser.add_argument("--components", metavar="FORCE_ID", help="Show this real force's local projections as dashed vectors.")
    parser.add_argument("--dpi", type=int, default=160)
    args = parser.parse_args()
    try:
        if args.config.resolve() == args.output.resolve():
            raise ValueError("Output must not overwrite the input configuration.")
        config = json.loads(args.config.read_text(encoding="utf-8"))
        render(config, args.output, theme=args.theme, resultant=args.resultant, components=args.components, dpi=args.dpi)
    except (ValueError, OSError, RuntimeError) as error:
        print(f"Cannot render force diagram: {error}", file=sys.stderr)
        return 2
    print(args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
