"""Modular character art. No registry side effects; kit pieces never enter office-kit."""
import json
import random
from voxkit import Asset, Model, Part, Slot, Colour, SLOTS
from voxkit.slots import hex_linear, srgb
from voxkit.palette import PALETTE
from voxkit.export import export_glb, atomic_write
from voxkit.mesh import faces

PIVOTS = dict(body=(0,9,0), head=(0,17,0), arm_l=(5,15,0), arm_r=(-4,15,0), leg_l=(2.5,9,0), leg_r=(-1.5,9,0))
LIBRARY = {}
ENTRIES = []
SKINS = [
    ('porcelain','#f2d9c4','#d5a68f'), ('rose','#e9c2ab','#c7927e'),
    ('peach','#ddb08b','#b98065'), ('golden','#cd996a','#a87150'),
    ('amber','#b97d59','#d49c78'), ('copper','#a46b4c','#c68d69'),
    ('umber','#89573f','#b77b5a'), ('cocoa','#704735','#9e6950'),
    ('espresso','#583b32','#895d49'), ('ebony','#422e29','#79513f'),
]
HAIRS = [('soft_black','#302b32','#4e4142'), ('espresso','#423536','#684737'),
    ('chestnut','#684737','#8b6246'), ('walnut','#80573c','#a17b54'),
    ('auburn','#a15b40','#bf8059'), ('copper','#ba7449','#d89963'),
    ('dark_blond','#ac8b59','#c7a977'), ('gold_blond','#d9b974','#ead298'),
    ('silver','#9ba5ac','#c3c6c4'), ('snow','#ded8cc','#eee7da'),
    ('lilac','#aa85bb','#c7acd5'), ('ocean','#497d98','#79afbe'),
    ('mint','#71a68d','#9ac6aa'), ('rose','#bd6f82','#d99ba8')]
CLOTHES = {k: PALETTE[k].hex for k in ('teal','teal_dark','teal_light','coral','coral_dark','mustard','lilac','sage','cream','navy','metal','metal_light')}


def add(category, id, label, models, **meta):
    parts = [Part(bone, model, PIVOTS[bone]) for bone, model in models.items()]
    key = f'{category}/{id}'
    LIBRARY[key] = Asset(key, 'character-parts', parts, character=True, budget=4500)
    ENTRIES.append(dict(category=category, id=id, label=label, node=key,
                        bones=list(models), **meta))


def m(seed): return Model(seed)
def s(name, shade=.92): return Slot(name, shade)
def decal(seed):
    model = m(seed)
    model.decal = True
    return model

# Only neck and exposed hands: clothes own all torso and sleeve volume.
add('base','regular','Regular', {
    'body': m('neck').box((-2,16,-1),(3,17,2),s('skin')),
    'arm_l': m('hand-l').box((4,8,-1),(6,10,2),s('skin')),
    'arm_r': m('hand-r').box((-5,8,-1),(-3,10,2),s('skin')),
})

for id, label in [('bright','Bright eyes'),('smile','Soft smile'),('freckled','Freckled'),
                  ('smile_lines','Smile lines'),('sleepy','Sleepy'),('wink','Wink')]:
    head = m('face-'+id).box((-4,18,-3),(5,23,4),s('skin'))
    head.box((-3,17,-2),(4,18,4),s('skin',.90))
    for x in (-3,2):
        head.box((x,20,3),(x+2,22,4),'ink')
        head.set(x,21,3,'cream')
    if id == 'sleepy':
        for x in (-3,2):
            head.box((x,21,3),(x+2,22,4),s('skin_shade'))
            head.set(x,20,3,'cream')
    if id == 'wink':
        head.box((2,21,3),(4,22,4),s('skin'))
        head.set(3,21,3,s('skin_shade'))
    head.set(0,18,3,'ink').set(1,18,3,'ink')
    head.set(0,19,3,'cream').set(1,19,3,'cream')
    if id == 'smile':
        head.set(-1,19,3,s('skin_shade')).set(2,19,3,s('skin_shade'))
    if id in ('freckled','smile_lines'):
        for x in (-3,3): head.set(x,19,3,s('skin_shade'))
        if id == 'smile_lines':
            head.set(-2,18,3,s('skin_shade')).set(3,18,3,s('skin_shade'))
    head.set(-4,20,2,s('skin_shade')).set(4,20,2,s('skin_shade'))
    add('face',id,label,{'head':head}, expression=id)

HAIR_IDS = ['buzz','short_messy','side_part','curly_top','afro','locs','braids','long_straight','bob','high_bun','space_buns','shaved_sides']
for id in HAIR_IDS:
    hair = m('hair-'+id).box((-4,23,-3),(5,25,4),s('hair'))
    if id not in ('buzz','side_part','short_messy','locs','braids'):
        hair.box((-3,25,-3),(4,26,3),s('hair'))
    if id == 'buzz':
        hair.box((-4,23,-3),(5,24,4),s('hair',.82))
    if id == 'side_part':
        hair.box((2,24,-2),(3,25,4),s('hair_shade'))
    if id == 'short_messy':
        hair.box((-3,25,-2),(0,26,1),s('hair'))
        hair.box((1,25,0),(4,26,3),s('hair'))
        hair.set(-1,23,3,s('hair_shade'))
    if id in ('curly_top','afro'):
        if id == 'afro':
            hair.box((-5,23,-4),(6,26,4),s('hair'))
            hair.box((-4,26,-3),(5,27,3),s('hair'))
        for x,z in [(-3,-2),(0,-2),(3,-2),(-3,1),(0,1),(3,1)]:
            hair.box((x,25,z),(x+2,27,z+2),s('hair_shade' if (x+z)%2 else 'hair'))
        hair.box((-2,26,-2),(3,27,2),s('hair'))
    if id in ('locs','braids'):
        for x in (-5,5):
            hair.box((x,18,-1),(x+1,24,2),s('hair'))
            for y in (19,21,23): hair.set(x,y,1,s('hair_shade'))
        hair.box((-4,20,-4),(5,25,-3),s('hair'))
        for x in (-3,0,3):
            hair.box((x,25,-3),(x+1,26,3),s('hair_shade' if id=='braids' else 'hair'))
        if id=='braids':
            hair.set(-5,18,1,s('accent')).set(5,18,1,s('accent'))
    if id in ('long_straight','bob'):
        low = 18 if id=='long_straight' else 20
        hair.box((-4,low,-4),(5,25,-3),s('hair',.83))
        for x in (-5,5):
            hair.box((x,low,-3),(x+1,24,2),s('hair'))
            hair.box((x,low,0),(x+1,24,1),s('hair_shade',.83))
    if id == 'high_bun':
        hair.box((-2,25,-4),(3,28,0),s('hair'))
        hair.box((-1,28,-3),(2,29,-1),s('hair'))
        hair.box((-1,26,-4),(2,27,-3),s('accent'))
    if id == 'space_buns':
        for x in (-5,3):
            hair.box((x,25,-2),(x+3,28,1),s('hair'))
            hair.box((x+1,28,-1),(x+2,29,0),s('hair_shade'))
    if id == 'shaved_sides':
        hair.box((-4,23,-3),(-2,25,4),s('skin_shade'))
        hair.box((3,23,-3),(5,25,4),s('skin_shade'))
        hair.box((-1,25,-3),(2,27,3),s('hair'))
    # Single-cell forehead edge with a recessed upper crown. Retain side/back
    # volume (especially afro and buns) while opening the steep camera sightline.
    hair.box((-5,24,3),(6,30,4),None)
    hair.set(0,23,3,s('hair_shade',.88))
    add('hair',id,id.replace('_',' ').title(),{'head':hair})

for id in ('beanie','cap','beret','headwrap','headband','headphones'):
    hat = m('hat-'+id)
    if id in ('beanie','cap','beret'):
        hat.box((-4,25,-3),(5,26,4),s('accent',.85))
        hat.box((-3,26,-2),(4,27,3),s('accent'))
        if id == 'beanie':
            hat.box((-2,27,-1),(3,28,2),s('accent'))
            hat.set(0,28,0,s('top_trim'))
        if id == 'cap':
            hat.box((-3,26,3),(4,27,5),s('accent'))
            hat.set(0,26,2,'cream')
        if id == 'beret':
            hat.box((-5,26,-2),(4,27,3),s('accent'))
            hat.set(-2,27,0,s('top_trim'))
    if id == 'headwrap':
        hat.box((-4,23,-3),(5,26,4),s('accent'))
        hat.box((-3,26,-2),(4,27,3),s('accent'))
        hat.box((-4,18,-4),(5,25,-3),s('accent',.82))
        for x in (-5,5): hat.box((x,18,-3),(x+1,25,3),s('accent'))
        hat.box((-3,17,4),(4,18,5),s('accent',.84))
        hat.box((-3,24,4),(4,25,5),s('accent',.84))
    if id == 'headband':
        hat.box((-4,23,4),(5,24,5),s('accent'))
        hat.set(0,23,4,s('top_trim'))
    if id == 'headphones':
        for x in (-6,6):
            hat.box((x,20,-1),(x+1,24,2),s('accent'))
            hat.box((x,24,0),(x+1,27,1),s('top_trim'))
        hat.box((-6,27,0),(7,28,1),s('accent'))
        for x in (-5,5): hat.box((x,20,2),(x+1,23,3),s('top_trim'))
    allowed = ['buzz','side_part'] if id in ('beanie','cap','beret') else (
        ['buzz','side_part','bob','long_straight'] if id=='headphones' else
        [h for h in HAIR_IDS if h!='short_messy'])
    add('headwear',id, 'Headwrap / hijab' if id=='headwrap' else id.title(), {'head':hat},
        hides=['hair','accessory/earrings'] if id=='headwrap' else [], allowedHair=allowed if id!='headwrap' else [])

TOP_IDS = ['hoodie','tee','shirt_tie','cardigan','sweater_vest','overalls','blazer','apron_tee']
for id in TOP_IDS:
    body = m('top-'+id).box((-3,9,-2),(4,16,3),s('top'))
    body.box((-3,9,-2),(-2,11,3),None).box((3,9,-2),(4,11,3),None)
    body.box((-2,9,2),(3,10,3),s('top_trim'))
    arms = {}
    for bone,x in [('arm_l',4),('arm_r',-5)]:
        arm = m(id+bone).box((x,10,-1),(x+2,16,2),s('top'))
        if id in ('tee','overalls','apron_tee'):
            arm.box((x,10,-1),(x+2,13,2),s('skin'))
            arm.box((x,13,-1),(x+2,14,2),s('top_trim'))
        else: arm.box((x,10,-1),(x+2,11,2),s('top_trim'))
        if id=='sweater_vest': arm.box((x,11,-1),(x+2,16,2),s('top_trim'))
        arms[bone]=arm
    if id=='hoodie':
        body.box((-2,15,-3),(3,17,-1),s('top_trim'))
        for x in (-1,1): body.box((x,13,2),(x+1,16,3),'cream')
        body.box((-1,10,2),(2,12,3),s('top_trim')).set(0,11,2,s('top'))
    if id=='tee':
        for x,y in [(1,14),(0,13),(1,13),(0,12),(-1,11)]: body.set(x,y,2,'mustard')
        body.set(-1,14,2,'cream')
    if id=='shirt_tie':
        body.set(-1,15,2,s('top_trim')).set(1,15,2,s('top_trim'))
        body.box((0,11,2),(1,15,3),s('accent')).set(0,15,2,s('accent',.8))
        body.set(2,14,2,'navy')
    if id in ('cardigan','blazer'):
        body.box((-1,10,2),(2,16,3),s('top_trim'))
        if id=='cardigan':
            for y in (11,13): body.box((-1,y,2),(2,y+1,3),'cream')
        else:
            body.set(-2,14,2,s('top_trim')).set(2,14,2,s('top_trim'))
            body.set(2,12,2,'cream')
        for y in (11,13,15): body.set(2,y,2,s('accent'))
    if id=='sweater_vest':
        body.box((-2,15,2),(3,16,3),s('top_trim'))
        body.set(0,14,2,s('top_trim')).set(0,13,2,s('accent'))
        for x,y in [(-2,11),(2,11),(0,10)]: body.set(x,y,2,s('accent',.8))
    if id in ('overalls','apron_tee'):
        body.box((-2,9,2),(3,14,3),s('top_trim'))
        for x in (-2,2): body.box((x,13,2),(x+1,16,3),s('top_trim'))
        body.box((-1,10,2),(2,12,3),s('accent'))
        body.set(0,11,2,'cream')
        if id=='overalls':
            for x in (-2,2): body.set(x,14,2,'mustard')
    add('top',id,id.replace('_',' ').title(),{'body':body,**arms})

for id in ('trousers','shorts','wide_trousers','skirt_leggings'):
    models = {}
    for bone,x in [('leg_l',1),('leg_r',-3)]:
        leg=m(id+bone).box((x,1,-1),(x+3,9,2),s('bottom'))
        if id=='shorts': leg.box((x,2,-1),(x+3,5,2),s('skin'))
        if id=='wide_trousers':
            outer=x if x>0 else x-1
            leg.box((outer,2,-2),(outer+4,8,2),s('bottom'))
        if id=='skirt_leggings':
            leg.box((x,6,-1),(x+3,9,2),None)
            leg.box((x,2,-1),(x+3,6,2),s('bottom',.7))
        leg.box((x,0,-1),(x+3,2,3),s('shoes'))
        leg.box((x,0,2),(x+3,1,3),'cream')
        models[bone]=leg
    if id=='skirt_leggings':
        skirt=m('skirt').box((-4,6,-2),(5,9,3),s('bottom'))
        skirt.box((-4,6,2),(5,7,3),s('bottom',.80))
        skirt.box((-4,8,-2),(-3,9,3),None).box((4,8,-2),(5,9,3),None)
        models['body']=skirt
    add('bottom',id,id.replace('_',' ').title(),models)

for id in ('round_glasses','square_glasses','earrings','lanyard','beard','moustache','freckles','backpack'):
    bone='body' if id in ('lanyard','backpack') else 'head'
    a=decal(id) if id in ('lanyard','beard','moustache','freckles') else m(id)
    if id in ('round_glasses','square_glasses'):
        for x in (-4,1):
            a.box((x,19,4),(x+4,23,5),'ink')
            a.box((x+1,20,4),(x+3,22,5),'glass','voxel_glass')
            if id=='round_glasses':
                for dx,dy in [(0,0),(3,0),(0,3),(3,3)]: a.set(x+dx,19+dy,4,None)
        a.set(0,21,4,'ink')
    if id=='earrings':
        a.set(-6,19,2,s('accent')).set(6,19,2,s('accent'))
        # Connect through the ear region without intersecting hair volume.
        a.set(-5,19,2,s('accent')).set(5,19,2,s('accent'))
    if id=='lanyard':
        for x in (-1,1): a.box((x,13,2),(x+1,16,3),s('accent'))
        a.box((-1,11,2),(2,13,3),'cream').set(0,12,2,s('top_trim')).set(1,11,2,'mustard')
    if id=='beard':
        a.box((-3,18,3),(4,19,4),s('hair'))
        a.box((-2,17,3),(3,18,4),s('hair_shade'))
        a.set(0,18,3,None).set(1,18,3,None)
    if id=='moustache': a.box((-1,19,3),(3,20,4),s('hair'))
    if id=='freckles':
        for x in (-3,-1,2,4): a.set(x,19,3,s('skin_shade'))
    if id=='backpack':
        a.box((-2,10,-4),(3,15,-2),s('accent'))
        a.box((-1,11,-5),(2,13,-4),s('top_trim'))
        a.set(0,14,-4,'cream')
    add('accessory',id,id.replace('_',' ').title(),{bone:a}, decal=a.decal)


def palette(skin=4, hair=1, top='teal', trim='teal_dark', bottom='navy', shoes='cream', accent='mustard'):
    return dict(skin=SKINS[skin][1],skin_shade=SKINS[skin][2],hair=HAIRS[hair][1],hair_shade=HAIRS[hair][2],
                top=CLOTHES[top],top_trim=CLOTHES[trim],bottom=CLOTHES[bottom],shoes=CLOTHES[shoes],accent=CLOTHES[accent])


def recipe(**kw):
    return dict(base='regular',face='bright',hair='buzz',headwear=None,top='hoodie',bottom='trousers',accessories=[],**kw) if not kw else {**recipe(),**kw}


def selected_keys(r):
    keys=[f'{c}/{r[c]}' for c in ('base','face','top','bottom')]
    hat=next((e for e in ENTRIES if e['node']==f"headwear/{r.get('headwear')}"),None)
    if not hat or 'hair' not in hat['hides']:
        if hat and r['hair'] not in hat['allowedHair']: raise ValueError('Incompatible hair/headwear')
        keys.append('hair/'+r['hair'])
    if hat: keys.append(hat['node'])
    keys.extend('accessory/'+a for a in r.get('accessories',[]) if not hat or 'accessory/'+a not in hat['hides'])
    forbidden=[('round_glasses','square_glasses'),('beard','moustache'),('beard','freckles'),('moustache','freckles')]
    for a,b in forbidden:
        if a in r.get('accessories',[]) and b in r.get('accessories',[]): raise ValueError('Exclusive accessories')
    return keys


def resolved(model,pal):
    out=Model(model.seed)
    out.decal=model.decal
    for cell,v in model.cells.items():
        if isinstance(v.colour,Slot):
            rgb=srgb(tuple(c*f for c,f in zip(hex_linear(pal[v.colour.name]),v.colour.multiplier(cell,model.seed))))
            c=Colour('#'+''.join(f'{round(c*255):02x}' for c in rgb),0)
        else: c=v.colour
        out.set(*cell,c,v.material)
    return out


def assemble(r,pal,id='preview'):
    # Merge solids within each bone for previews, preserving the exact cell shading.
    models={bone:Model(id+bone) for bone in PIVOTS}
    decals=[]
    for key in selected_keys(r):
        for part in LIBRARY[key].parts:
            materialized=resolved(part.model,pal)
            if materialized.decal:
                decals.append(Part(part.name,materialized,part.pivot))
            else:
                overlap=set(models[part.name].cells)&set(materialized.cells)
                if overlap: raise ValueError(f'{key} overlaps {len(overlap)} cells: {sorted(overlap)[:3]}')
                # All colours become fixed jitter-free for exact matching to runtime.
                for cell,v in materialized.cells.items():
                    rgb=v.colour.rgb(cell,materialized.seed)
                    models[part.name].set(*cell,Colour('#'+''.join(f'{round(c*255):02x}' for c in rgb),0),v.material)
    occupied={}
    for bone,model in models.items():
        for cell in model.cells:
            if cell in occupied: raise ValueError(f'{bone} intersects {occupied[cell]} at {cell}')
            occupied[cell]=bone
    return Asset(id,'characters',[Part(b,m,PIVOTS[b]) for b,m in models.items()]+decals,character=True,budget=4500)


def sample(seed=731204,count=30):
    rng=random.Random(seed)
    records=[]
    for i in range(count):
        h=rng.choice(HAIR_IDS)
        hat=rng.choice([None,None,None,'beanie','cap','beret','headwrap','headband','headphones'])
        if i < len(HAIR_IDS):
            h,hat=HAIR_IDS[i],None
        elif i < len(HAIR_IDS)+6:
            hat=['beanie','cap','beret','headwrap','headband','headphones'][i-len(HAIR_IDS)]
        if hat:
            entry=next(e for e in ENTRIES if e['node']=='headwear/'+hat)
            if entry['allowedHair']: h=rng.choice(entry['allowedHair'])
        accessories=rng.sample(['earrings','lanyard','backpack'],rng.randrange(3))
        if rng.random()<.35: accessories.append(rng.choice(['round_glasses','square_glasses']))
        if rng.random()<.3: accessories.append(rng.choice(['beard','moustache','freckles']))
        r=recipe(face=rng.choice(['bright','smile','freckled','smile_lines','sleepy','wink']),hair=h,headwear=hat,
                 top=rng.choice(TOP_IDS),bottom=rng.choice(['trousers','shorts','wide_trousers','skirt_leggings']),accessories=accessories)
        # Stratified uniform coverage, with seed-shuffled order; skin is independent of style.
        tone=i%len(SKINS)
        pal=palette(tone,rng.randrange(len(HAIRS)),*[rng.choice(list(CLOTHES)) for _ in range(5)])
        records.append(dict(id=f'sample_{i:02}',recipe=r,palette=pal,skinTone=SKINS[tone][0]))
    rng.shuffle(records)
    return records


STAFF = {
    'visitor': (recipe(top='blazer',hair='buzz',headwear='cap',accessories=['backpack']),palette(5,1,'mustard','cream','teal_dark','cream','teal')),
    'dev_hoodie': (recipe(hair='afro'),palette(7,0)),
    'dev_glasses': (recipe(hair='side_part',top='sweater_vest',accessories=['square_glasses']),palette(4,1,'sage','cream','metal','navy','teal_dark')),
    'dev_slacker': (recipe(hair='short_messy',top='tee',accessories=['beard']),palette(2,1,'navy','metal','metal','cream','mustard')),
    'manager': (recipe(hair='side_part',top='shirt_tie',face='smile_lines'),palette(8,8,'cream','metal_light','navy','navy','coral')),
    'designer': (recipe(hair='side_part',headwear='beret',top='cardigan',accessories=['earrings']),palette(6,1,'lilac','coral','teal_dark','coral','mustard')),
    'barista': (recipe(hair='high_bun',headwear='headband',top='apron_tee'),palette(3,4,'cream','teal_dark','navy','teal','sage')),
    'intern': (recipe(hair='curly_top',accessories=['lanyard']),palette(9,6,'sage','teal_dark','navy','teal','coral')),
}


def catalog():
    return dict(version=1, glb='character-parts.glb', unitsPerVoxel=1/16,
        rig={k:[v/16 for v in p] for k,p in PIVOTS.items()},
        slots=[dict(index=i,name=n) for i,n in enumerate(SLOTS)],
        encoding=dict(attribute='_SLOT',threeAttribute='_slot',colour='COLOR_0',space='linear',bakedSlot=0,
                      formula='slot == 0 ? sourceRGB : linear(palette[slot]) * sourceRGB',alpha='preserve source alpha'),
        categories={c:[e['id'] for e in ENTRIES if e['category']==c] for c in dict.fromkeys(e['category'] for e in ENTRIES)},
        parts=ENTRIES,
        compatibility=dict(headwear={e['id']:{'hides':e['hides'],'allowedHair':e['allowedHair']} for e in ENTRIES if e['category']=='headwear'},
                           exclusiveAccessories=[['round_glasses','square_glasses'],['beard','moustache'],['beard','freckles'],['moustache','freckles']],
                           maxAccessories=4, maxAssembledTriangles=4500),
        palettes=dict(skin=[dict(id=id,skin=c,skin_shade=d,weight=1) for id,c,d in SKINS],
                      hair=[dict(id=id,hair=c,hair_shade=d,playful=i>=10) for i,(id,c,d) in enumerate(HAIRS)],clothing=CLOTHES),
        generation=dict(skinDistribution='uniform; sample independently of style, role, name and gender',seed=731204),
        recipes={**{id:dict(recipe=r,palette=p,fixedFallback=id) for id,(r,p) in STAFF.items()},'max':dict(fixedAsset='max',bespoke=True)},
        previewSamples=sample())


def export(public,output,glb_directory=None):
    export_glb(list(LIBRARY.values()),(glb_directory or public)/'character-parts.glb')
    atomic_write(public/'character-parts.json',(json.dumps(catalog(),indent=2)+'\n').encode())
    # Fail during builds on every allowed hair/hat combination, all clothing pairings,
    # and all generated samples. No intersecting solid voxels on a common bone.
    tested=0
    for h in HAIR_IDS:
        for hat in [None,'beanie','cap','beret','headwrap','headband','headphones']:
            r=recipe(hair=h,headwear=hat)
            try: selected_keys(r)
            except ValueError: continue
            assemble(r,palette()); tested+=1
    for top in TOP_IDS:
        for bottom in ('trousers','shorts','wide_trousers','skirt_leggings'):
            assemble(recipe(top=top,bottom=bottom),palette()); tested+=1
    for record in sample(): assemble(record['recipe'],record['palette']); tested+=1
    atomic_write(output/'modular-build-report.json',(json.dumps(dict(parts=len(LIBRARY),combinationsChecked=tested,
        triangles={k:sum(2 for p in a.parts for _ in faces(p.model,p.pivot)) for k,a in LIBRARY.items()}),indent=2)+'\n').encode())


def previews(output,registry,only=None):
    from voxkit.preview import render_scene
    def sheet(assets, definition, path, title):
        if only is not None and path.stem not in only: return
        import bpy
        import subprocess
        from bpy_extras.object_utils import world_to_camera_view
        from mathutils import Vector
        from voxkit.preview import blender_xyz
        render_scene(assets, definition, path)
        scene=bpy.context.scene
        if 'pitch' in definition:
            # Keep the normal 50-degree asset renderer/cache unchanged; this proof
            # additionally demonstrates the requested 45-degree office camera.
            from math import radians, sin, cos
            camera=scene.camera
            target=camera.location + camera.rotation_euler.to_quaternion() @ Vector((0,0,-30))
            yaw,pitch=radians(18),radians(definition['pitch'])
            camera.location=target + Vector((sin(yaw)*cos(pitch),-cos(yaw)*cos(pitch),sin(pitch)))*30
            camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
            bpy.context.view_layer.update()
            bpy.ops.render.render(write_still=True)
        labels=[]
        for item in definition['placements']:
            front=max(max(abs(z),abs(z+1)) for part in assets[item['id']].parts for x,y,z in part.model.cells)/16
            point=Vector(blender_xyz((item.get('x',0),0,item.get('z',0)+front+.12)))
            uv=world_to_camera_view(scene,scene.camera,point)
            labels.append(dict(x=round(uv.x*definition['resolution']),y=round((1-uv.y)*definition['resolution']),text=item.get('label',item['id'].replace('_',' '))))
        label_path=path.with_suffix('.labels.json')
        atomic_write(label_path,json.dumps(dict(title=title,labels=labels)).encode())
        from pathlib import Path
        subprocess.run(['node',str(Path(__file__).parent/'label-character-sheet.mjs'),str(path),str(label_path)],check=True)
    folder=output/'previews'
    records=sample()
    assets={r['id']:assemble(r['recipe'],r['palette'],r['id']) for r in records}
    sheet(assets,dict(resolution=1800,placements=[dict(id=r['id'],label=r['id'].replace('sample_','#')+' / '+r['skinTone'],x=(i%6)*1.5,z=(i//6)*2.5) for i,r in enumerate(records)]),folder/'characters_diversity.png','Office neighbours / seed 731204 / 30 assemblies')
    # Each category is shown on the same complete neutral rig; category sheets isolate variation.
    for category in catalog()['categories']:
        entries=[e for e in ENTRIES if e['category']==category]
        registry_sheet={}
        placements=[]
        for i,e in enumerate(entries):
            r=recipe(top='tee',hair='buzz')
            if category=='accessory': r['accessories']=[e['id']]
            else: r[category]=e['id']
            if category=='headwear' and e['id']=='headband': r['hair']='high_bun'
            id=e['id']; registry_sheet[id]=assemble(r,palette(i%10,1),id)
            placements.append(dict(id=id,x=(i%4)*1.6,z=(i//4)*2.7,rotation=180 if id=='backpack' else 0,label='backpack / rear' if id=='backpack' else e['label']))
        sheet(registry_sheet,dict(resolution=1400,placements=placements),folder/f'parts_{category}.png',f'{category.title()} / same shared rig')
    ids=['robo_vacuum','robo_courier','drone_cam','robo_barista','plant_bot','office_parrot','office_hamster']
    sheet(registry,dict(resolution=1600,placements=[dict(id=id,x=(i%4)*1.5,z=(i//4)*2.2) for i,id in enumerate(ids)]),folder/'robots_critters.png','Little office helpers')
    contrast={}
    placements=[]
    for row,tone in enumerate((0,9)):
        for col,face in enumerate(catalog()['categories']['face']):
            id=f'{face}_{tone}'
            person=assemble(recipe(face=face),palette(tone),id)
            person.parts=[p for p in person.parts if p.name=='head']
            contrast[id]=person
            placements.append(dict(id=id,label=face.replace('_',' ')+' / '+SKINS[tone][0],x=col*1.1,z=row*1.9,y=-17/16))
    sheet(contrast,dict(resolution=1800,placements=placements),folder/'faces_contrast.png','Face pixels / lightest and deepest skin')
    proof={}
    placements=[]
    hats={'buzz':'cap','side_part':'beret','bob':'headphones','high_bun':'headband'}
    for i,hair in enumerate(HAIR_IDS):
        id='proof_'+hair
        r=recipe(hair=hair,headwear=hats.get(hair),top=TOP_IDS[i%len(TOP_IDS)])
        proof[id]=assemble(r,palette(i%10,i%len(HAIRS)),id)
        placements.append(dict(id=id,label=hair.replace('_',' '),x=(i%4)*2.2,z=(i//4)*3))
    for i,id in enumerate(('visitor','max'),start=12):
        proof[id]=registry[id]
        placements.append(dict(id=id,label=id+' / fixed',x=(i%4)*2.2,z=(i//4)*3))
    sheet(proof,dict(resolution=960,pitch=45,placements=placements),folder/'faces_game_angle.png',
          '45° game camera / 12 assemblies + visitor + Max')
