from voxkit import Model, register


def leaf():
    """Small lobed leaf in XZ, rising away from the stem. Notches read from above."""
    m = Model("leaf")
    widths = (1, 2, 3, 3, 3, 2, 1)
    for z, width in enumerate(widths):
        y = z // 3
        for x in range(-width, width + 1):
            if z == 3 and abs(x) == 3:
                continue
            c = "leaf_light" if x == 0 else "leaf" if x > 0 else "leaf_dark"
            m.set(x, y, z, c)
            if z and z % 3 == 0:
                m.set(x, y - 1, z, "leaf_dark")
    return m


@register("plant_monstera", "plants", tags=("plant",))
def monstera():
    m = Model("monstera")
    m.box((-3, 0, -3), (3, 1, 3), "coral_dark")
    m.box((-4, 1, -4), (4, 6, 4), "coral")
    m.box((-4, 5, -4), (4, 6, 4), "cream")
    m.box((-3, 5, -3), (3, 6, 3), "soil")
    m.box((-1, 6, -1), (1, 17, 1), "leaf_dark")
    for turns, offset in [(0, (1, 10, 1)), (1, (1, 13, -1)),
                           (2, (-1, 16, -1)), (3, (-1, 12, 0)), (0, (-2, 18, 0))]:
        m.line((0, 7, 0), offset, "leaf_dark")
        m.stamp(leaf().rotate(turns), offset)
    for x in (-3, 0, 3):
        m.set(x, 2, 3, "coral_dark")
    return m
