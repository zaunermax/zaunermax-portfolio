"""Exhaust the combinatorial fit contract without Blender or colour conversion."""
import unittest
import math
from character_kit import LIBRARY, HAIR_IDS, TOP_IDS, ENTRIES, PIVOTS, SKINS, recipe, selected_keys, sample
from voxkit.mesh import faces
from voxkit.slots import hex_linear
from voxkit.palette import PALETTE


class ModularTests(unittest.TestCase):
    def test_every_allowed_solid_combination(self):
        # Maximum-cost accessories also exercise the ear/headwear and bag/hood seams.
        cache={key:[(p.name,set(p.model.cells)) for p in a.parts if not p.model.decal] for key,a in LIBRARY.items()}
        counts={key:sum(2 for p in a.parts for _ in faces(p.model,p.pivot)) for key,a in LIBRARY.items()}
        tested=0
        worst=0
        for hair in HAIR_IDS:
            for hat in [None,'beanie','cap','beret','headwrap','headband','headphones']:
                r=recipe(hair=hair,headwear=hat,accessories=['earrings','backpack','lanyard','round_glasses'])
                try: selected_keys(r)
                except ValueError: continue
                for top in TOP_IDS:
                    for bottom in ('trousers','shorts','wide_trousers','skirt_leggings'):
                        r.update(top=top,bottom=bottom)
                        keys=selected_keys(r)
                        occupied=set()
                        bones={b:set() for b in PIVOTS}
                        for key in keys:
                            for bone,cells in cache[key]:
                                self.assertFalse(occupied & cells,f'{r}: {key} overlaps another component/bone')
                                occupied |= cells
                                bones[bone] |= cells
                        # Every limb/neck stays face-adjacent to the body in bind pose.
                        # A skirt owns the upper leg volume on body, so the 3-cell hip recess is deliberate.
                        for bone in ('head','arm_l','arm_r','leg_l','leg_r'):
                            self.assertTrue(any((x+dx,y+dy,z+dz) in bones['body'] for x,y,z in bones[bone]
                                for dx,dy,dz in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1))),f'{r}: disconnected {bone}')
                        worst=max(worst,sum(counts[k] for k in keys))
                        tested+=1
        self.assertEqual(tested,1440)
        self.assertLessEqual(worst,4500)
        print(f'{tested} exhaustive combinations: no intersecting voxels, every joint connected; maximum {worst} triangles')

    def test_faces_have_identical_socket(self):
        cells=[set(LIBRARY[e['node']].parts[0].model.cells) for e in ENTRIES if e['category']=='face']
        self.assertTrue(all(c==cells[0] for c in cells))

    def test_eye_sightlines_at_game_pitch(self):
        # Trace from the actual front eye/glint pixels toward the camera, through
        # every legal hair/hat silhouette. Back-facing heads are intentionally
        # excluded: this checks overhang, not whether actors face the camera.
        def visible(cells, x, y, pitch, yaw):
            pitch,yaw=math.radians(pitch),math.radians(yaw)
            direction=(math.sin(yaw)*math.cos(pitch),math.sin(pitch),math.cos(yaw)*math.cos(pitch))
            for step in range(1,401):
                t=step/40
                cell=tuple(math.floor(v+d*t) for v,d in zip((x+.5,y+.5,4.001),direction))
                if cell in cells: return False
            return True
        checked=0
        for hair in HAIR_IDS:
            for hat in (None,'beanie','cap','beret','headwrap','headband','headphones'):
                try: keys=selected_keys(recipe(hair=hair,headwear=hat))
                except ValueError: continue
                cells={cell for key in keys for p in LIBRARY[key].parts for cell in p.model.cells}
                for pitch in (45,50):
                    for yaw in (-35,0,18,35):
                        for x in (-3,2):
                            self.assertTrue(visible(cells,x,21,pitch,yaw),f'{hair}/{hat}: glint hidden at {pitch}/{yaw}')
                            self.assertTrue(visible(cells,x+1,20,pitch,yaw),f'{hair}/{hat}: eye hidden at {pitch}/{yaw}')
                        checked+=1
        from assets.cast import visitor
        cells={cell for p in visitor() for cell in p.model.cells}
        for pitch in (45,50):
            for yaw in (-35,0,18,35):
                for x in (-3,2): self.assertTrue(visible(cells,x,21,pitch,yaw),'Visitor cap hides glint')
        print(f'{checked} modular camera sightlines plus visitor: both eyes and glints visible')

    def test_face_contrast_all_skin_tones(self):
        def luminance(rgb): return sum(c*w for c,w in zip(rgb,(.2126,.7152,.0722)))
        def ratio(a,b): return (max(a,b)+.05)/(min(a,b)+.05)
        ink=luminance(hex_linear(PALETTE['ink'].hex))
        cream=luminance(hex_linear(PALETTE['cream'].hex))
        self.assertGreater(ratio(ink,cream),10)
        for id,skin,shade in SKINS:
            value=luminance(hex_linear(skin))
            self.assertGreater(max(ratio(value,ink),ratio(value,cream)),3,id)
        for entry in ENTRIES:
            if entry['category']!='face': continue
            cells=LIBRARY[entry['node']].parts[0].model.cells
            eyes=[v.colour.hex for (x,y,z),v in cells.items() if y in (20,21) and z==3 and hasattr(v.colour,'hex')]
            self.assertIn(PALETTE['cream'].hex,eyes,entry['id'])
            self.assertIn(PALETTE['ink'].hex,eyes,entry['id'])
        print('Face contrast: all 10 skin tones and all 6 expressions retain dark eyes / cream glints')

    def test_determinism_and_coverage(self):
        a,b=sample(),sample()
        self.assertEqual(a,b)
        self.assertEqual({r['skinTone'] for r in a}.__len__(),10)
        self.assertEqual({r['recipe']['hair'] for r in a},set(HAIR_IDS))
        self.assertEqual({r['recipe']['headwear'] for r in a},{None,'beanie','cap','beret','headwrap','headband','headphones'})
        for r in a: selected_keys(r['recipe'])


if __name__=='__main__': unittest.main()
