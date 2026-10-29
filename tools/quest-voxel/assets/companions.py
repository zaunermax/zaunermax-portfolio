"""Small office companions: warm plastic, oversize eyes and useful little jobs."""
from voxkit import Model, Part, register


def eyes(m,xs,y,z):
    for x in xs:
        m.set(x,y,z,'cyan','voxel_glow')
    return m


@register('robo_courier','characters',character=True,budget=2500,tags=('robot','courier'))
def courier():
    b=Model('courier')
    for x in (-5,3): b.box((x,0,-3),(x+2,3,3),'navy')
    b.box((-4,2,-4),(4,6,4),'teal_dark')
    b.box((-3,6,-3),(3,8,3),'teal')
    b.box((-3,4,3),(3,6,4),'navy')
    eyes(b,(-2,1),5,3)
    b.set(0,3,3,'coral')
    top=Model('courier-parcel').box((-3,8,-3),(3,12,3),'wood')
    top.box((-1,8,2),(1,12,3),'wood_light').box((-1,11,-3),(1,12,3),'wood_light')
    top.box((1,9,2),(3,11,3),'cream').set(1,9,2,'teal_dark')
    return [Part('body',b,(0,3,0)),Part('top',top,(0,8,0))]


@register('drone_cam','characters',character=True,budget=2500,tags=('robot','hover','camera'))
def drone():
    b=Model('drone').box((-3,2,-2),(3,6,3),'cream')
    b.box((-2,6,-1),(2,7,2),'teal')
    b.box((-2,3,3),(2,5,4),'navy').set(-1,4,3,'cyan','voxel_glow').set(0,4,3,'cyan','voxel_glow')
    for x in (-3,2): b.box((x,0,-1),(x+1,2,2),'metal')
    # Diagonal chunky booms join all rotors to the body.
    for x in (-5,3): b.box((x,4,-4),(x+2,5,5),'metal')
    b.box((-5,4,-1),(5,5,1),'metal')
    parts=[Part('body',b,(0,4,0))]
    for name,x,z in [('fl',4,4),('fr',-4,4),('bl',4,-4),('br',-4,-4)]:
        r=Model('rotor-'+name).box((x-2,5,z-1),(x+2,6,z+1),'teal_dark')
        r.box((x-1,5,z-2),(x+1,6,z+2),'teal_dark')
        r.set(x,5,z,'mustard')
        parts.append(Part('rotor_'+name,r,(x,5.5,z)))
    return parts


@register('robo_barista','characters',character=True,budget=2500,tags=('robot','coffee'))
def barista():
    b=Model('barista-base').box((-4,0,-3),(4,2,4),'navy')
    b.box((-3,2,-2),(3,5,3),'teal')
    b.box((-2,3,2),(2,5,3),'navy'); eyes(b,(-1,1),4,2)
    b.set(0,2,2,'coral')
    top=Model('barista-arm').box((-1,5,-1),(2,9,2),'metal_light')
    top.box((0,8,0),(4,10,2),'cream')
    top.box((3,6,0),(5,9,2),'metal')
    top.box((2,5,1),(6,6,5),'mustard')
    top.box((3,6,2),(5,9,4),'coral')
    top.box((3,8,2),(5,9,4),'coffee')
    top.box((5,6,2),(6,8,3),'coral')
    top.set(0,9,1,'cyan','voxel_glow')
    return [Part('body',b,(0,2,0)),Part('top',top,(0,5,0))]


@register('plant_bot','characters',character=True,budget=2500,tags=('robot','plant','watering'))
def plant():
    b=Model('watering-bot')
    for x in (-4,2): b.box((x,0,-2),(x+2,2,3),'navy')
    b.box((-3,2,-3),(3,6,3),'sage')
    b.box((-2,3,2),(2,5,3),'navy'); eyes(b,(-1,1),4,2)
    b.box((3,3,0),(5,5,2),'teal').box((4,5,0),(6,7,2),'teal')
    b.set(5,6,1,'cyan','voxel_glow')
    top=Model('plant-top').box((-3,6,-3),(3,8,3),'coral')
    top.box((-2,7,-2),(2,8,2),'soil')
    top.box((-1,8,0),(1,12,1),'leaf_dark')
    top.box((-3,9,0),(0,11,2),'leaf').box((0,10,-1),(3,12,1),'leaf_light')
    top.box((-1,12,0),(1,13,2),'leaf')
    return [Part('body',b,(0,2,0)),Part('top',top,(0,6,0))]


@register('office_parrot','characters',character=True,budget=2500,tags=('animal','bird'))
def parrot():
    b=Model('parrot-body')
    for x in (-2,1): b.box((x,0,0),(x+1,2,3),'mustard')
    b.box((-2,2,-2),(3,7,3),'teal')
    b.box((-1,3,2),(2,6,3),'mustard')
    head=Model('parrot-head').box((-2,7,-1),(3,11,4),'leaf')
    head.box((-1,11,0),(2,12,3),'leaf_light')
    for x in (-2,2):
        head.box((x,8,3),(x+1,10,4),'cream').set(x,8,3,'ink')
    head.box((0,7,4),(2,9,5),'mustard').set(0,7,4,'coral_dark')
    parts=[Part('body',b,(0,3,0)),Part('head',head,(0,7,1))]
    for name,x in [('wing_l',3),('wing_r',-3)]:
        w=Model(name).box((x,3,-2),(x+1,7,2),'teal_dark')
        w.box((x,3,-2),(x+1,4,1),'coral')
        parts.append(Part(name,w,(x+.5,6,0)))
    tail=Model('parrot-tail').box((-1,2,-4),(2,4,-2),'teal_dark')
    tail.box((-1,1,-5),(2,3,-4),'coral')
    parts.append(Part('tail',tail,(0,3,-2)))
    return parts


@register('office_hamster','characters',character=True,budget=2500,tags=('animal','hamster','ball'))
def hamster():
    # Mostly open stepped ball cage. Sparse glass panels keep the face readable.
    ball=Model('hamster-ball')
    outline=[(-2,0),( -1,0),(0,0),(1,0),(2,1),(3,2),(4,3),(4,4),(3,5),(2,6),(1,7),(0,7),(-1,7),(-2,7),(-3,6),(-4,5),(-5,4),(-5,3),(-4,2),(-3,1)]
    for x,y in outline:
        ball.set(x,y,-2,'teal_light').set(x,y,3,'teal_light')
    for x,y in [(-5,3),(4,3),(-1,0),(-1,7)]:
        ball.box((x,y,-2),(x+1,y+1,4),'teal_light')
    ball.box((-3,2,-2),(3,6,-1),'glass','voxel_glass')
    b=Model('hamster-body').box((-2,1,-1),(2,4,2),'wood')
    b.box((-1,1,1),(1,3,3),'cream')
    head=Model('hamster-head').box((-2,3,0),(2,6,3),'wood_light')
    for x in (-2,1):
        head.set(x,6,1,'coral').set(x,4,2,'ink').set(x,5,2,'cream')
    head.set(0,3,2,'coral_dark')
    return [Part('body',b,(0,2,0)),Part('head',head,(0,4,1)),Part('ball',ball,(0,4,1))]
