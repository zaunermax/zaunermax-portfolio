from voxkit import Model, Part, register


def person(glasses=False):
    skin = "skin_deep_light" if glasses else "skin"
    hair = "hair_dark" if glasses else "hair"
    shirt = "sage" if glasses else "coral"
    parts = []
    # Coordinates are absolute bind-pose voxels; the toolkit subtracts each pivot.
    body = Model("dev-body" if glasses else "max-body")
    body.box((-3, 9, -2), (4, 16, 3), shirt)
    body.box((-2, 16, -1), (3, 18, 2), skin)
    body.box((-3, 9, 2), (4, 10, 3), "wood_dark" if glasses else "coral_dark")
    if glasses:
        body.box((-2, 15, 2), (3, 16, 3), "cream")
        body.set(0, 14, 2, "cream").set(0, 13, 2, "mustard")
        for x, y in [(-2, 11), (2, 11), (0, 10)]:
            body.set(x, y, 2, "teal_dark")
        body.set(2, 14, 2, "ink")
    else:
        body.box((-2, 15, -3), (3, 17, 0), "coral_dark")
        for x in (-1, 1):
            body.box((x, 13, 2), (x + 1, 16, 3), "cream")
        body.box((-1, 10, 2), (2, 12, 3), "coral_dark")
        body.set(0, 11, 2, "coral")
        # Narrow waist prevents exterior coplanar hip faces during stride/sit.
        body.box((-3, 9, -2), (-2, 11, 3), None)
        body.box((3, 9, -2), (4, 11, 3), None)
    parts.append(Part("body", body, (0, 9, 0)))
    head = Model("dev-head" if glasses else "max-head")
    head.box((-4, 18, -3), (5, 25, 4), skin)
    head.box((-3, 17, -2), (4, 18, 4), skin)
    head.box((-3, 25, -3), (4, 26, 4), hair)
    head.box((-4, 23, -3), (5, 25, 3), hair)
    head.box((-4, 20, -3), (5, 23, -2), hair)
    head.box((-4, 22, 3), (-2, 25, 4), hair)
    head.box((-2, 23, 3), (3, 25, 4), hair)
    head.box((3, 22, 3), (5, 25, 4), hair)
    head.set(-3, 24, 3, "hair_light").set(-2, 24, 3, "hair_light")
    head.set(-4, 20, 2, skin).set(4, 20, 2, skin)
    # Wide eyes and a quiet smile; preserve the glasses reference face.
    head.set(-2, 20, 3, "ink").set(2, 20, 3, "ink")
    if glasses:
        head.set(0, 19, 4, skin)
        head.set(0, 18, 3, "hair").set(1, 18, 3, "cream")
    else:
        # Broad rounded knot with a dark neck band, visible above the crown at 50 degrees.
        head.box((-2, 25, -3), (3, 27, 0), "hair_dark")
        head.box((-2, 27, -4), (3, 29, 0), "hair")
        head.box((-3, 27, -3), (4, 29, -1), "hair")
        head.box((-1, 29, -3), (2, 30, -1), "hair")
        head.set(0, 29, -2, "hair_light").set(-2, 28, -1, "hair_light")
        for x in (-3, 2):
            head.box((x, 20, 3), (x + 2, 22, 4), "ink")
            head.set(x, 21, 3, "cream")
        head.set(0, 18, 3, "skin_shadow").set(1, 18, 3, "skin_shadow")
        head.set(-1, 19, 3, "skin_shadow").set(2, 19, 3, "skin_shadow")
    if glasses:
        for x in (-3, 1):
            head.box((x, 19, 4), (x + 3, 22, 5), "ink")
            head.set(x + 1, 20, 4, "glass", "voxel_glass")
        head.set(0, 20, 4, "ink")
        head.box((-4, 21, 1), (-3, 22, 5), "ink")
        head.box((4, 21, 1), (5, 22, 5), "ink")
        head.box((2, 24, 3), (4, 25, 4), "hair_dark")
    else:
        head.set(-3, 19, 3, "skin_shadow").set(3, 19, 3, "skin_shadow")
    parts.append(Part("head", head, (0, 17, 0)))
    # l/r are the CHARACTER'S left/right: +X is their left while facing +Z.
    for name, x in [("arm_l", 4), ("arm_r", -5)]:
        arm = Model(name)
        arm.box((x, 9, -1), (x + 2, 16, 2), "cream" if glasses else shirt)
        arm.box((x, 8, -1), (x + 2, 10, 2), skin)
        arm.box((x, 10, -1), (x + 2, 11, 2), "wood_light" if glasses else "coral_dark")
        parts.append(Part(name, arm, (x + 1, 15, 0)))
    for name, x in [("leg_l", 1), ("leg_r", -3)]:
        leg = Model(name)
        leg.box((x, 1, -1), (x + 3, 9, 2), "wood_dark" if glasses else "navy")
        leg.box((x, 0, -1), (x + 3, 2, 3), "hair_dark" if glasses else "cream")
        leg.box((x, 1, 2), (x + 3, 2, 3), "wood_dark" if glasses else "mustard")
        parts.append(Part(name, leg, (x + 1.5, 9, 0)))
    return parts


@register("max", "characters", tags=("host", "humanoid"), character=True, budget=2500)
def max_character():
    return person()


@register("dev_glasses", "characters", tags=("developer", "humanoid"), character=True, budget=2500)
def glasses_character():
    return person(True)
