"""Hand-pixelled office landmarks and the after-hours game corner."""
from voxkit import Model, register
from assets.big_furniture import table, board
from assets.props import duck_model, glints, screen_back


@register('big_desk_max','landmarks',footprint=(2,1),tags=('landmark','max'),budget=6000)
def big_desk_max():
    m=table('max-desk',30,14)
    # Single pedestal, dual independent display frames, generous desktop around them.
    m.box((-13,1,-5),(-7,10,5),'wood')
    for y in (3,7):
        m.box((-12,y,5),(-8,y+2,6),'teal')
        m.set(-10,y+1,5,'wood_light')
    m.box((-7,12,-4),(8,13,-1),'metal')
    for x in (-6,2):
        m.box((x+2,13,-3),(x+3,15,-2),'metal_light')
        m.box((x,15,-4),(x+7,22,-2),'ink')
        screen_back(m, x, 15, -4, x+7, 22)
        m.box((x+1,16,-3),(x+6,21,-2),'screen','voxel_glow')
        m.box((x+1,19,-3),(x+5,20,-2),'cyan','voxel_glow')
        m.box((x+2,17,-3),(x+5,18,-2),'ui_coral','voxel_glow')
        m.set(x+5,15,-3,'led','voxel_glow')
    # The second monitor gets a cheerful mountain and a tiny evening star.
    m.box((3,16,-3),(8,21,-2),'screen','voxel_glow')
    for x,h in [(3,1),(4,2),(5,3),(6,2),(7,1)]:
        m.box((x,16,-3),(x+1,16+h,-2),'cyan','voxel_glow')
    m.set(7,20,-3,'led','voxel_glow')
    m.box((-5,12,2),(5,13,5),'metal')
    for x in (-4,-2,0,2): m.box((x,12,2),(x+1,13,4),'cream')
    m.box((7,12,3),(9,13,5),'lilac')
    # Tiny duck: connected body, head, bill and tail, all readable from the front.
    m.stamp(duck_model(),(-11,12,3))
    m.box((11,12,-3),(14,15,0),'coral')
    m.box((11,14,-3),(14,15,0),'soil')
    m.box((12,15,-2),(13,19,-1),'leaf')
    m.set(11,16,-2,'leaf_light').set(13,17,-2,'leaf')
    glints(m,(-5,20,-3),(-4,19,-3),(3,20,-3))
    m.box((-5,12,5),(-2,13,6),'cyan','voxel_glow')
    m.set(1,12,5,'led','voxel_glow')
    # Stickers on the honey front lip: heart, blue square, yellow stripe.
    for x,c in [(-3,'coral'),(-2,'coral'),(1,'teal'),(4,'mustard')]: m.set(x,11,6,c)
    return m

@register('kanban_board','landmarks',footprint=(2,1),tags=('landmark','quests'),budget=6000)
def kanban():
    m=board('kanban',30,29)
    m.box((-15,10,-1),(15,29,1),'wood')
    m.box((-14,11,0),(14,28,1),'cream')
    for x,c in [(-13,'coral'),(-4,'mustard'),(5,'teal')]:
        m.box((x,25,0),(x+8,28,1),c)
        m.line((x+2,26,0),(x+5,26,0),'cream')
    for x in (-5,4): m.box((x,12,0),(x+1,25,1),'metal_light')
    for x,y,c in [(-12,20,'wood_light'),(-11,14,'lilac'),(-3,19,'coral'),(6,20,'sage'),(7,14,'teal_light')]:
        m.box((x,y,1),(x+5,y+4,2),c)
        m.line((x+1,y+2,1),(x+3,y+2,1),'wood_dark')
        m.set(x+3,y,1,'cream')
    # A little golden quest marker pinned to the frame.
    m.box((10,29,-1),(13,33,1),'mustard')
    m.box((10,32,-1),(13,33,1),'wood_light')
    m.set(11,30,0,'cream','voxel_glow')
    for x in (-12,-3,6): m.set(x,28,0,'cyan','voxel_glow')
    glints(m,(-14,28,0),(-13,27,0))
    m.box((-10,11,1),(-6,12,2),'coral')
    # Happy completion tick in the rightmost quest column.
    for x,y in [(8,15),(9,14),(10,15),(11,16)]: m.set(x,y,1,'cream')
    return m

@register('server_rack','landmarks',tags=('landmark','forge','leds'),budget=6000)
def server_rack():
    m=Model('server-rack').box((-6,0,-5),(6,2,5),'ink')
    m.box((-7,2,-6),(7,32,6),'navy')
    m.box((-6,32,-5),(6,33,5),'metal')
    for x in (-7,6): m.box((x,2,6),(x+1,32,7),'metal')
    for i,y in enumerate((4,9,14,19,24)):
        m.box((-5,y,6),(5,y+4,7),'metal')
        m.box((-4,y+1,6),(1,y+3,7),'ink')
        for x in (-3,-1): m.set(x,y+1,6,'metal_light')
        for x in (2,4):
            m.set(x,y+1,6,'cyan' if i%2 else 'led','voxel_glow')
        m.set(3,y+2,6,'cyan','voxel_glow')
    # A continuous cyan front strip and glowing top vent identify the redeploy point.
    m.box((-6,4,6),(-5,31,7),'cyan','voxel_glow')
    for x in (-4,-1,2):
        m.box((x,32,-3),(x+2,33,3),'cyan','voxel_glow')
    m.box((-2,33,-2),(2,34,2),'cyan','voxel_glow')
    m.box((-3,29,6),(4,31,7),'teal_dark')
    m.set(0,30,6,'cream','voxel_glow')
    m.box((-3,2,6),(3,3,7),'cream')
    m.line((-2,2,6),(1,2,6),'teal')
    m.box((6,4,-4),(7,29,-3),'teal')
    m.box((6,4,-1),(7,26,0),'coral_dark')
    glints(m,(-5,32,4),(-4,32,3),(6,31,6),(0,33,0))
    for y,z in [(22,2),(21,2),(21,3),(20,3)]: m.set(6,y,z,'mustard')
    return m

@register('podium','landmarks',tags=('landmark','talks'),budget=6000)
def podium():
    m=Model('podium').box((-6,0,-5),(6,2,5),'wood_dark')
    m.box((-4,2,-3),(4,13,4),'wood')
    m.box((-3,5,3),(3,11,4),'teal')
    # Pixel microphone crest and a stepped reading surface.
    m.box((-1,7,3),(1,10,4),'cream')
    m.box((-2,6,3),(2,7,4),'cream')
    m.box((-7,13,-5),(7,14,6),'wood_dark')
    m.box((-7,14,-5),(7,15,1),'wood_light')
    m.box((-7,14,1),(7,15,6),'wood')
    m.box((-4,15,-2),(2,16,3),'cream')
    m.line((-3,15,1),(0,15,1),'teal')
    m.box((4,15,-3),(5,19,-2),'metal')
    m.box((3,18,-3),(5,19,-2),'metal')
    m.box((2,18,-3),(4,20,-1),'ink')
    m.box((5,17,-3),(7,19,-2),'coral')
    m.set(6,18,-3,'wood_light')
    m.box((-2,12,3),(2,13,4),'cyan','voxel_glow')
    m.box((3,14,4),(6,15,5),'cyan','voxel_glow')
    glints(m,(4,18,-3))
    return m

@register('projector_screen','landmarks',footprint=(3,1),tags=('landmark','talks'),budget=6000)
def projector():
    m=Model('projector')
    for x in (-18,17):
        m.box((x-2,0,-4),(x+3,1,5),'metal')
        m.box((x,1,-1),(x+1,12,0),'metal_light')
    m.box((-22,12,-1),(22,35,0),'navy')
    m.box((-21,13,-1),(21,34,0),'cream')
    m.box((-22,35,-1),(22,37,1),'metal')
    m.box((-22,11,-1),(22,12,1),'metal')
    m.box((16,35,0),(20,36,1),'cyan','voxel_glow')
    m.set(20,35,0,'led','voxel_glow')
    glints(m,(-21,36,0),(-20,35,0))
    m.box((-18,29,-1),(10,31,0),'teal')
    m.box((-18,26,-1),(-2,27,0),'metal_light')
    # A clearly readable pixel rising chart, and three slide bullets.
    for x,h in [(-16,4),(-11,7),(-6,10)]:
        m.box((x,15,-1),(x+3,15+h,0),'teal' if h<10 else 'coral')
    for y,w in [(22,12),(20,9),(17,11)]:
        m.box((2,y,-1),(4,y+2,0),'mustard')
        m.box((6,y,-1),(6+w,y+1,0),'metal_light')
    return m

@register('ping_pong_table','games',footprint=(2,3),budget=6000)
def ping_pong():
    m=Model('ping-pong')
    # Inset playing area leaves space for the oversized paddles inside its 2x3 footprint.
    m.box((-13,10,-19),(13,12,19),'teal_dark')
    m.box((-13,11,-19),(13,12,19),'teal')
    for x in (-13,12): m.box((x,11,-19),(x+1,12,19),'cream')
    for z in (-19,18): m.box((-13,11,z),(13,12,z+1),'cream')
    m.box((0,11,-19),(1,12,19),'cream')
    for x in (-10,8):
        for z in (-16,14): m.box((x,0,z),(x+2,10,z+2),'metal')
    # A solid translucent mesh panel avoids hundreds of fragile isolated mesh cells.
    m.box((-13,12,0),(13,15,1),'glass','voxel_glass')
    m.box((-13,15,0),(13,16,1),'cream')
    for x in (-14,13): m.box((x,11,0),(x+1,16,1),'metal')
    for x,z,c in [(-8,-12,'coral'),(5,11,'navy')]:
        m.box((x,12,z),(x+4,13,z+4),c)
        m.box((x+1,12,z+4),(x+3,13,z+7),'wood')
    m.set(3,12,-8,'cream')
    return m

@register('foosball_table','games',footprint=(2,1),budget=6000)
def foosball():
    m=table('foosball',24,12)
    m.box((-12,10,-6),(12,12,6),'teal_dark')
    m.box((-13,11,-7),(13,15,7),'wood')
    m.box((-11,12,-5),(11,15,5),None)
    m.box((-11,11,-5),(11,12,5),'teal')
    for x in (-12,11): m.box((x,12,-2),(x+1,14,2),'ink')
    m.box((0,11,-5),(1,12,5),'cream')
    for n,x in enumerate((-8,-3,3,8)):
        m.box((x,14,-8),(x+1,15,8),'metal_light')
        for z in (-3,2):
            m.box((x,12,z),(x+1,16,z+2),'coral' if n%2 else 'navy')
            m.set(x,16,z,'wood_light')
        m.set(x,14,7,'ink')
    m.set(1,12,0,'cream')
    return m

@register('chess_table','games',budget=6000)
def chess():
    m=table('chess',14,14)
    for x in range(-4,4):
        for z in range(-4,4): m.set(x,11,z,'cream' if (x+z)%2 else 'navy')
    for x,z,c,h in [(-4,-3,'wood_dark',2),(-1,-3,'wood_dark',3),(2,-2,'wood_dark',2),(-2,2,'cream',2),(1,1,'cream',3),(3,3,'cream',2)]:
        m.box((x,12,z),(x+1,12+h,z+1),c)
    return m

@register('arcade_cabinet','games',budget=6000)
def arcade():
    m=Model('arcade').box((-6,0,-5),(6,2,5),'ink')
    m.box((-7,2,-6),(7,13,5),'lilac')
    m.box((-7,13,-6),(7,27,1),'lilac')
    m.box((-6,15,0),(6,25,2),'ink')
    m.box((-5,16,1),(5,24,2),'screen','voxel_glow')
    # Tiny pixel invader, with a star and player ship.
    for x,y in [(-3,20),(-2,21),(-1,20),(0,21),(1,20),(-3,19),(1,19)]: m.set(x,y,1,'cyan','voxel_glow')
    m.box((-1,17,1),(2,18,2),'ui_coral','voxel_glow')
    m.set(3,22,1,'led','voxel_glow')
    m.box((-7,25,-1),(7,28,3),'coral')
    m.box((-5,26,2),(5,27,3),'led','voxel_glow')
    m.box((-7,12,1),(7,14,7),'navy')
    m.box((-4,14,4),(-3,16,5),'metal')
    m.box((-5,16,3),(-2,17,6),'coral')
    for x,z,c in [(2,4,'mustard'),(4,3,'teal_light')]: m.set(x,14,z,c)
    m.box((-2,6,4),(2,8,5),'ink')
    m.set(1,7,4,'metal_light')
    tall = Model(m.seed)
    for (x,y,z),v in m.cells.items():
        tall.set(x,y+4 if y>=12 else y,z,v.colour,v.material)
    tall.box((-7,12,-6),(7,16,5),'lilac')
    glints(tall,(-5,27,1),(-4,26,1))
    return tall

@register('tv_console','games',footprint=(2,1),budget=6000)
def tv_console():
    m=Model('tv-console')
    for x in (-12,10): m.box((x,0,-4),(x+2,2,4),'metal')
    m.box((-14,2,-5),(14,7,5),'wood')
    m.box((-12,3,4),(-2,6,5),'navy')
    m.box((0,3,4),(12,6,5),'teal')
    m.box((-10,3,4),(-4,5,6),'cream')
    m.set(-5,4,5,'cyan','voxel_glow')
    m.box((-14,7,-5),(14,8,5),'wood_light')
    for x in (-8,7): m.box((x,8,-3),(x+1,11,-1),'metal')
    m.box((-13,11,-4),(13,27,-2),'ink')
    screen_back(m, -13, 11, -4, 13, 27)
    m.box((-12,12,-3),(12,26,-2),'screen','voxel_glow')
    glints(m,(-12,25,-3),(-11,24,-3))
    # Sunset and mountain game title screen, broad quiet areas around the pixels.
    m.box((5,20,-3),(9,24,-2),'led','voxel_glow')
    for x,h in [(-11,2),(-9,4),(-7,6),(-5,8),(-3,6),(-1,4),(1,2)]:
        m.box((x,12,-3),(x+2,12+h,-2),'cyan','voxel_glow')
    m.box((3,14,-3),(10,15,-2),'ui_coral','voxel_glow')
    for x in (-8,4):
        m.box((x,8,1),(x+5,9,4),'navy')
        m.set(x+1,9,2,'metal_light').set(x+3,9,2,'coral')
    return m

@register('printer','office',tags=('copier','dramatic'),budget=6000)
def printer():
    m=Model('copier')
    for x in (-5,4):
        for z in (-4,3): m.box((x,0,z),(x+2,2,z+2),'ink')
    m.box((-6,2,-5),(6,15,5),'metal_light')
    for y in (3,7):
        m.box((-5,y,5),(5,y+3,6),'cream')
        m.box((-2,y+1,5),(2,y+2,6),'metal')
    m.box((-6,12,4),(6,15,7),'navy')
    m.box((1,14,5),(5,15,7),'cyan','voxel_glow')
    m.set(-3,14,6,'coral','voxel_glow')
    m.box((-5,15,-4),(5,16,4),'teal_dark')
    # Back hinge + two stepped lid strips: an unmistakably open, dramatic copier.
    m.box((-6,15,-5),(6,21,-4),'metal')
    m.box((-6,20,-4),(6,22,-1),'cream')
    m.box((-6,21,-1),(6,23,2),'cream')
    m.box((-4,20,-3),(4,21,0),'navy')
    m.box((-7,10,-2),(-6,13,4),'metal')
    m.box((-8,12,-2),(-6,13,4),'cream')
    m.box((-4,15,0),(3,16,4),'cream')
    m.line((-3,15,2),(1,15,2),'teal')
    return m
