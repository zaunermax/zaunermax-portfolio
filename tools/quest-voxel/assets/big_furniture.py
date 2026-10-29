"""Office furniture. Connect axes: X; sofa corner connects east and south.

Counter corner connects east and south, with doors on its north/west exterior.
Counter endpoints mirror across X to keep both fronts south; counter_end aliases left.
Planter endpoints turn 180 degrees to cap the opposite end.
"""
from voxkit import Colour, Model, register


def table(seed, width=28, depth=12, height=12):
    m = Model(seed)
    a, b = width // 2, depth // 2
    m.box((-a, height-2, -b), (a, height-1, b), 'wood_dark')
    m.box((-a, height-1, -b), (a, height, b), 'wood')
    m.box((-a, height-1, b-1), (a, height, b), 'wood_light')
    for x in (-a+1, a-3):
        for z in (-b+1, b-3):
            m.box((x, 0, z), (x+2, height-2, z+2), 'metal')
            m.box((x, 0, z), (x+2, 1, z+2), 'ink')
    for x,z in [(-a+3,-2),(2,2)]:
        m.line((x,height-1,z),(x+3,height-1,z),'wood_light')
    return m


def meeting(end=False):
    m = Model('meeting')
    for y,c in [(10,'wood_dark'),(11,'wood')]:
        m.box((-8,y,-6),(8,y+1,6),c)
    for z in (-6,5):
        m.box((-8,11,z),(8,12,z+1),'wood_light')
    for x,z in [(-3,-3),(3,2)]:
        m.line((x,11,z),(x+2,11,z),'wood_light')
    if end:
        for z in (-6,5):
            m.box((-8,10,z),(-7,12,z+1),None)
        for z in (-4,2):
            m.box((-6,0,z),(-4,10,z+2),'metal')
            m.box((-6,0,z),(-4,1,z+2),'ink')
        m.box((-6,2,-2),(-4,3,2),'metal_light')
    return m

@register('meeting_end','meeting',tags=('connect','west-end'),budget=6000)
def meeting_end(): return meeting(True)

@register('meeting_mid','meeting',tags=('connect','middle'),budget=6000)
def meeting_mid():
    m = meeting()
    m.box((-2,0,-3),(2,1,3),'ink')
    m.box((-1,1,-2),(1,10,2),'metal')
    m.set(0,8,1,'cream')
    return m


def sofa(kind):
    m=Model('sofa')
    m.box((-8,1,-8),(8,5,8),'teal_dark')
    m.box((-8,5,-8),(8,7,8),'teal')
    m.box((-8,6,7),(8,7,8),'teal_light')
    # Deep stuffed back, with the same section at every connecting edge.
    m.box((-8,7,-8),(8,15,-4),'teal_dark')
    m.box((-8,8,-4),(8,14,-3),'teal')
    m.box((-8,14,-8),(8,15,-4),'teal_light')
    # An inset single-voxel stitched division leaves boundary colours identical.
    m.box((-7,6,-3),(-6,7,7),'teal_dark')
    m.box((-7,8,-4),(-6,14,-3),'teal_dark')
    m.box((-6,6,-2),(7,7,-1),'teal_light')
    for x in (-3,3): m.set(x,11,-4,'teal_dark')
    for x,z in [(-5,-5),(4,4)]:
        m.box((x,0,z),(x+2,1,z+2),'wood_dark')
    if kind=='corner':
        m.box((-8,7,-8),(-4,15,8),'teal_dark')
        m.box((-4,8,-3),(-3,14,8),'teal')
        m.box((-8,14,-8),(-4,15,8),'teal_light')
        # The south join is exactly the straight section rotated clockwise.
        m.box((-8,6,7),(7,7,8),'teal')
        m.box((-2,6,-2),(-1,7,7),'teal_light')
        m.box((-3,6,-7),(7,7,-6),'teal_dark')
        m.box((-4,8,-7),(-3,14,-6),'teal_dark')
    if kind in ('left','right'):
        x=-8 if kind=='left' else 5
        m.box((x,7,-4),(x+3,11,7),'teal_dark')
        m.box((x,10,-4),(x+3,11,7),'teal_light')
        px=-4 if kind=='left' else 1
        m.box((px,7,-2),(px+3,10,1),'mustard' if kind=='left' else 'coral')
        m.set(px+1,9,0,'wood_light' if kind=='left' else 'cream')
    return m

for _id,_kind in [('sofa_end_l','left'),('sofa_mid','mid'),('sofa_end_r','right'),('sofa_corner','corner')]:
    register(_id,'sofa',tags=('connect',_kind),budget=6000)(lambda kind=_kind: sofa(kind))


def counter(kind):
    m=Model('counter')
    m.box((-8,0,-7),(8,2,7),'wood_dark')
    m.box((-8,2,-7),(8,13,7),'sage')
    m.box((-8,13,-8),(8,14,8),'wood_dark')
    m.box((-8,14,-8),(8,15,8),'wood_light')
    # Paint recessed-looking door seams, without a rim on connecting ends.
    for x in (-6,1):
        m.box((x,3,6),(x+5,12,7),'teal')
        m.box((x+2,10,6),(x+4,11,7),'wood_light')
    if kind in ('end','right'):
        m.box((-8,0,-8),(-7,13,8),None)
        m.box((-7,2,-7),(-6,13,7),'wood')
    if kind=='corner':
        m.box((-8,0,-8),(8,2,8),None)
        m.box((-7,0,-7),(8,2,7),'wood_dark')
        m.box((-7,0,-7),(7,2,8),'wood_dark')
        # Exterior back faces; the other two faces meet connected cabinet bodies.
        m.box((-8,2,-8),(8,13,8),None)
        m.box((-7,2,-7),(8,13,7),'sage')
        m.box((-7,2,-7),(7,13,8),'sage')
        for x in (-6,1):
            m.box((x,3,-7),(x+5,12,-6),'teal')
            m.box((x+2,10,-7),(x+4,11,-6),'wood_light')
        for z in (-6,1):
            m.box((-7,3,z),(-6,12,z+5),'teal')
            m.box((-7,10,z+2),(-6,11,z+4),'wood_light')
    if kind=='sink':
        m.box((-5,12,-3),(5,15,5),'metal_light')
        m.box((-4,13,-2),(4,15,4),None)
        m.box((-4,12,-2),(4,13,4),'metal')
        m.set(0,12,1,'ink')
        m.box((2,15,-5),(3,19,-4),'metal')
        m.box((0,18,-5),(3,19,-4),'metal_light')
        m.box((0,17,-5),(1,19,-3),'metal_light')
        m.set(4,15,-5,'coral')
        m.set(2,18,-4,'cream')
        m.set(-5,14,3,'cream')
    return m.mirror('x') if kind=='right' else m

for _id,_kind in [('counter_end_l','end'),('counter_end_r','right'),('counter_end','end'),('counter_mid','mid'),('counter_corner','corner'),('counter_sink','sink')]:
    register(_id,'counter',tags=('connect',_kind),budget=6000)(lambda kind=_kind: counter(kind))


def planter(end=False, variant=False):
    m=Model('planter')
    m.box((-8,0,-4),(8,1,4),'wood_dark')
    m.box((-8,1,-5),(8,6,5),'wood')
    m.box((-8,5,-5),(8,6,5),'wood_light')
    m.box((-8,5,-4),(8,6,4),'soil')
    if end: m.box((-8,5,-4),(-7,6,4),'wood_light')
    stems = [(-5,1,4),(-2,-2,7),(2,2,5),(5,-1,6)] if variant else [(-5,0,6),(-2,2,4),(1,-1,7),(5,1,5)]
    for x,z,h in stems:
        m.box((x,6,z),(x+1,6+h,z+1),'leaf_dark')
        m.box((x-1,7,z),(x,6+h-1,z+1),'leaf')
        m.box((x+1,8,z),(x+2,6+h,z+1),'leaf_light')
    if variant:
        m.box((1,10,2),(4,11,3),'lilac')
        m.set(2,11,2,'cream')
    else:
        m.box((-4,10,2),(-1,11,3),'coral')
        m.set(-3,11,2,'mustard')
    return m

@register('planter_end','planter',tags=('connect','west-end'),budget=6000)
def planter_end(): return planter(True)

@register('planter_mid','planter',tags=('connect','middle'),budget=6000)
def planter_mid(): return planter()

@register('planter_mid_b','planter',tags=('connect','middle'),budget=6000)
def planter_mid_b(): return planter(variant=True)

@register('stage_block','stage',tags=('connect',),budget=6000)
def stage():
    m=Model('stage').box((-8,0,-8),(8,3,8),'wood_dark')
    m.box((-8,3,-8),(8,4,8),'wood')
    # Quarter-turn invariant parquet medallions; no directional plank stripes.
    for x in (-5,4):
        for z in (-5,4):
            m.set(x,3,z,'wood_light')
            m.set(-x-1,3,z,'wood_light')
    return m

@register('coffee_table','tables',footprint=(2,1),budget=6000)
def coffee_table():
    m=table('coffee-table',26,12,7)
    m.box((-10,2,-4),(10,3,4),'wood')
    m.box((-8,3,-2),(-1,4,3),'lilac')
    m.box((-7,4,-1),(-2,5,3),'cream')
    m.box((3,7,-2),(9,8,3),'coral')
    m.box((4,7,-1),(8,8,1),'cream')
    m.box((-7,7,0),(-4,9,3),'teal')
    m.box((-7,9,0),(-4,10,3),'cream')
    m.set(-6,9,1,'coffee')
    return m

@register('reception_desk','reception',footprint=(3,1),budget=6000)
def reception():
    m=Model('reception')
    m.box((-21,0,-4),(21,2,5),'wood_dark')
    m.box((-21,2,-5),(21,13,6),'wood')
    m.box((-22,13,-6),(22,15,7),'wood_light')
    m.box((-19,3,5),(19,12,6),'teal')
    for x in (-16,-12,12,16): m.box((x,4,5),(x+1,11,6),'teal_dark')
    # Big friendly envelope on the reception fascia.
    m.box((-5,6,5),(5,10,6),'cream')
    for x,y in [(-4,9),(-3,8),(-2,7),(-1,6),(0,6),(1,7),(2,8),(3,9)]: m.set(x,y,5,'coral')
    m.box((12,15,-2),(17,16,2),'metal')
    m.box((14,16,-1),(15,18,0),'metal')
    m.box((11,18,-2),(18,23,0),'ink')
    m.box((12,19,-1),(17,22,0),'cyan','voxel_glow')
    m.box((-17,15,1),(-14,16,4),'mustard')
    m.set(-16,16,2,'cream')
    # A tiny welcome pennant beside the service bell.
    m.box((-20,15,-3),(-19,21,-2),'metal_light')
    m.box((-19,18,-3),(-15,21,-2),'coral')
    m.set(-16,18,-3,'wood_light')
    return m

@register('fridge','kitchen',budget=6000)
def fridge():
    m=Model('fridge').box((-6,0,-5),(6,1,5),'metal')
    m.box((-7,1,-6),(7,31,6),'cream')
    m.box((-6,31,-5),(6,32,5),'metal_light')
    m.box((-6,1,6),(6,30,7),'cream')
    m.box((-6,21,6),(6,22,7),'metal_light')
    for y in (14,24):
        m.box((3,y,7),(4,y+4,8),'metal')
        m.set(3,y+3,7,'cream')
    m.box((-4,13,7),(0,18,8),'wood_light')
    m.set(-2,17,7,'coral')
    m.line((-3,15,7),(-1,15,7),'wood_dark')
    m.box((-4,25,7),(-2,27,8),'teal')
    m.set(-5,30,5,'cream').set(-4,31,4,'cream')
    return m

@register('vending_machine','kitchen',budget=6000)
def vending():
    m=Model('vending').box((-6,0,-5),(6,1,5),'ink')
    m.box((-7,1,-6),(7,33,6),'coral_dark')
    m.box((-6,2,5),(6,32,7),'coral')
    m.box((-5,10,6),(2,29,7),'navy')
    m.box((-5,29,6),(5,32,7),'cream')
    m.box((-3,30,6),(3,31,7),'cyan','voxel_glow')
    for y in (12,17,22,27):
        for x,c in [(-4,'mustard'),(-1,'teal_light')]:
            m.box((x,y-1,6),(x+2,y+1,7),c)
            m.set(x,y+1,6,'cream')
        m.box((-5,y-2,6),(2,y-1,7),'metal_light')
    m.box((3,22,6),(5,26,7),'cyan','voxel_glow')
    for y in (16,18,20): m.set(3,y,6,'cream')
    m.box((-4,4,6),(3,7,7),'ink')
    m.box((-4,4,7),(3,5,8),'metal')
    m.set(-5,27,6,'cream').set(-4,28,6,'cream')
    return m

@register('water_cooler','kitchen',budget=6000)
def water_cooler():
    m=Model('cooler').box((-4,0,-4),(4,2,4),'metal')
    m.box((-5,2,-4),(5,15,4),'cream')
    m.box((-3,6,3),(3,12,4),'navy')
    m.box((-3,5,4),(3,6,6),'metal_light')
    for x,c in [(-2,'coral'),(1,'teal')]: m.set(x,11,4,c)
    water = Colour('#98c9e2', jitter=.025)
    shine = Colour('#d7eaf0', jitter=.015)
    # Narrow neck, stepped shoulders and a broad jug instead of a teal cube.
    m.box((-2,15,-2),(2,17,2),'metal_light')
    m.box((-3,17,-2),(3,18,2),water)
    for z, width in zip(range(-3,3),(4,6,8,8,6,4)):
        m.box((-width//2,18,z),(width//2,24,z+1),water)
        m.box((-width//2,21,z),(width//2,22,z+1),shine)
    m.box((-3,24,-2),(3,25,2),shine)
    m.box((-2,25,-1),(2,26,1),'metal')
    m.box((-1,25,-1),(1,26,0),'metal_light')
    m.box((-2,18,2),(-1,24,3),shine)
    # Camera-facing side-mounted cup tube, cream stacked rims and a hanging cup.
    m.box((5,8,0),(7,16,3),'metal_light')
    for y in (10,12,14): m.box((5,y,2),(7,y+1,3),'cream')
    m.box((5,7,1),(7,9,3),'cream')
    m.box((5,16,0),(7,17,3),'navy')
    return m

@register('filing_cabinet','storage',budget=6000)
def filing():
    m=Model('filing').box((-6,0,-5),(6,21,5),'metal')
    for y in (1,8,15):
        m.box((-5,y,5),(5,y+6,6),'metal_light')
        m.box((-2,y+3,6),(2,y+4,7),'ink')
        m.box((-2,y+1,5),(2,y+2,6),'cream')
        m.set(3,y+4,6,'mustard')
    m.box((-6,21,-5),(6,22,6),'metal_light')
    return m


def board(seed,width=14,height=25):
    m=Model(seed)
    a=width//2
    for x in (-a+1,a-2):
        m.box((x,0,-4),(x+1,1,5),'metal')
        m.box((x,1,-1),(x+1,11,0),'metal_light')
    m.box((-a,10,-1),(a,height,1),'metal')
    m.box((-a+1,11,0),(a-1,height-1,1),'cream')
    m.box((-a,10,1),(a,11,3),'metal_light')
    return m

@register('whiteboard','boards',budget=6000)
def whiteboard():
    m=board('whiteboard',height=30)
    m.box((-5,21,0),(4,22,1),'teal')
    for x,y in [(-4,17),(-3,18),(-2,17),(1,18),(2,17),(3,16)]: m.set(x,y,0,'coral')
    m.line((-4,14,0),(3,14,0),'navy')
    m.box((-4,11,1),(-1,12,2),'coral')
    return m

@register('fish_tank','lounge',footprint=(2,1),budget=6000)
def fish_tank():
    m=Model('fish-tank')
    m.box((-10,0,-4),(10,2,4),'wood_dark')
    m.box((-11,2,-5),(11,8,5),'wood')
    for x in (-9,1):
        m.box((x,3,4),(x+8,7,5),'teal')
        m.set(x+7,5,4,'wood_light')
    m.box((-11,8,-5),(11,9,5),'metal')
    m.box((-10,9,-4),(10,10,4),'soil')
    for x,z in [(-7,1),(-3,-2),(2,2),(7,0)]: m.set(x,9,z,'metal')
    # A filled tinted volume gives the water a horizontal surface and a waterline.
    m.box((-10,10,-4),(10,18,4),'cyan','voxel_glass')
    # Clear front/back panes, narrow ends. Bubbles use the same translucent glass.
    for z in (-5,4): m.box((-11,9,z),(11,19,z+1),'glass','voxel_glass')
    for x in (-11,10): m.box((x,9,-4),(x+1,19,4),'glass','voxel_glass')
    m.box((-11,19,-5),(11,20,5),'metal')
    m.box((-10,19,-4),(10,20,4),None)
    # Tiny glass glint at the front corner; open rim keeps fish visible from above.
    m.line((-9,16,4),(-9,18,4),'cyan','voxel_glow')
    m.set(-10,17,4,'cream','voxel_glow').set(-8,17,4,'cream','voxel_glow')
    for x,y,z,c in [(-6,13,1,'coral'),(3,12,0,'mustard')]:
        m.box((x,y,z),(x+4,y+2,z+1),c)
        m.box((x-1,y-1,z),(x,y+3,z+1),c)
        m.set(x+3,y+1,z,'ink')
    for x,y in [(-1,12),(0,15),(-1,17),(8,14),(9,17)]: m.set(x,y,2,'glass','voxel_glass')
    for x,h in [(-8,8),(6,6),(8,8)]:
        m.box((x,10,-2),(x+1,10+h,-1),'leaf')
        m.box((x-1,11,-2),(x,10+h-1,-1),'leaf_light')
    return m

@register('snack_table','tables',footprint=(2,1),budget=6000)
def snack_table():
    m=table('snack-table',28,12)
    for y,c in [(12,'cream'),(13,'coral'),(14,'cream')]:
        m.box((-12,y,-4),(-1,y+1,4),c)
    m.box((-10,14,-2),(-3,15,2),'mustard')
    for x,z in [(-8,-1),(-5,0),(-7,1)]: m.set(x,14,z,'coral_dark')
    for x,z,c in [(3,-2,'teal'),(8,-1,'coral'),(5,3,'lilac')]:
        m.box((x,12,z),(x+2,16,z+2),c)
        m.box((x,16,z),(x+2,17,z+2),'metal_light')
        m.set(x,16,z,'ink')
    return m
