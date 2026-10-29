"""Compare tile-boundary cross-sections of connect pieces (occupancy + base colour)."""
import sys, importlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from voxkit import REGISTRY
for f in ("desks","big_furniture","furniture"): importlib.import_module(f"assets.{f}")
def model(id, turns=0):
    m = REGISTRY[id].parts[0].model
    return m.rotate(turns) if turns else m
def face(m, x):
    return {(y, z): m.cells[(x, y, z)] for (xx, y, z) in m.cells if xx == x}
def name(v): return getattr(v.colour, "name", None) or str(v.colour)
def cmp(a, b, label):
    ea, wb = face(a, 7), face(b, -8)
    occ = set(ea) ^ set(wb)
    col = [k for k in set(ea) & set(wb) if (name(ea[k]), ea[k].material) != (name(wb[k]), wb[k].material)]
    print(f"{label:55s} occupancy-diff={len(occ):3d} colour-diff={len(col):3d}" + (f"  e.g. occ {sorted(occ)[:6]} col {[(k, name(ea[k]), name(wb[k])) for k in sorted(col)[:3]]}" if occ or col else ""))
# rotate(2) = 180°
pairs = [("desk_end_l",0,"desk_mid",0),("desk_mid",0,"desk_end_r",0),("desk_end_l",0,"desk_end_r",0),
 ("sofa_end_l",0,"sofa_mid",0),("sofa_mid",0,"sofa_end_r",0),("sofa_corner",0,"sofa_mid",0),("sofa_corner",0,"sofa_end_r",0),
 ("counter_end",0,"counter_mid",0),("counter_mid",0,"counter_sink",0),("counter_mid",0,"counter_end",2),("counter_corner",0,"counter_mid",0),
 ("meeting_end",0,"meeting_mid",0),("meeting_mid",0,"meeting_end",2),("planter_end",0,"planter_mid",0),("planter_mid",0,"planter_end",2),
 ("bookshelf",0,"bookshelf",0),("stage_block",0,"stage_block",0),("stage_block",0,"stage_block",1)]
for a, ta, b, tb in pairs:
    cmp(model(a, ta), model(b, tb), f"{a}{'@'+str(ta*90) if ta else ''} -> {b}{'@'+str(tb*90) if tb else ''}")
# corner south seam vs a mid rotated so its west edge faces north: compare corner z=7 face with rotated mid z=-8 face
def zface(m, z): return {(x, y): m.cells[(x, y, zz)] for (x, y, zz) in m.cells if zz == z}
for c, mid, t in [("sofa_corner","sofa_mid",1),("sofa_corner","sofa_mid",3),("counter_corner","counter_mid",1),("counter_corner","counter_mid",3)]:
    a, b = zface(model(c), 7), zface(model(mid, t), -8)
    occ = set(a) ^ set(b)
    col = [k for k in set(a) & set(b) if name(a[k]) != name(b[k])]
    print(f"{c} south -> {mid}@{t*90} north".ljust(55), f"occupancy-diff={len(occ):3d} colour-diff={len(col):3d}", sorted(occ)[:8], [(k, name(a[k]), name(b[k])) for k in sorted(col)[:4]])
