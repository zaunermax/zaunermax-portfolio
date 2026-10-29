"""Exposed voxel faces, CCW winding, flat normals and per-cell deterministic colour."""
from .palette import linear
from .slots import Slot

# Each tuple is outward normal followed by four CCW corners in game axes.
FACES = (
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((-1, 0, 0), ((0, 0, 1), (0, 1, 1), (0, 1, 0), (0, 0, 0))),
    ((0, 1, 0), ((0, 1, 1), (1, 1, 1), (1, 1, 0), (0, 1, 0))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 0, 1), ((1, 0, 1), (1, 1, 1), (0, 1, 1), (0, 0, 1))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
)


def faces(model, pivot=(0, 0, 0), encoded=False):
    for p, voxel in sorted(model.cells.items()):
        slot = voxel.colour.index if isinstance(voxel.colour, Slot) else 0
        rgb = voxel.colour.multiplier(p, model.seed) if encoded and slot else linear(voxel.colour.rgb(p, model.seed))
        for normal, corners in FACES:
            if model.decal and normal != (0, 0, 1):
                continue
            neighbor = model.cells.get(tuple(p[i] + normal[i] for i in range(3)))
            if neighbor:
                # At an opaque/glass boundary keep ONLY the opaque surface. Removing
                # both produces holes through glass; keeping both produces z-fighting.
                if neighbor.material != "voxel_glass" or voxel.material == "voxel_glass":
                    continue
            verts = [tuple((p[i] + c[i] - pivot[i]) / 16 for i in range(3)) for c in corners]
            if model.decal:
                verts = [(x, y, z + 1/16384) for x, y, z in verts]
            face = (verts, normal, (*rgb, 1.0), voxel.material)
            yield (*face, slot) if encoded else face
