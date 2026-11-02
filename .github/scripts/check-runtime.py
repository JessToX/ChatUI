"""Fail closed on pinned dependency drift, import failures, and missing CJK glyphs."""
import hashlib
import importlib.metadata
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[2]
for line in (root / "requirements-phase3.txt").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    name, expected = line.split("==")
    actual = importlib.metadata.version(name)
    if actual != expected:
        raise RuntimeError(f"Dependency drift: {name}: {actual} != {expected}")
from six.moves import _thread
import dateutil.parser
import numpy
import PIL.Image

spec = importlib.util.spec_from_file_location("force_runtime_check", root / "plugins/chatui/skills/chatui/scripts/render_force.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
_, _, _, manager, face_type, _ = module._load_plotting()
labels = "受力对象：木块（二维质点）重力支持力摩擦力合力全局分量大小方向角向右向上真实作用力零不绘制箭头 N xy R Fx Fy 0123456789 −°′"
font = module._choose_font(labels, manager, face_type)
path = Path(font.get_file())
face = face_type(str(path))
required = {ord(c) for c in labels if not c.isspace()}
if not all(face.get_char_index(code) for code in required):
    raise RuntimeError("Selected font does not cover the requested label corpus")
print("Pinned dependencies/imports PASS; CJK glyph coverage PASS; font", path.name,
      "sha256", hashlib.sha256(path.read_bytes()).hexdigest())
print("Preflight is not full image acceptance; all original plotting tests still run in the release gate.")
