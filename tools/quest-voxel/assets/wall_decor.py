"""Wall pieces: bottom-centre back origin, every occupied z >= 0."""
from voxkit import Model, register
from assets.props import glints, screen_back


def panel(m, width, height, frame="wood", fill="cream", depth=1):
    half = width // 2
    m.box((-half, 0, 0), (half, height, depth), frame)
    m.box((-half + 1, 1, depth - 1), (half - 1, height - 1, depth), fill)
    return m


@register("wall_clock", "wall", footprint=(.75, .125), wall=True, tags=("wall", "clock"))
def clock():
    m = Model("wall-clock")
    for x in range(-6, 6):
        for y in range(12):
            r2 = (x + .5) ** 2 + (y - 5.5) ** 2
            if r2 <= 36:
                m.set(x, y, 0, "wood_dark" if r2 > 25 else "cream")
    for x, y in [(0, 10), (4, 6), (0, 1), (-5, 6)]:
        m.set(x, y, 0, "navy")
    m.line((0, 5, 1), (0, 8, 1), "navy")
    m.line((0, 5, 1), (3, 5, 1), "navy")
    m.set(0, 5, 1, "coral")
    return m


@register("poster_turn_off_on", "wall", footprint=(.75, .0625), wall=True, tags=("wall", "it-crowd"))
def turn_off_on():
    m = panel(Model("off-on-poster"), 12, 17, "wood_dark", "navy")
    # Oversized universal power glyph, then coral OFF / mint ON switch diagram.
    for x, y in [(-3, 12), (-3, 11), (-3, 10), (-2, 9), (-1, 9), (0, 9), (1, 9),
                 (2, 10), (2, 11), (2, 12)]:
        m.set(x, y, 0, "cream")
    m.box((-1, 12, 0), (0, 15, 1), "cyan")
    m.box((-4, 6, 0), (4, 7, 1), "metal")
    m.box((-4, 5, 0), (-2, 7, 1), "coral")
    m.box((-4, 3, 0), (4, 4, 1), "teal_dark")
    m.box((2, 2, 0), (4, 4, 1), "cyan")
    return m


@register("poster_motivation", "wall", footprint=(.875, .0625), wall=True, tags=("wall", "office"))
def motivation():
    m = panel(Model("motivation-poster"), 14, 18, "wood", "navy")
    # Tiny mountain, sun and summit flag: a quietly ridiculous office aspiration.
    m.box((2, 12, 0), (5, 15, 1), "mustard")
    for x in range(-5, 6):
        height = 10 - abs(x + 1)
        m.box((x, 5, 0), (x + 1, max(6, height), 1), "teal")
        if height >= 9:
            m.set(x, height - 1, 0, "cream")
    m.box((-1, 10, 0), (0, 14, 1), "cream")
    m.box((0, 12, 0), (2, 14, 1), "coral")
    m.box((-4, 3, 0), (4, 4, 1), "cream")
    m.box((-2, 2, 0), (2, 3, 1), "wood_light")
    return m


@register("neon_sign", "wall", footprint=(1.5, .125), wall=True, tags=("wall", "light", "code"))
def neon():
    m = panel(Model("neon-code"), 24, 11, "wood_dark", "navy")
    for a, b in [((-6, 8, 1), (-9, 5, 1)), ((-9, 5, 1), (-6, 2, 1)),
                 ((5, 8, 1), (8, 5, 1)), ((8, 5, 1), (5, 2, 1)),
                 ((1, 8, 1), (-2, 2, 1))]:
        m.line(a, b, "cyan" if a[0] != 1 else "ui_coral", "voxel_glow")
    return m


@register("wall_tv", "wall", footprint=(1.5, .125), wall=True, tags=("wall", "screen"))
def tv():
    m = panel(Model("wall-tv"), 24, 15, "ink", "screen", 2)
    screen_back(m, -12, 0, 0, 12, 15)
    m.box((-10, 3, 1), (10, 13, 2), "screen", "voxel_glow")
    # Idle screen: distant teal hills, coral sun, and clean progress/status pixels.
    m.box((5, 9, 1), (8, 12, 2), "led", "voxel_glow")
    for x in range(-10, 10):
        height = max(3, 9 - abs(x + 4), 7 - abs(x - 5))
        m.box((x, 3, 1), (x + 1, height, 2), "teal", "voxel_glow")
    m.box((-8, 2, 1), (4, 3, 2), "cyan", "voxel_glow")
    m.set(9, 0, 1, "ui_coral", "voxel_glow")
    glints(m,(-10,12,1),(-9,11,1))
    return m


@register("window_panel", "wall", footprint=(1, .25), wall=True, tags=("wall", "glass"))
def window():
    m = Model("window-panel")
    m.box((-8, 0, 0), (8, 18, 2), "wood")
    m.box((-7, 2, 0), (7, 17, 2), None)
    m.box((-7, 2, 1), (7, 17, 2), "glass", "voxel_glass")
    m.box((-1, 2, 0), (1, 17, 2), "cream")
    m.box((-7, 9, 0), (7, 10, 2), "cream")
    m.box((-8, 0, 0), (8, 2, 4), "wood_light")
    m.box((-8, 17, 1), (8, 18, 2), "cream")
    # Pixel reflections replace glass cells rather than layering coplanar planes.
    for x, y in [(-5, 14), (-4, 15), (-4, 14), (-5, 13), (4, 6), (5, 7)]:
        m.set(x, y, 1, "cream", "voxel_glass")
    return m
