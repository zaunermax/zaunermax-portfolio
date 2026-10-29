"""The office ensemble. Absolute voxel coordinates, +Z faces, canonical joint pivots.

Clothes and accessories are painted/stamped into their owning part, never floating
coplanar overlays. Keep the reference 9-voxel head and shoulder/hip proportions.
"""
from voxkit import Colour, Model, Part, register


# Darker skin and auburn hair extend the reference palette with the same soft range.
SKIN_DARK = Colour("#895a46", jitter=.03)
SKIN_DARK_LIGHT = Colour("#a77157", jitter=.03)
AUBURN = Colour("#aa6044", jitter=.035)


def _person(id, skin="skin", hair="hair", shirt="teal", trim="teal_dark",
            trousers="navy", shoes="cream", short_sleeves=False):
    body = Model(id + "-body")
    body.box((-3, 9, -2), (4, 16, 3), shirt)
    body.box((-2, 16, -1), (3, 18, 2), skin)
    body.box((-3, 9, 2), (4, 10, 3), trim)
    # Inset the waist sides: rotating hips must not share exterior side planes.
    body.box((-3, 9, -2), (-2, 11, 3), None)
    body.box((3, 9, -2), (4, 11, 3), None)
    head = Model(id + "-head")
    head.box((-4, 18, -3), (5, 25, 4), skin)
    head.box((-3, 17, -2), (4, 18, 4), skin)
    head.box((-3, 25, -3), (4, 26, 4), hair)
    head.box((-4, 23, -3), (5, 25, 3), hair)
    head.box((-4, 20, -3), (5, 23, -2), hair)
    head.box((-4, 22, 3), (-2, 25, 4), hair)
    head.box((-2, 23, 3), (3, 25, 4), hair)
    head.box((3, 22, 3), (5, 25, 4), hair)
    for x in (-3, 2):
        head.box((x, 20, 3), (x + 2, 22, 4), "ink")
        head.set(x, 21, 3, "cream")
    # Two quiet mouth pixels: no projecting nose / single white tooth.
    head.set(0, 18, 3, "hair_light").set(1, 18, 3, "hair_light")
    parts = [Part("body", body, (0, 9, 0)), Part("head", head, (0, 17, 0))]
    for name, x in [("arm_l", 4), ("arm_r", -5)]:
        arm = Model(id + "-" + name)
        arm.box((x, 9, -1), (x + 2, 16, 2), shirt)
        arm.box((x, 8, -1), (x + 2, 13 if short_sleeves else 10, 2), skin)
        arm.box((x, 13 if short_sleeves else 10, -1),
                (x + 2, 14 if short_sleeves else 11, 2), trim)
        parts.append(Part(name, arm, (x + 1, 15, 0)))
    for name, x in [("leg_l", 1), ("leg_r", -3)]:
        leg = Model(id + "-" + name)
        # Hip stays on the reference top face; inset waist hides the rotating seam.
        leg.box((x, 1, -1), (x + 3, 9, 2), trousers)
        leg.box((x, 0, -1), (x + 3, 2, 3), shoes)
        leg.box((x, 1, 2), (x + 3, 2, 3), trim)
        parts.append(Part(name, leg, (x + 1.5, 9, 0)))
    return parts, body, head


def _hood(body, colour, trim):
    body.box((-2, 15, -3), (3, 17, 0), trim)
    for x in (-1, 1):
        body.box((x, 13, 2), (x + 1, 16, 3), "cream")
    body.box((-1, 10, 2), (2, 12, 3), trim).set(0, 11, 2, colour)


@register("visitor", "characters", tags=("player", "humanoid"), character=True, budget=2500)
def visitor():
    parts, body, head = _person("visitor", skin="skin_deep_light", hair="hair_dark",
                               shirt="mustard", trim="wood_dark", trousers="teal_dark")
    # Short field jacket, scarf, and a snug two-tone daypack.
    body.box((0, 10, 2), (1, 15, 3), "cream")
    body.box((-2, 15, 2), (3, 16, 3), "teal")
    body.box((-2, 10, -4), (3, 15, -2), "teal_dark")
    body.box((-2, 14, -4), (3, 16, -2), "teal")
    for x in (-2, 2):
        body.box((x, 12, 2), (x + 1, 15, 3), "teal_dark")
    body.set(2, 12, 2, "cream").set(-2, 11, 2, "coral")
    # Lift the short visor above the forehead; preserve both eye glints at 50 degrees.
    head.box((-4, 23, -3), (5, 25, 4), "teal_dark")
    head.box((-3, 25, -3), (4, 26, 4), "teal")
    head.box((-3, 25, 3), (4, 26, 5), "teal")
    head.set(0, 24, 3, "cream")
    return parts


@register("dev_hoodie", "characters", tags=("developer", "humanoid"), character=True, budget=2500)
def dev_hoodie():
    parts, body, head = _person("dev_hoodie", skin=SKIN_DARK, hair="hair_dark",
                               shirt="teal", trim="teal_dark")
    _hood(body, "teal", "teal_dark")
    body.set(2, 12, 2, "mustard").set(2, 13, 2, "cream")
    # A stepped afro crown, compact enough for the reference head silhouette.
    head.box((-4, 24, -3), (5, 26, 3), "hair_dark")
    head.box((-2, 26, -2), (3, 27, 2), "hair_dark")
    head.set(-3, 25, 2, "hair").set(2, 26, 1, "hair")
    head.set(-3, 19, 3, SKIN_DARK_LIGHT).set(3, 19, 3, SKIN_DARK_LIGHT)
    head.set(0, 18, 3, "skin_deep_light").set(1, 18, 3, "skin_deep_light")
    # Headphone earcups and the headband are painted into the hair shell.
    head.box((-4, 21, 0), (-3, 24, 2), "mustard")
    head.box((4, 21, 0), (5, 24, 2), "mustard")
    head.box((-2, 26, -1), (3, 27, 0), "mustard")
    return parts


@register("dev_slacker", "characters", tags=("developer", "humanoid"), character=True, budget=2500)
def dev_slacker():
    parts, body, head = _person("dev_slacker", shirt="navy", trim="metal",
                               hair="hair_dark", trousers="metal", short_sleeves=True)
    # Retro band tee: a chunky mustard lightning bolt, quiet at small scales.
    for x, y in [(1, 14), (0, 13), (1, 13), (0, 12), (-1, 11)]:
        body.set(x, y, 2, "mustard")
    body.set(-1, 14, 2, "cream")
    head.box((-3, 25, -2), (0, 27, 1), "hair_dark")
    head.box((1, 25, 0), (4, 27, 3), "hair_dark")
    head.set(-1, 22, 3, "hair_dark").set(0, 23, 3, "hair")
    # Sparse soft stubble instead of an enormous beard or projecting nose.
    for x, y in [(-2, 18), (-1, 17), (2, 17), (3, 18)]:
        head.set(x, y, 3, "hair_light")
    return parts


@register("manager", "characters", tags=("manager", "humanoid"), character=True, budget=2500)
def manager():
    parts, body, head = _person("manager", skin="skin_deep", hair="hair_dark",
                               shirt="cream", trim="metal_light", trousers="navy", shoes="hair_dark")
    # Spread collar, broad tie knot, pen and a bright little watch.
    body.set(-1, 15, 2, "metal_light").set(1, 15, 2, "metal_light")
    body.set(0, 15, 2, "coral_dark")
    body.box((0, 11, 2), (1, 15, 3), "coral")
    body.set(0, 10, 2, "coral_dark").set(2, 14, 2, "navy")
    body.set(0, 13, 2, "mustard")
    body.box((-2, 9, 2), (3, 10, 3), "hair_dark").set(0, 9, 2, "mustard")
    head.box((-4, 24, -2), (2, 26, 3), "hair_dark")
    head.box((2, 24, -2), (3, 26, 3), "hair_light")
    head.box((-4, 21, 2), (-3, 23, 3), "metal_light")
    head.box((4, 21, 2), (5, 23, 3), "metal_light")
    head.set(-2, 22, 3, "hair_dark").set(2, 22, 3, "hair_dark")
    parts[2].model.set(5, 10, 1, "mustard")
    return parts


@register("designer", "characters", tags=("designer", "humanoid"), character=True, budget=2500)
def designer():
    parts, body, head = _person("designer", skin="skin_deep", hair="hair_dark",
                               shirt="lilac", trim="coral_dark", trousers="teal_dark")
    # Open lilac cardigan over a striped shirt, statement mustard beret.
    body.box((-1, 10, 2), (2, 16, 3), "cream")
    for y in (11, 13):
        body.box((-1, y, 2), (2, y + 1, 3), "coral")
    for y in (11, 13, 15):
        body.set(2, y, 2, "mustard")
    head.box((-4, 24, -3), (5, 25, 4), "mustard")
    head.box((-4, 25, -3), (5, 26, 4), None)
    head.box((-4, 25, -2), (3, 26, 3), "mustard")
    head.set(-1, 26, 0, "wood_dark").set(-2, 25, 2, "cream")
    # Close bob and warm earrings sit inside the head silhouette.
    head.box((-4, 18, -2), (-3, 23, 2), "hair_dark")
    head.box((4, 18, -2), (5, 23, 2), "hair_dark")
    head.set(-4, 19, 2, "mustard").set(4, 19, 2, "mustard")
    return parts


@register("barista", "characters", tags=("barista", "humanoid"), character=True, budget=2500)
def barista():
    parts, body, head = _person("barista", hair=AUBURN, shirt="cream", trim="teal_dark",
                               trousers="hair_dark", short_sleeves=True)
    # Apron is a painted surface: no sandwich of coplanar cloth meshes.
    body.box((-2, 9, 2), (3, 14, 3), "teal_dark")
    body.box((-1, 14, 2), (2, 16, 3), "teal_dark")
    body.box((-3, 12, 2), (4, 13, 3), "teal")
    body.box((-1, 10, 2), (2, 12, 3), "teal")
    body.set(0, 11, 2, "cream").set(1, 11, 2, "mustard")
    head.box((-1, 24, -5), (3, 27, -2), AUBURN)
    head.box((-4, 23, 3), (5, 24, 4), "sage")
    head.set(-3, 19, 3, "skin_shadow").set(3, 19, 3, "skin_shadow")
    return parts


@register("intern", "characters", tags=("intern", "humanoid"), character=True, budget=2500)
def intern():
    parts, body, head = _person("intern", skin="skin_deep_light", hair="wood_dark",
                               shirt="sage", trim="teal_dark", trousers="navy")
    # Wide cuffs read as a borrowed oversized hoodie without changing shoulders.
    _hood(body, "sage", "teal_dark")
    for p, x in ((parts[2], 4), (parts[3], -5)):
        p.model.box((x, 10, -2), (x + 2, 15, 2), "sage")
        p.model.box((x, 9, -1), (x + 2, 11, 2), "teal_dark")
    # An oversized ID card is legible from the game camera.
    body.box((-1, 13, 2), (0, 16, 3), "coral")
    body.box((1, 13, 2), (2, 16, 3), "coral")
    body.box((-1, 11, 2), (2, 13, 3), "cream")
    body.set(0, 12, 2, "teal").set(1, 11, 2, "mustard")
    head.box((-3, 25, -2), (1, 27, 2), "wood_dark")
    head.box((-2, 23, 3), (1, 24, 4), "wood_light")
    head.set(-1, 22, 3, "wood_dark")
    return parts


@register("office_dog", "characters", tags=("animal", "corgi"), character=True, budget=2500)
def office_dog():
    body = Model("corgi-body")
    body.box((-3, 3, -5), (3, 8, 4), "wood_dark")
    body.box((-3, 4, -4), (3, 8, 3), "wood")
    body.box((-2, 8, -4), (2, 9, 3), "wood")
    body.box((-2, 3, -4), (2, 5, 4), "cream")
    body.box((-3, 5, 2), (3, 8, 4), "cream")
    # Collar belongs to body; the head turns above it.
    body.box((-3, 7, 2), (3, 8, 4), "teal")
    body.set(0, 6, 3, "mustard")
    # Recess the belly sides so trotting legs cannot z-fight with the flank.
    body.box((-3, 3, -5), (-1, 4, 4), None)
    body.box((1, 3, -5), (3, 4, 4), None)
    head = Model("corgi-head")
    head.box((-4, 8, 0), (4, 13, 6), "wood")
    head.box((-2, 7, 3), (2, 8, 6), "cream")
    # Huge triangular stepped ears and a centred blaze make the corgi silhouette.
    for x in (-4, 2):
        head.box((x, 13, 1), (x + 2, 15, 4), "wood_dark")
        head.box((x, 13, 3), (x + 2, 14, 4), "coral")
        head.box((x if x < 0 else x + 1, 15, 1),
                 (x + 1 if x < 0 else x + 2, 16, 3), "wood_dark")
    head.box((-1, 9, 5), (1, 13, 6), "cream")
    head.box((-3, 8, 5), (3, 10, 7), "cream")
    head.box((-1, 9, 6), (1, 10, 7), "ink")
    for x in (-3, 1):
        head.box((x, 10, 5), (x + 2, 12, 6), "ink")
        head.set(x, 11, 5, "cream")
    head.set(0, 8, 6, "coral")
    tail = Model("corgi-tail")
    tail.box((-1, 6, -7), (1, 8, -5), "wood")
    tail.box((-1, 6, -5), (1, 7, -4), "wood")
    tail.box((-1, 8, -7), (1, 10, -5), "cream")
    parts = [Part("body", body, (0, 5, 0)), Part("head", head, (0, 8, 2)),
             Part("tail", tail, (0, 7, -4))]
    for name, x, z in [("leg_fl", 1, 2), ("leg_fr", -3, 2),
                       ("leg_bl", 1, -4), ("leg_br", -3, -4)]:
        leg = Model("corgi-" + name)
        leg.box((x, 0, z), (x + 2, 3, z + 2), "wood")
        inner_x = x if x > 0 else x + 1
        leg.box((inner_x, 3, z), (inner_x + 1, 5, z + 1), "wood")
        leg.box((x, 0, z), (x + 2, 2, z + 2), "cream")
        parts.append(Part(name, leg, (x + 1, 4, z + 1)))
    return parts


@register("office_cat", "characters", tags=("animal", "cat"), character=True, budget=2500)
def office_cat():
    body = Model("cat-body")
    body.box((-2, 3, -4), (2, 7, 3), "metal")
    body.box((-1, 7, -3), (1, 8, 2), "metal")
    body.box((-1, 3, 1), (1, 6, 3), "cream")
    body.box((-2, 3, -4), (-1, 5, 3), None)
    body.box((1, 3, -4), (2, 5, 3), None)
    for z in (-3, -1):
        body.box((-2, 6, z), (2, 7, z + 1), "navy")
    head = Model("cat-head")
    head.box((-3, 7, 0), (3, 11, 5), "metal")
    head.box((-2, 6, 3), (2, 7, 5), "cream")
    for x in (-3, 1):
        head.box((x, 11, 1), (x + 2, 13, 4), "metal")
        head.set(x if x < 0 else x + 1, 12, 3, "coral")
    head.box((-2, 8, 4), (2, 9, 5), "cream")
    for x in (-2, 1):
        head.box((x, 9, 4), (x + 2, 11, 5), "ink")
        head.set(x, 10, 4, "led")
    head.set(0, 8, 4, "coral_dark")
    head.set(-1, 10, 4, "navy").set(0, 10, 4, "navy")
    tail = Model("cat-tail")
    tail.box((-1, 5, -6), (1, 7, -4), "metal")
    tail.box((-1, 5, -4), (1, 6, -3), "metal")
    tail.box((-1, 7, -6), (1, 11, -4), "metal")
    tail.box((-1, 10, -5), (1, 12, -3), "navy")
    parts = [Part("body", body, (0, 4, 0)), Part("head", head, (0, 7, 1)),
             Part("tail", tail, (0, 6, -3))]
    for name, x, z in [("leg_fl", 0, 1), ("leg_fr", -2, 1),
                       ("leg_bl", 0, -3), ("leg_br", -2, -3)]:
        leg = Model("cat-" + name)
        leg.box((x, 0, z), (x + 2, 3, z + 2), "metal")
        leg.box((x, 0, z), (x + 2, 1, z + 2), "cream")
        parts.append(Part(name, leg, (x + 1, 3, z + 1)))
    return parts


@register("robo_vacuum", "characters", tags=("robot", "vacuum"), character=True, budget=2500)
def robo_vacuum():
    body, top = Model("vacuum-body"), Model("vacuum-top")
    # A symmetric stepped disk; lid is radially inset so its seam is intentional.
    for x in range(-6, 6):
        for z in range(-6, 6):
            if (x + .5) ** 2 + (z + .5) ** 2 <= 35:
                body.box((x, 0, z), (x + 1, 1, z + 1), "navy")
                body.box((x, 1, z), (x + 1, 3, z + 1), "teal_dark")
            if (x + .5) ** 2 + (z + .5) ** 2 <= 25:
                top.box((x, 3, z), (x + 1, 4, z + 1), "cream")
    top.box((-1, 4, -1), (1, 5, 1), "teal")
    top.set(0, 4, 0, "cyan", "voxel_glow")
    # Front-facing LED visor and a tiny coral status pixel.
    body.box((-3, 1, 5), (3, 3, 6), "navy")
    body.set(-2, 2, 5, "cyan", "voxel_glow").set(1, 2, 5, "cyan", "voxel_glow")
    top.set(2, 3, 2, "coral")
    return [Part("body", body, (0, 1, 0)), Part("top", top, (0, 3, 0))]
