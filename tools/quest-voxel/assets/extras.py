"""Birthday treats, a quiet focus pod, and X-connecting canteen tables.

Dining origins and joins follow meeting_end/meeting_mid: west end, unsupported
middle, and the same end turned 180 degrees at the east. All tops end at y=12.
"""
from voxkit import Model, register


def _round_box(m, lo, hi, colour):
    """One-cell stepped corners, keeping all details on the integer grid."""
    m.box(lo, hi, colour)
    for x in (lo[0], hi[0] - 1):
        for z in (lo[2], hi[2] - 1):
            m.box((x, lo[1], z), (x + 1, hi[1], z + 1), None)


@register('birthday_cake', 'desktop', footprint=(1, 1),
          tags=('desktop', 'birthday', 'cake'))
def birthday_cake():
    # A shareable office cake, eight cells across and ten including the candles.
    m = Model('birthday-cake')
    _round_box(m, (-4, 0, -4), (4, 1, 4), 'teal_light')
    _round_box(m, (-3, 1, -3), (3, 4, 3), 'coral')
    _round_box(m, (-3, 2, -3), (3, 3, 3), 'cream')
    _round_box(m, (-3, 4, -3), (3, 5, 3), 'cream')
    for x, z in [(-2, 2), (1, 2), (2, 0)]: m.set(x, 3, z, 'cream')
    _round_box(m, (-2, 5, -2), (2, 6, 2), 'lilac')
    _round_box(m, (-2, 6, -2), (2, 7, 2), 'cream')
    for x, z, c in [(-2, 0, 'mustard'), (1, 1, 'teal'), (0, -2, 'coral')]:
        m.set(x, 6, z, c)
    for x, z, c in [(-1, -1, 'teal'), (1, 0, 'coral'), (-1, 1, 'mustard')]:
        m.box((x, 7, z), (x + 1, 9, z + 1), c)
        m.set(x, 9, z, 'led', 'voxel_glow')
    return m


@register('phone_booth', 'office', footprint=(1, 1),
          tags=('focus', 'phone', 'glass'), budget=6000)
def phone_booth():
    m = Model('phone-booth')
    # Compact, chunky acoustic shell; the opening faces south (+Z).
    m.box((-6, 0, -4), (6, 1, 6), 'teal_dark')
    m.box((-6, 1, -4), (6, 32, 6), 'teal')
    m.box((-4, 1, -2), (4, 30, 5), None)
    m.box((-5, 32, -3), (5, 33, 5), 'wood_light')
    # Felt inserts, with restrained stitching; paint into the shell.
    for x in (-6, 5):
        m.box((x, 4, -2), (x + 1, 28, 4), 'teal_dark')
        m.box((x, 5, -1), (x + 1, 27, 3), 'teal')
        for y in (9, 16, 23):
            m.set(x, y, 1, 'teal_light')
    m.box((-4, 2, -3), (4, 29, -2), 'lilac')
    for x in (-3, 2):
        m.box((x, 3, -3), (x + 1, 28, -2), 'teal_dark')
    # Birch doorway; glass occupies distinct cells inside its frame.
    for x in (-5, 4):
        m.box((x, 1, 5), (x + 1, 31, 6), 'wood_light')
    for y in (1, 30):
        m.box((-4, y, 5), (4, y + 1, 6), 'wood_light')
    m.box((-4, 2, 5), (4, 30, 6), 'glass', 'voxel_glass')
    m.box((2, 13, 6), (3, 18, 7), 'wood_light')
    for y in (6, 25):
        m.set(-4, y, 5, 'metal')
    # Quiet felt floor, wall-mounted writing ledge and upholstered stool.
    m.box((-4, 1, -2), (4, 2, 5), 'sage')
    m.box((-4, 11, -2), (4, 12, 1), 'wood_dark')
    m.box((-4, 12, -2), (4, 13, 1), 'wood_light')
    m.box((-2, 13, -1), (1, 14, 1), 'cream')
    m.set(1, 13, -1, 'coral')
    m.box((-1, 2, 1), (1, 7, 3), 'wood_dark')
    m.box((-2, 6, 0), (2, 7, 4), 'coral_dark')
    m.box((-2, 7, 0), (2, 8, 4), 'coral')
    # Ceiling light and a coral occupied beacon, supported by the roof.
    m.box((-2, 29, 0), (2, 30, 3), 'led', 'voxel_glow')
    m.box((-3, 33, 0), (3, 34, 3), 'teal_dark')
    m.box((-2, 34, 0), (2, 36, 3), 'ui_coral', 'voxel_glow')
    m.box((-1, 35, 0), (1, 36, 3), 'led', 'voxel_glow')
    return m


def _dining(end=False):
    m = Model('dining')
    m.box((-8, 10, -6), (8, 11, 6), 'wood')
    m.box((-8, 11, -6), (8, 12, 6), 'wood_light')
    # Symmetric cross-section guarantees stripe/edge alignment at a rotated end.
    for z in (-6, 5):
        m.box((-8, 11, z), (8, 12, z + 1), 'cream')
    m.box((-8, 11, -2), (8, 12, 2), 'coral')
    for z in (-2, 1):
        m.box((-8, 11, z), (8, 12, z + 1), 'cream')
    for x, z in [(-5, -4), (2, 3)]:
        m.line((x, 11, z), (x + 2, 11, z), 'cream')
    # Only the west end owns legs; the east end is this exact model rotated 180°.
    if end:
        for z in (-6, 5):
            m.box((-8, 10, z), (-7, 12, z + 1), None)
        for z in (-4, 2):
            m.box((-6, 0, z), (-4, 10, z + 2), 'teal')
            m.box((-6, 0, z), (-4, 1, z + 2), 'teal_dark')
        m.box((-6, 3, -2), (-4, 5, 2), 'teal_dark')
    return m


@register('dining_end', 'dining', footprint=(1, 1),
          tags=('connect', 'west-end'), budget=6000)
def dining_end():
    return _dining(True)


@register('dining_mid', 'dining', footprint=(1, 1),
          tags=('connect', 'middle'), budget=6000)
def dining_mid():
    return _dining()
