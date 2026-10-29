"""Chunky, connected foliage with a shared three-green palette."""
from voxkit import Model, register


def pot(m, half=3, height=5, colour="coral"):
    m.box((-half + 1, 0, -half + 1), (half - 1, 1, half - 1), "coral_dark" if colour == "coral" else "wood_dark")
    m.box((-half, 1, -half), (half, height, half), colour)
    m.box((-half, height - 1, -half), (half, height, half), "cream")
    m.box((-half + 1, height - 1, -half + 1), (half - 1, height, half - 1), "soil")
    for x in range(-half + 1, half, 3):
        m.set(x, 2, half - 1, "wood_light" if colour == "wood" else "coral_dark")
    return m


def crown(m, center, rx=3, ry=2, rz=3):
    """Filled stepped leaf cluster with coherent dark underside and light upper lobe."""
    cx, cy, cz = center
    for y in range(-ry, ry + 1):
        inset = 1 if abs(y) == ry else 0
        for x in range(-rx + inset, rx + 1 - inset):
            for z in range(-rz + inset, rz + 1 - inset):
                if abs(x) == rx and abs(z) == rz:
                    continue
                c = "leaf_dark" if y < 0 else "leaf"
                if y == ry and x <= 0:
                    c = "leaf_light"
                m.set(cx + x, cy + y, cz + z, c)


@register("plant_fiddle", "plants", tags=("plant",))
def fiddle():
    m = pot(Model("fiddle"), 3, 5, "wood")
    m.box((-1, 5, -1), (1, 19, 1), "wood_dark")
    for center, rx, rz in [((-3, 10, 0), 3, 2), ((2, 13, 1), 3, 2),
                            ((-2, 16, -1), 3, 2), ((1, 19, 0), 2, 2)]:
        m.line((0, center[1], 0), center, "leaf_dark")
        crown(m, center, rx, 1, rz)
    return m


@register("plant_snake", "plants", tags=("plant",))
def snake():
    m = pot(Model("snake"), 4, 5)
    for x, z, height in [(-2, -1, 15), (1, -2, 18), (-1, 1, 13), (2, 1, 15)]:
        m.box((x, 5, z), (x + 2, height, z + 1), "leaf_dark")
        m.box((x, 7, z), (x + 1, height - 1, z + 1), "leaf_light")
        m.set(x, height - 1, z, None)
        for y in range(7, height - 2, 3):
            m.set(x + 1, y, z, "leaf")
    return m


@register("plant_cactus", "plants", tags=("plant",))
def cactus():
    m = pot(Model("cactus"), 4, 5)
    m.box((-2, 5, -2), (2, 17, 2), "leaf")
    m.box((-1, 17, -1), (1, 18, 1), "leaf_light")
    m.box((-5, 9, -1), (-2, 11, 1), "leaf_dark")
    m.box((-5, 10, -1), (-3, 14, 1), "leaf")
    m.box((2, 11, -1), (5, 13, 1), "leaf")
    m.box((3, 12, -1), (5, 16, 1), "leaf_light")
    for y in (7, 10, 13, 16):
        m.set(0, y, 1, "leaf_light")
    m.box((-1, 18, -1), (1, 19, 1), "coral")
    m.set(0, 18, 0, "mustard")
    return m


@register("plant_ficus", "plants", tags=("plant", "tree"))
def ficus():
    m = pot(Model("ficus"), 4, 6, "wood")
    m.box((-1, 6, -1), (1, 28, 1), "wood_dark")
    for center, rx, ry, rz in [((-3, 23, 0), 3, 2, 3), ((3, 26, 0), 3, 2, 3),
                              ((-2, 29, -1), 3, 2, 3), ((1, 32, 0), 3, 2, 3)]:
        m.line((0, 20, 0), center, "wood_dark")
        crown(m, center, rx, ry, rz)
    # Three tiny coral berries and one sunlit tip, attached to the leaf canopy.
    for x, y, z in [(-3, 31, 1), (4, 28, 1), (0, 34, 1)]:
        m.set(x, y, z, "coral")
    m.set(1, 34, 0, "leaf_light")
    return m


@register("plant_hanging", "plants", tags=("plant", "stand"))
def hanging():
    m = Model("hanging-plant")
    m.box((-4,0,-4),(4,1,-2),"metal")
    m.box((-4,0,-2),(-3,1,4),"metal")
    m.box((3,0,-2),(4,1,4),"metal")
    m.box((-1,1,-4),(0,29,-3),"metal_light")
    m.box((-1,28,-3),(0,30,3),"metal")
    # Downturned hook and bright, thin chain clearly visible above the leaves.
    m.box((-1,26,2),(0,29,3),"metal_light")
    m.box((0,25,2),(1,27,3),"metal")
    m.box((0,22,2),(1,26,3),"cream")
    m.box((-2,16,0),(3,17,5),"coral_dark")
    m.box((-3,17,-1),(4,20,6),"coral")
    m.box((-3,19,-1),(4,20,6),"cream")
    crown(m,(0,20,2),3,1,3)
    for x,z,bottom in [(-3,2,10),(3,3,12),(0,5,7)]:
        m.box((x,bottom,z),(x+1,21,z+1),"leaf_dark")
        for y in range(bottom+1,20,3):
            m.box((x-1,y,z),(x+2,y+2,z+1),"leaf")
            m.set(x,y+1,z+1,"leaf_light")
    m.set(-1,28,1,"cream")
    return m


@register("plant_desk", "plants", footprint=(.375, .375), tags=("plant", "desktop"))
def desk():
    m = pot(Model("desk-succulent"), 2, 3)
    m.box((-1, 3, -1), (1, 6, 1), "leaf")
    for x, z in [(-2, 0), (1, -1), (0, -2), (-1, 1)]:
        m.box((x, 3, z), (x + 1, 5, z + 1), "leaf_light")
    m.set(0, 5, 0, "lilac").set(0, 6, 0, "mustard")
    return m


@register("plant_pothos_shelf", "plants", footprint=(.75, .75), tags=("plant", "desktop", "shelf"))
def pothos():
    # Bottom at zero: trailing leaves drape over a tall cachepot, never below the shelf.
    m = pot(Model("pothos"), 3, 7, "wood")
    crown(m, (0, 7, 0), 3, 1, 3)
    for x, z, bottom in [(-3, 1, 2), (3, 0, 3), (0, 3, 1)]:
        m.box((x, bottom, z), (x + 1, 8, z + 1), "leaf_dark")
        for y in range(bottom, 7, 2):
            m.box((x - 1, y, z), (x + 2, y + 1, z + 1), "leaf")
            m.set(x, y + 1, z, "leaf_light")
    m.set(-1, 8, 0, "lilac").set(-2, 8, 0, "cream")
    return m
