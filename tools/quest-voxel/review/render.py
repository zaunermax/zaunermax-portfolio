"""Review renders. blender -b -P review/render.py -- <scene.json> [<scene.json> ...]
Each scene JSON may carry "views": [0, 90, 180, 270]; output review/out/<stem>_<view>.png.
A view rotates the whole layout about the origin (= orbiting the game camera)."""
import importlib, json, math, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from voxkit import REGISTRY
for f in sorted((ROOT / "assets").glob("*.py")):
    try:
        importlib.import_module(f"assets.{f.stem}")
    except Exception as e:
        print("skip", f.name, e)
from voxkit.preview import render_scene

def rotated(scene, deg):
    t = math.radians(deg)
    out = dict(scene)
    out["placements"] = []
    for p in scene["placements"]:
        q = dict(p)
        x, z = p.get("x", 0), p.get("z", 0)
        q["x"] = x * math.cos(t) + z * math.sin(t)
        q["z"] = -x * math.sin(t) + z * math.cos(t)
        q["rotation"] = p.get("rotation", 0) + deg
        out["placements"].append(q)
    if deg % 360:
        out.pop("floor", None)
        fl = scene.get("floor")
        if fl:
            x0, z0, x1, z1 = fl
            pts = [(x, z) for x in range(x0, x1) for z in range(z0, z1)]
            rp = [(round(x * math.cos(t) + z * math.sin(t)), round(-x * math.sin(t) + z * math.cos(t))) for x, z in pts]
            xs, zs = [p[0] for p in rp], [p[1] for p in rp]
            out["floor"] = [min(xs), min(zs), max(xs) + 1, max(zs) + 1]
    return out

args = sys.argv[sys.argv.index("--") + 1:]
for path in args:
    scene = json.loads(Path(path).read_text())
    for view in scene.get("views", [0]):
        dst = ROOT / "review/out" / f"{Path(path).stem}_{view}.png"
        render_scene(REGISTRY, rotated(scene, view), dst)
        print("wrote", dst)
