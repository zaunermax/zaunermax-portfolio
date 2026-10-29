from voxkit import Colour, Model, register


def glints(m, *positions):
    """Sparse cream pixels painted into existing glossy surfaces, never floating stars."""
    for p in positions:
        assert p in m.cells, (m.seed, p)
        m.set(*p, "cream")
    return m


def screen_back(m, x0, y0, z, x1, y1):
    """Paint the existing rear layer: slate shell, one-cell rim, tiny mint badge."""
    m.box((x0, y0, z), (x1, y1, z + 1), "metal")
    m.box((x0 + 1, y0 + 1, z), (x1 - 1, y1 - 1, z + 1),
          Colour("#506b70"))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    m.set(cx, cy, z, "teal_light")
    m.set(cx - 1, cy, z, "cream")
    return m


def duck_model():
    # Same side-profile silhouette as Max's desk duck, with tiny side eyes.
    m = Model("rubber-duck")
    m.box((-2, 0, -2), (2, 2, 1), "mustard")
    m.box((0, 2, -1), (2, 4, 1), "mustard")
    m.box((0, 2, 1), (2, 3, 2), "coral")
    m.set(1, 3, 0, "ink")
    m.set(-3, 2, -1, "mustard").set(-2, 2, -1, "mustard")
    m.set(-1, 1, 0, "wood_light")
    return m


@register("monitor_dual", "desktop", footprint=(1, .5), tags=("desktop", "screen"))
def monitors():
    m = Model("monitor")
    m.box((-5, 0, -1), (5, 1, 2), "metal")
    m.box((-1, 1, -1), (1, 4, 0), "metal_light")
    m.box((-5, 3, -1), (5, 4, 0), "metal")
    for x in (-8, 1):
        m.box((x, 3, -1), (x + 7, 10, 1), "ink")
        screen_back(m, x, 3, -1, x + 7, 10)
        m.box((x + 1, 4, 0), (x + 6, 9, 1), "screen", "voxel_glow")
        m.set(x + 5, 3, 0, "led", "voxel_glow")
    # Two tiny, intentionally readable interfaces: code editor and pixel landscape.
    m.box((-7, 8, 0), (-2, 9, 1), "cyan", "voxel_glow")
    for x, y, length, c in [(-7, 6, 3, "ui_coral"), (-6, 5, 3, "cyan")]:
        m.line((x, y, 0), (x + length - 1, y, 0), c, "voxel_glow")
    for x, height in [(2, 1), (3, 2), (4, 3), (5, 2), (6, 1)]:
        m.box((x, 4, 0), (x + 1, 4 + height, 1), "cyan", "voxel_glow")
    m.set(5, 8, 0, "led", "voxel_glow")
    glints(m, (-7, 8, 0), (-6, 7, 0), (2, 8, 0))
    return m


@register("mug", "desktop", footprint=(.375, .25), tags=("desktop", "coffee"))
def mug():
    # Three-cell body: one-cell rim around a recessed coffee pixel.
    m = Model("mug")
    m.box((-2, 0, -1), (1, 2, 2), "coral")
    m.box((-2, 2, -1), (1, 3, 2), "cream")
    m.set(-1, 2, 0, None).set(-1, 1, 0, "coffee")
    # A real open handle, kept on the camera-visible right side.
    m.box((1, 0, 0), (3, 1, 1), "coral")
    m.box((1, 2, 0), (3, 3, 1), "coral")
    m.set(2, 1, 0, "coral")
    m.set(-1, 1, 1, "cream")
    return m
