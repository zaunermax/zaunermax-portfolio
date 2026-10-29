"""Integer voxel coordinates in GAME axes: X right, Y up, Z front. Boxes are half-open."""
from dataclasses import dataclass
from .palette import colour

MATERIALS = ("voxel", "voxel_glow", "voxel_glass")
REGISTRY = {}


@dataclass(frozen=True)
class Voxel:
    colour: object
    material: str = "voxel"


class Model:
    def __init__(self, seed=""):
        self.cells = {}
        self.seed = seed
        self.decal = False

    def set(self, x, y, z, c, material="voxel"):
        if any(int(v) != v for v in (x, y, z)):
            raise ValueError("Voxel coordinates must be integers")
        if material not in MATERIALS:
            raise ValueError(f"Unknown material {material}")
        p = (int(x), int(y), int(z))
        if c is None:
            self.cells.pop(p, None)
        else:
            self.cells[p] = Voxel(colour(c), material)
        return self

    def box(self, lo, hi, c, material="voxel"):
        for x in range(lo[0], hi[0]):
            for y in range(lo[1], hi[1]):
                for z in range(lo[2], hi[2]):
                    self.set(x, y, z, c, material)
        return self

    fill = box

    def line(self, a, b, c, material="voxel"):
        steps = max(abs(b[i] - a[i]) for i in range(3))
        for n in range(steps + 1):
            p = tuple(round(a[i] + (b[i] - a[i]) * n / max(1, steps)) for i in range(3))
            self.set(*p, c, material)
        return self

    def stamp(self, other, offset=(0, 0, 0)):
        for p, v in other.cells.items():
            self.set(*(p[i] + offset[i] for i in range(3)), v.colour, v.material)
        return self

    def mirror(self, axis="x", plane=0):
        """Return reflected copy across a voxel BOUNDARY plane (0 maps cell 0 to -1)."""
        result = Model(self.seed)
        result.decal = self.decal
        if self.decal and axis == "z":
            raise ValueError("Front-only decals cannot be mirrored through Z")
        index = "xyz".index(axis)
        for p, v in self.cells.items():
            q = list(p)
            q[index] = int(2 * plane - p[index] - 1)
            if q[index] != 2 * plane - p[index] - 1:
                raise ValueError("Mirror must preserve the integer grid")
            result.set(*q, v.colour, v.material)
        return result

    def rotate(self, turns=1):
        """Return copy, positive quarter turns about +Y: front +Z rotates toward +X."""
        result = Model(self.seed)
        if self.decal and turns % 4:
            raise ValueError("Front-only decals cannot be rotated as voxel cells; rotate their node")
        result.decal = self.decal
        for (x, y, z), v in self.cells.items():
            for _ in range(turns % 4):
                x, z = z, -x - 1
            result.set(x, y, z, v.colour, v.material)
        return result


@dataclass
class Part:
    name: str
    model: Model
    pivot: tuple = (0, 0, 0)


@dataclass
class Asset:
    id: str
    family: str
    parts: list
    footprint: tuple = (1, 1)
    wall: bool = False
    tags: tuple = ()
    character: bool = False
    budget: int = 3000

    @property
    def height(self):
        return max(y + 1 for part in self.parts for x, y, z in part.model.cells) / 16

    def manifest(self):
        return dict(footprint=list(self.footprint), height=self.height,
                    wall=self.wall, family=self.family, tags=list(self.tags))


def register(id, family, footprint=(1, 1), wall=False, tags=(), character=False, budget=3000):
    def wrapper(fn):
        if id in REGISTRY:
            raise ValueError(f"Duplicate asset id: {id}")
        result = fn()
        parts = [Part(id, result)] if isinstance(result, Model) else result
        if not parts or any(not p.model.cells for p in parts):
            raise ValueError(f"Empty asset: {id}")
        if len({p.name for p in parts}) != len(parts):
            raise ValueError(f"Duplicate part names: {id}")
        rigs = [{"body", "head", "arm_l", "arm_r", "leg_l", "leg_r"},
                {"body", "head", "tail", "leg_fl", "leg_fr", "leg_bl", "leg_br"},
                {"body", "top"},
                {"body", "rotor_fl", "rotor_fr", "rotor_bl", "rotor_br"},
                {"body", "head", "wing_l", "wing_r", "tail"},
                {"body", "head", "ball"}]
        if character and (set(p.name for p in parts) not in rigs or family != "characters"):
            raise ValueError(f"Invalid character rig/family: {id}")
        bottom = min(y for p in parts for x, y, z in p.model.cells)
        if bottom < 0 or (bottom != 0 and "connect" not in tags):
            raise ValueError(f"Asset {id} must sit at y=0 (unsupported connect spans may sit above it)")
        REGISTRY[id] = Asset(id, family, parts, footprint, wall, tags, character, budget)
        return fn
    return wrapper
