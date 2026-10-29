"""Shared cross-section guarantees rows and 180° pods meet at tile boundaries."""
from voxkit import Model, register


def desk(left=False, right=False):
    m = Model("desk")
    m.box((-8, 10, -8), (8, 11, 8), "wood_dark")
    m.box((-8, 11, -8), (8, 12, 8), "wood")
    # Honey front lip and sparse grain: all variants use exactly the same top.
    m.box((-8, 11, 7), (8, 12, 8), "wood_light")
    for x, z, length in [(-6, -3, 3), (1, 3, 4), (-3, 5, 2), (4, -5, 3)]:
        m.line((x, 11, z), (x + length - 1, 11, z), "wood_light")
    # Divider sits entirely inside its own tile; opposite rows meet back to back.
    m.box((-8, 12, -8), (8, 17, -7), "teal")
    m.box((-8, 16, -8), (8, 17, -7), "teal_light")
    for x in (-6, -2, 2, 6):
        m.set(x, 13, -8, "teal_dark")
    for west, enabled in [(True, left), (False, right)]:
        if not enabled:
            continue
        x = -7 if west else 5
        for z in (-6, 5):
            m.box((x, 0, z), (x + 2, 10, z + 2), "metal")
            m.box((x, 0, z), (x + 2, 1, z + 2), "ink")
        m.box((x, 3, -4), (x + 2, 4, 5), "metal_light")
    return m


@register("desk_single", "desks", tags=("connect", "standalone"), budget=6000)
def single():
    return desk(True, True)


@register("desk_end_l", "desks", tags=("connect", "west-end"), budget=6000)
def left():
    return desk(True, False)


@register("desk_mid", "desks", tags=("connect", "middle"), budget=6000)
def middle():
    return desk()


@register("desk_end_r", "desks", tags=("connect", "east-end"), budget=6000)
def right():
    return desk(False, True)
