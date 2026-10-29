"""Small seating and desk dressing; +Z fronts, integer voxel details."""
from voxkit import Model, register
from assets.props import mug, duck_model, glints, screen_back


def rounded(m, x0, y0, z0, x1, y1, z1, colour, cut=1):
    m.box((x0 + cut, y0, z0), (x1 - cut, y1, z1), colour)
    m.box((x0, y0, z0 + cut), (x1, y1, z1 - cut), colour)
    return m


def legs(m, height, spread=4, colour="wood"):
    for x in (-spread, spread - 1):
        for z in (-spread, spread - 1):
            m.box((x, 0, z), (x + 2, height, z + 2), colour)
            m.box((x, 0, z), (x + 2, 1, z + 2), "wood_dark" if colour == "wood" else "ink")


@register("gaming_chair", "seating", tags=("seat",))
def gaming_chair():
    m = Model("gaming-chair")
    m.box((-1, 1, -1), (1, 6, 1), "metal")
    m.box((-5, 1, -1), (5, 2, 1), "metal_light")
    m.box((-1, 1, -5), (1, 2, 5), "metal_light")
    for x, z in [(-5, -1), (3, -1), (-1, -5), (-1, 3)]:
        m.box((x, 0, z), (x + 2, 1, z + 2), "ink")
    rounded(m, -5, 5, -4, 5, 7, 5, "navy")
    m.box((-3, 6, -3), (3, 7, 5), "lilac")
    rounded(m, -5, 7, -5, 5, 17, -2, "ink")
    m.box((-3, 8, -3), (3, 16, -2), "lilac")
    m.box((-2, 16, -4), (2, 18, -2), "lilac")
    m.box((-2, 9, -2), (2, 11, -1), "navy")
    for x in (-2, 1):
        m.set(x, 14, -3, "ink")
    for x in (-5, 4):
        m.box((x, 7, 0), (x + 1, 10, 1), "metal")
        m.box((x, 9, -1), (x + 1, 10, 4), "navy")
    # Small cheerful badge on the headrest.
    m.set(0, 16, -3, "mustard").set(1, 16, -3, "cream")
    return m


@register("armchair", "seating", tags=("seat",))
def armchair():
    m = Model("armchair")
    legs(m, 3, 5)
    rounded(m, -7, 2, -6, 7, 5, 7, "coral_dark")
    rounded(m, -5, 5, -4, 5, 7, 7, "coral")
    rounded(m, -7, 4, -7, 7, 13, -3, "coral_dark")
    m.box((-5, 7, -3), (5, 12, -2), "coral")
    m.box((-5, 12, -5), (5, 13, -2), "coral")
    for x in (-7, 5):
        rounded(m, x, 4, -4, x + 2, 10, 6, "coral", 0)
        m.box((x, 9, -3), (x + 2, 10, 5), "wood_light")
    for x in (-2, 2):
        m.set(x, 9, -3, "coral_dark")
    m.box((-3, 7, -2), (1, 9, 0), "mustard")
    return m


def beanbag(colour, dark, light):
    m = Model("beanbag")
    # Broad, quiet panels: a scooped seat between low bolsters and a tall back.
    # Explicit terraces avoid the noisy one-cell spikes of a rounded height field.
    for x in range(-7, 7):
        for z in range(-6, 6):
            ax = abs(x + .5)
            if ax > 5 and (z < -4 or z > 3): continue
            if z < -4: height = 10
            elif z < -2: height = 11
            elif z == -2: height = 9
            elif ax > 4: height = 7
            elif z == -1: height = 6
            elif z < 4: height = 4
            else: height = 5
            for y in range(height):
                m.set(x, y, z, dark if y == 0 else colour)
    # One-voxel stitched seam travels from the back over each side bolster.
    m.line((-4, 10, -3), (3, 10, -3), light)
    for x in (-5, 4):
        m.line((x, 6, 0), (x, 6, 3), light)
    m.box((-4, 3, 0), (4, 4, 1), dark)
    m.box((-3, 4, 5), (3, 5, 6), light)
    m.set(4, 2, 5, "cream")
    return m


@register("beanbag_teal", "seating", tags=("seat", "lounge"))
def beanbag_teal():
    return beanbag("teal", "teal_dark", "teal_light")


@register("beanbag_coral", "seating", tags=("seat", "lounge"))
def beanbag_coral():
    return beanbag("coral", "coral_dark", "wood_light")


def stool_cushion(m, y, base, fabric, highlight):
    # Circle sampled about the half-cell centre: reflection AND 90-degree symmetry.
    # Repeated widths make deliberate steps rather than a sawtooth diagonal.
    widths = (4, 8, 8, 10, 10, 10, 10, 8, 8, 4)
    disc = {(x, z) for z, width in zip(range(-5, 5), widths)
            for x in range(-width // 2, width // 2)}
    for z, width in zip(range(-5, 5), widths):
        m.box((-width // 2, y - 1, z), (width // 2, y, z + 1), base)
        m.box((-width // 2, y, z), (width // 2, y + 1, z + 1), fabric)
    for x, z in disc:
        if any((x + dx, z + dz) not in disc for dx, dz in ((1,0),(-1,0),(0,1),(0,-1))):
            m.set(x, y, z, highlight)


@register("stool", "seating", footprint=(.75, .75), tags=("seat",))
def stool():
    m = Model("stool")
    legs(m, 6, 4)
    stool_cushion(m, 6, "wood_dark", "mustard", "wood_light")
    return m


@register("bar_stool", "seating", footprint=(.75, .75), tags=("seat", "counter"))
def bar_stool():
    m = Model("bar-stool")
    legs(m, 10, 4, "metal")
    for z in (-4, 4):
        m.box((-4, 3, z), (5, 4, z + 1), "metal_light")
    stool_cushion(m, 10, "teal_dark", "teal", "teal_light")
    return m


@register("folding_chair", "seating", tags=("seat",))
def folding_chair():
    m = Model("folding-chair")
    for x in (-5, 4):
        for y in range(7):
            z = 3 - y
            m.box((x, y, z), (x + 1, y + 1, z + 2), "metal")
            m.box((x, y, -z - 1), (x + 1, y + 1, -z + 1), "metal")
        m.box((x, 6, -4), (x + 1, 14, -3), "metal")
    rounded(m, -5, 6, -4, 5, 7, 5, "sage")
    m.box((-4, 10, -4), (4, 14, -3), "sage")
    m.box((-3, 13, -4), (3, 14, -3), "cream")
    return m


@register("bike", "furniture", footprint=(2, .75), tags=("transport",))
def bike():
    m = Model("bike")

    def line(a, b, colour):
        # Stair-step diagonals keep the thin steel frame face-connected.
        steps = max(abs(b[i] - a[i]) for i in range(3))
        previous = a
        m.set(*a, colour)
        for n in range(1, steps + 1):
            target = tuple(round(a[i] + (b[i] - a[i]) * n / steps) for i in range(3))
            cursor = list(previous)
            for axis in range(3):
                while cursor[axis] != target[axis]:
                    cursor[axis] += 1 if target[axis] > cursor[axis] else -1
                    m.set(*cursor, colour)
            previous = target
        return m
    for cx in (-9, 9):
        for x in range(cx - 5, cx + 6):
            for y in range(11):
                radius = (x - cx) ** 2 + (y - 5) ** 2
                if 15 <= radius <= 29:
                    m.box((x, y, -1), (x + 1, y + 1, 2), "metal")
                    # Cream outer sidewalls survive the steep camera; grey centre tread.
                    m.set(x, y, -1, "cream").set(x, y, 1, "wood_light")
        line((cx - 4, 5, 0), (cx + 4, 5, 0), "metal_light")
        line((cx, 1, 0), (cx, 9, 0), "metal_light")
    for a, b in [((-9, 5, 1), (-3, 11, 1)), ((-3, 11, 1), (1, 5, 1)),
                 ((1, 5, 1), (-9, 5, 1)), ((-3, 11, 1), (6, 11, 1)),
                 ((6, 11, 1), (1, 5, 1)), ((6, 11, 1), (9, 5, 1))]:
        line(a, b, "teal_light")
    m.box((-4, 10, 0), (-2, 14, 2), "metal")
    m.box((-6, 13, -1), (-1, 14, 3), "coral_dark")
    line((7, 10, 0), (5, 16, 0), "metal")
    m.box((4, 15, -3), (6, 16, 4), "metal_light")
    m.box((4, 15, 3), (7, 16, 4), "coral")
    m.box((0, 4, 1), (2, 6, 3), "metal")
    m.box((1, 4, 2), (4, 5, 4), "wood_dark")
    line((0, 4, 0), (2, 0, 3), "metal")
    m.set(6, 14, 0, "led", "voxel_glow")
    m.set(-6, 12, 1, "ui_coral")
    m.set(9, 8, 0, "cream")
    # Handlebar basket sits ahead of the front fork, leaving both wheel arcs visible.
    m.box((6, 11, -3), (11, 14, 2), "wood")
    m.box((6, 13, -3), (11, 14, 2), "wood_light")
    m.box((7, 13, -2), (10, 14, 1), "soil")
    for x in (6, 8, 10): m.set(x, 12, 1, "wood_dark")
    m.box((8, 14, -1), (9, 17, 0), "leaf")
    m.box((7, 14, -1), (10, 16, 0), "leaf_light")
    m.set(8, 15, 0, "leaf").set(8, 16, -1, "lilac")
    return m


@register("coat_rack", "furniture", tags=("entry",))
def coat_rack():
    m = Model("coat-rack")
    m.box((-5, 0, -1), (5, 1, 1), "wood_dark")
    m.box((-1, 0, -5), (1, 1, 5), "wood_dark")
    m.box((-1, 1, -1), (1, 24, 1), "wood")
    m.box((-5, 20, -1), (5, 22, 1), "wood")
    for x in (-5, 3):
        m.box((x, 21, -1), (x + 2, 24, 1), "wood_light")
    m.box((2, 12, 0), (5, 22, 2), "lilac")
    m.box((2, 12, 0), (5, 14, 2), "cream")
    m.box((-4, 16, 0), (-2, 21, 2), "teal")
    return m


@register("floor_lamp", "furniture", tags=("light",))
def floor_lamp():
    m = Model("floor-lamp")
    rounded(m, -4, 0, -4, 4, 1, 4, "metal", 2)
    m.box((-1, 1, -1), (1, 26, 1), "metal_light")
    # Lilac tapered fabric shade, recessed dark opening, warm underside.
    for y, half in [(24,5),(25,5),(26,4),(27,4),(28,3),(29,3)]:
        rounded(m,-half,y,-half,half,y+1,half,"lilac")
    m.box((-2,28,-2),(2,30,2),None)
    m.box((-2,28,-2),(2,29,2),"navy")
    rounded(m,-4,23,-4,4,24,4,"led")
    for x,z in [(-3,0),(2,0),(0,-3),(0,2)]:
        m.set(x,23,z,"led","voxel_glow")
    glints(m,(-1,18,0),(-2,0,2))
    return m


def bin_body(m, x, colour):
    m.box((x, 0, -3), (x + 4, 6, 3), "metal")
    m.box((x, 5, -3), (x + 4, 7, 3), colour)
    m.box((x + 1, 6, -1), (x + 3, 7, 1), "ink")
    m.box((x + 1, 2, 2), (x + 3, 4, 3), "cream")
    m.set(x + 1, 3, 2, colour)


@register("trash_bin", "furniture", footprint=(.5, .5))
def trash_bin():
    m = Model("trash-bin")
    rounded(m, -3, 0, -3, 3, 1, 3, "ink")
    rounded(m, -4, 1, -4, 4, 7, 4, "metal")
    m.box((-3, 6, -3), (3, 7, 3), "ink")
    m.box((-2, 6, -1), (1, 7, 1), "cream")
    for x in (-2, 1):
        m.box((x, 2, 3), (x + 1, 5, 4), "metal_light")
    return m


@register("recycle_bins", "furniture", tags=("recycling",))
def recycle_bins():
    m = Model("recycle-bins")
    for x, colour in [(-7, "teal"), (-2, "mustard"), (3, "coral")]:
        bin_body(m, x, colour)
    m.box((-7, 0, -3), (7, 1, 3), "navy")
    return m


@register("umbrella_stand", "furniture", footprint=(.75, .75), tags=("entry",))
def umbrella_stand():
    m = Model("umbrella-stand")
    rounded(m, -3, 0, -3, 3, 8, 3, "teal")
    m.box((-2, 7, -2), (2, 8, 2), "ink")
    m.box((-1, 7, -1), (1, 12, 1), "mustard")
    m.box((0, 12, 0), (1, 16, 1), "wood_dark")
    m.box((0, 15, 0), (3, 16, 1), "wood_dark")
    m.set(2, 14, 0, "wood_dark")
    m.box((-2, 8, 1), (-1, 14, 2), "coral")
    for x in (-2, 1):
        m.box((x, 2, 2), (x + 1, 6, 3), "teal_light")
    return m


@register("dog_bed", "furniture", tags=("pet",))
def dog_bed():
    m = Model("dog-bed")
    rounded(m, -7, 0, -6, 7, 3, 6, "teal_dark", 2)
    rounded(m, -6, 2, -5, 6, 4, 5, "teal", 2)
    rounded(m, -4, 2, -3, 4, 4, 4, "cream")
    m.box((-3, 3, 3), (3, 4, 5), "cream")
    m.box((-2, 4, -1), (2, 5, 0), "wood_light")
    for x in (-3, 1):
        m.box((x, 4, -2), (x + 2, 5, 1), "wood_light")
    return m


@register("rug_round", "rugs", footprint=(2, 2), tags=("floor",))
def rug_round():
    m = Model("round-rug")
    for x in range(-14, 14):
        for z in range(-14, 14):
            r2 = (x + .5) ** 2 + (z + .5) ** 2
            if r2 <= 14 ** 2:
                c = "teal_dark" if r2 > 12.5 ** 2 else "cream" if r2 > 11.5 ** 2 else "teal"
                if abs(x + .5) + abs(z + .5) < 6:
                    c = "teal_light"
                m.set(x, 0, z, c)
    return m


@register("rug_rect", "rugs", footprint=(3, 2), tags=("floor",), budget=6000)
def rug_rect():
    # Broad 40 x 28 textile within its 3 x 2 placement footprint; large-furniture budget.
    m = Model("rect-rug")
    rounded(m, -20, 0, -14, 20, 1, 14, "coral_dark", 2)
    m.box((-18, 0, -12), (18, 1, 12), "wood_light")
    m.box((-17, 0, -11), (17, 1, 11), "coral")
    for x in range(-13, 14, 7):
        for dx in range(-3, 4):
            for z in range(-3 + abs(dx), 4 - abs(dx)):
                m.set(x + dx, 0, z, "cream")
    for x in range(-16, 17, 4):
        m.set(x, 0, -15, "wood_light").set(x, 0, 14, "wood_light")
    return m


@register("monitor", "desktop", footprint=(.75, .375), tags=("desktop", "screen"))
def monitor():
    m = Model("monitor-single")
    m.box((-3, 0, -2), (3, 1, 2), "metal")
    m.box((-1, 1, -1), (1, 4, 0), "metal_light")
    m.box((-6, 3, -1), (6, 11, 1), "ink")
    screen_back(m, -6, 3, -1, 6, 11)
    m.box((-5, 4, 0), (5, 10, 1), "screen", "voxel_glow")
    m.box((-5, 9, 0), (5, 10, 1), "cyan", "voxel_glow")
    for x, y, n, c in [(-4, 7, 4, "ui_coral"), (-3, 6, 5, "cyan"), (-4, 5, 2, "led")]:
        m.line((x, y, 0), (x + n - 1, y, 0), c, "voxel_glow")
    m.set(4, 3, 0, "led", "voxel_glow")
    glints(m,(-5,9,0),(-4,8,0))
    return m


@register("laptop", "desktop", footprint=(.625, .5), tags=("desktop", "screen"))
def laptop():
    m = Model("laptop")
    m.box((-5, 0, -4), (5, 1, 4), "metal_light")
    m.box((-5, 1, -4), (5, 8, -3), "navy")
    screen_back(m, -5, 1, -4, 5, 8)
    m.box((-4, 2, -3), (4, 7, -2), "screen", "voxel_glow")
    m.box((-3, 5, -3), (1, 6, -2), "cyan", "voxel_glow")
    m.box((-2, 3, -3), (3, 4, -2), "ui_coral", "voxel_glow")
    for x in range(-4, 4, 2):
        for z in (-1, 1):
            m.set(x, 0, z, "navy")
    m.box((-1, 0, 2), (2, 1, 3), "cream")
    glints(m,(-4,6,-3),(-3,5,-3))
    return m


@register("keyboard_mouse", "desktop", footprint=(.875, .375), tags=("desktop",))
def keyboard_mouse():
    m = Model("keyboard-mouse")
    m.box((-7, 0, -2), (3, 1, 2), "metal")
    for x in range(-6, 2, 2):
        for z in (-1, 1):
            m.set(x, 0, z, "cream")
    m.set(-6, 0, -1, "coral")
    m.box((-4, 0, 1), (0, 1, 2), "cream")
    rounded(m, 4, 0, -2, 7, 1, 2, "cream")
    m.set(5, 0, -1, "teal")
    return m


@register("mug_boss", "desktop", footprint=(.375, .25), tags=("desktop", "coffee"))
def mug_boss():
    m = mug()
    coffee = m.cells[(-1, 1, 0)].colour
    for p, v in list(m.cells.items()):
        if v.colour != coffee:
            m.set(*p, "cream")
    m.set(-1, 0, 1, "navy").set(-1, 1, 1, "mustard")
    return m


@register("rubber_duck", "desktop", footprint=(.375, .375), tags=("desktop", "toy"))
def rubber_duck():
    m = duck_model()
    return m


@register("desk_lamp", "desktop", footprint=(.625, .5), tags=("desktop", "light"))
def desk_lamp():
    m = Model("desk-lamp")
    rounded(m, -4, 0, -2, 1, 1, 3, "teal_dark")
    # Offset shade and rear elbow preserve daylight between the stem and shade at 50 degrees.
    m.box((-3, 1, -1), (-2, 5, 0), "metal_light")
    m.box((-4, 4, -1), (-2, 8, 0), "metal_light")
    m.box((-4, 7, -1), (-2, 10, 0), "metal")
    m.box((-3, 9, -1), (3, 10, 0), "metal")
    m.set(-3, 7, 0, "mustard")
    m.box((1, 9, -1), (3, 11, 2), "teal_dark")
    m.box((0, 8, 0), (4, 10, 3), "teal")
    rounded(m, 0, 7, -1, 5, 8, 4, "teal")
    m.box((1, 6, 0), (4, 7, 3), "led", "voxel_glow")
    glints(m, (-4, 6, -1), (1, 9, 2))
    m.set(-2, 0, 1, "mustard")
    return m


@register("paper_stack", "desktop", footprint=(.5, .5), tags=("desktop",))
def paper_stack():
    m = Model("paper-stack")
    m.box((-2, 0, -3), (3, 1, 3), "wood_light")
    m.box((-3, 1, -3), (2, 2, 3), "cream")
    m.line((-2, 1, -1), (0, 1, -1), "metal_light")
    m.line((-2, 1, 1), (-1, 1, 1), "metal_light")
    m.set(0, 1, -2, "coral")
    return m


@register("red_stapler", "desktop", footprint=(.375, .5), tags=("desktop",))
def red_stapler():
    m = Model("red-stapler")
    m.box((-1,0,-2),(2,1,3),"metal")
    m.box((-1,1,-2),(2,2,-1),"coral_dark")
    m.box((-1,2,-2),(2,3,2),"coral")
    m.box((0,1,1),(1,2,2),"metal_light")
    glints(m,(0,2,0))
    return m


@register("the_internet", "desktop", footprint=(.5, .375), tags=("desktop", "it-crowd"))
def the_internet():
    m = Model("the-internet")
    m.box((-3, 0, -2), (3, 1, 2), "metal")
    m.box((-1, 1, -1), (1, 2, 1), "metal_light")
    m.box((-4, 2, -2), (4, 6, 2), "ink")
    m.box((-3, 6, -1), (3, 7, 1), "navy")
    m.set(2, 6, 0, "ui_coral", "voxel_glow")
    m.set(2, 5, 1, "ui_coral", "voxel_glow")
    return m


@register("trophy", "desktop", footprint=(.5, .375), tags=("desktop", "award"))
def trophy():
    m = Model("trophy")
    m.box((-2, 0, -2), (2, 1, 2), "wood_dark")
    m.box((-1, 1, -1), (1, 3, 1), "mustard")
    m.box((-2, 3, -1), (2, 6, 2), "mustard")
    m.box((-1, 5, 0), (1, 6, 1), "wood_dark")
    for x in (-3, 2):
        m.box((x, 3, 0), (x + 1, 6, 1), "wood_light")
    m.set(-1, 0, 1, "cream").set(-2, 5, 1, "cream")
    return m


@register("coffee_cup_togo", "desktop", footprint=(.25, .25), tags=("desktop", "coffee"))
def coffee_cup_togo():
    m = Model("takeaway-coffee")
    m.box((0, 0, 0), (2, 1, 2), "cream")
    m.box((-1, 1, -1), (2, 3, 2), "cream")
    m.box((-1, 1, -1), (2, 2, 2), "coral")
    # A one-cell overhang distinguishes the lid from the smaller sleeved body.
    m.box((-2, 3, -2), (2, 4, 2), "wood_light")
    m.set(0, 3, 1, "coffee").set(0, 1, 1, "cream")
    return m


@register("headphones", "desktop", footprint=(.5, .375), tags=("desktop", "audio"))
def headphones():
    m = Model("headphones")
    for x in (-4, 2):
        m.box((x, 0, -1), (x + 2, 4, 2), "navy")
        m.box((x, 1, 1), (x + 2, 3, 2), "lilac")
    m.box((-4, 3, 0), (-3, 6, 1), "metal")
    m.box((3, 3, 0), (4, 6, 1), "metal")
    m.box((-3, 5, 0), (3, 6, 1), "lilac")
    return m


@register("pizza_box", "desktop", footprint=(.75, .75), tags=("desktop", "food"))
def pizza_box():
    m = Model("pizza-box")
    m.box((-5, 0, -5), (5, 2, 5), "wood_light")
    m.box((-5, 1, 4), (5, 2, 5), "coral")
    m.box((-2, 1, 4), (2, 2, 5), "cream")
    for z in range(-3, 3):
        half = (z + 4) // 2
        m.box((-half, 1, z), (half + 1, 2, z + 1), "mustard")
    m.box((-3, 1, 2), (4, 2, 3), "coral_dark")
    for x, z in [(0, -2), (-1, 0), (1, 1)]:
        m.set(x, 1, z, "coral")
    return m


@register("espresso_machine", "desktop", footprint=(.875, .75), tags=("desktop", "counter", "coffee"))
def espresso_machine():
    m = Model("espresso-machine")
    m.box((-6, 0, -4), (6, 2, 5), "navy")
    m.box((-6, 2, -4), (6, 10, -1), "metal")
    m.box((-6, 2, -1), (-4, 9, 3), "coral")
    m.box((4, 2, -1), (6, 9, 3), "coral")
    m.box((-6, 8, -4), (6, 10, 3), "metal_light")
    m.box((-4, 8, 2), (0, 9, 3), "cyan", "voxel_glow")
    m.set(2, 8, 2, "ui_coral", "voxel_glow")
    m.box((-3, 6, 0), (-1, 8, 2), "metal")
    m.box((-3, 6, 1), (-2, 7, 4), "ink")
    m.box((3, 4, 1), (4, 8, 2), "metal_light")
    m.box((-4, 1, 1), (4, 2, 5), "metal_light")
    for x in (-3, -1, 1, 3):
        m.box((x, 1, 2), (x + 1, 2, 4), "metal")
    m.box((-3, 2, 1), (0, 4, 4), "cream")
    m.set(-2, 3, 2, "coffee")
    m.set(0, 3, 2, "cream")
    m.box((-4, 10, -3), (4, 11, 1), "navy")
    m.line((-5, 9, 1), (-3, 9, 1), "cream")
    m.set(-5, 8, 2, "cream").set(5, 9, 0, "cream")
    m.set(3, 5, 1, "cream")
    return m
