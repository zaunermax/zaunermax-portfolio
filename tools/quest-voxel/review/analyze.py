"""Review helper: bounds vs footprint, centring, floating components, wall back plane."""
import sys, importlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from voxkit import REGISTRY
SKIP = {"cast", "characters"}
for f in sorted((ROOT / "assets").glob("*.py")):
    if f.stem not in SKIP:
        importlib.import_module(f"assets.{f.stem}")

def comps(cells):
    left = set(cells); out = []
    while left:
        s = left.pop(); stack = [s]; comp = {s}
        while stack:
            x, y, z = stack.pop()
            for d in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
                q = (x+d[0], y+d[1], z+d[2])
                if q in left:
                    left.remove(q); comp.add(q); stack.append(q)
        out.append(comp)
    return out

for id, a in sorted(REGISTRY.items()):
    if a.character: continue
    cells = {p for part in a.parts for p in part.model.cells}
    xs = [p[0] for p in cells]; ys = [p[1] for p in cells]; zs = [p[2] for p in cells]
    x0, x1, z0, z1 = min(xs), max(xs)+1, min(zs), max(zs)+1
    fw, fd = a.footprint[0]*16, a.footprint[1]*16
    notes = []
    if a.wall:
        if z0 != 0: notes.append(f"WALL back z={z0} (want 0)")
        if z1 > fd: notes.append(f"depth {z1} > fp {fd}")
        if x1 - x0 > fw: notes.append(f"width {x1-x0} > fp {fw}")
        cx = (x0+x1)/2
        if abs(cx) > .5: notes.append(f"x off-centre {cx}")
    else:
        if x0 < -fw/2 or x1 > fw/2: notes.append(f"X [{x0},{x1}) exceeds fp ±{fw/2}")
        if z0 < -fd/2 or z1 > fd/2: notes.append(f"Z [{z0},{z1}) exceeds fp ±{fd/2}")
        if abs((x0+x1)/2) > 1 or abs((z0+z1)/2) > 1: notes.append(f"bbox centre ({(x0+x1)/2},{(z0+z1)/2})")
    cs = comps(cells)
    if len(cs) > 1:
        grounded = [c for c in cs if min(p[1] for p in c) == 0]
        floating = [c for c in cs if min(p[1] for p in c) > 0]
        if floating:
            desc = ", ".join(f"{len(c)}vx@y{min(p[1] for p in c)}..{max(p[1] for p in c)} x{min(p[0] for p in c)}..{max(p[0] for p in c)} z{min(p[2] for p in c)}..{max(p[2] for p in c)}" for c in sorted(floating, key=len, reverse=True)[:4])
            notes.append(f"{len(cs)} comps, {len(floating)} not touching floor (face-connected): {desc}")
    print(f"{id:20s} fp={a.footprint} bbox x[{x0},{x1}) y[0,{max(ys)+1}) z[{z0},{z1})  " + ("; ".join(notes) if notes else "ok"))
