from voxkit import Model, register


@register("office_chair", "seating", tags=("seat",), budget=3000)
def chair():
    m = Model("chair")
    # Chunky four-spoke caster base; all wheels touch the floor.
    m.box((-1, 1, -1), (1, 6, 1), "metal")
    m.box((-5, 1, -1), (5, 2, 1), "metal_light")
    m.box((-1, 1, -4), (1, 2, 5), "metal_light")
    for x, z in [(-5, -1), (3, -1), (-1, -4), (-1, 3)]:
        m.box((x, 0, z), (x + 2, 1, z + 2), "ink")
    m.box((-5, 5, -4), (5, 6, 5), "teal_dark")
    m.box((-5, 6, -3), (5, 7, 4), "teal")
    m.box((-4, 6, 4), (4, 7, 5), "teal_light")
    m.box((-2, 6, -4), (2, 10, -3), "metal")
    m.box((-4, 9, -5), (4, 14, -3), "teal_dark")
    m.box((-3, 14, -5), (3, 15, -3), "teal")
    m.box((-3, 10, -3), (3, 14, -2), "teal")
    m.box((-3, 13, -3), (3, 14, -2), "teal_light")
    for x in (-5, 4):
        m.box((x, 7, 0), (x + 1, 10, 1), "metal")
        m.box((x, 9, -1), (x + 1, 10, 3), "ink")
    for x in (-2, 1):
        m.set(x, 11, -3, "teal_dark")
    return m


def shelf(variant=False):
    m = Model("bookshelf")
    # Same continuous structure in both variants; all book detail stays off joins.
    m.box((-8, 1, -6), (8, 32, 1), "wood_dark")
    m.box((-1, 1, -5), (1, 32, 3), "wood")
    for y in (1, 8, 15, 23, 31):
        m.box((-8, y, -5), (8, y + 1, 5), "wood")
        m.box((-8, y, 4), (8, y + 1, 5), "wood_light")
    for x in (-6, 4):
        m.box((x, 0, -4), (x + 2, 1, 4), "metal")
    colours = ["teal", "coral", "mustard", "lilac", "sage"]
    for row, base in enumerate((2, 9, 16, 24)):
        for n, x in enumerate((-7, -5, -3, 1, 3, 5)):
            height = (4, 5, 4, 3, 5, 4)[(n + row + 2 * variant) % 6]
            c = colours[(n + row * 2 + 3 * variant) % len(colours)]
            m.box((x, base, -4), (x + 2, base + height, 3), c)
            m.set(x, base + 1, 2, "cream")
    if variant:
        m.box((-7, 16, -4), (-1, 21, 3), "teal_dark")
        m.box((-6, 18, 2), (-2, 19, 3), "cream")
        m.box((1, 24, -4), (7, 27, 3), "coral")
        m.box((1, 27, -4), (7, 28, 3), "cream")
    else:
        m.box((1, 2, -4), (7, 7, 3), "cream")
        m.box((2, 4, 2), (6, 5, 3), "coral")
        m.set(4, 4, 2, "wood_dark")
    return m


@register("bookshelf", "shelves", tags=("connect", "books"), budget=6000)
def bookshelf():
    return shelf()


@register("bookshelf_b", "shelves", tags=("connect", "books"), budget=6000)
def bookshelf_b():
    return shelf(True)
