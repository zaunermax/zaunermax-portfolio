"""Geometry/contract regression checks. No Blender dependency: python3 test_voxkit.py."""
import unittest
from build import discover
from voxkit import Model
from voxkit.mesh import faces


class GeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = discover()

    def test_opaque_and_transparent_interfaces(self):
        opaque = Model().box((0, 0, 0), (2, 1, 1), "wood")
        self.assertEqual(len(list(faces(opaque))), 10)
        opaque.set(1, 0, 0, "cyan", "voxel_glow")
        self.assertEqual(len(list(faces(opaque))), 10)
        opaque.set(1, 0, 0, "glass", "voxel_glass")
        fs = list(faces(opaque))
        self.assertEqual(len(fs), 11)
        # Only opaque side survives shared plane, avoiding both holes and z-fighting.
        shared = [f for f in fs if all(v[0] == 1/16 for v in f[0])]
        self.assertEqual(len(shared), 1)
        self.assertEqual(shared[0][3], "voxel")
        opaque.set(0, 0, 0, "glass", "voxel_glass")
        self.assertEqual(len(list(faces(opaque))), 10)

    def test_grid_transform_roundtrips(self):
        model = Model().set(-2, 3, 7, "coral").set(4, 1, -3, "cream")
        self.assertEqual(model.cells, model.rotate(4).cells)
        rotated = model
        for _ in range(4):
            rotated = rotated.rotate()
        self.assertEqual(model.cells, rotated.cells)
        for axis in "xyz":
            self.assertEqual(model.cells, model.mirror(axis).mirror(axis).cells)
        self.assertEqual(Model().set(0, 0, 0, "cream").rotate().cells.keys(), {(0, 0, -1)})

    def test_desks_have_identical_cross_sections(self):
        ids = ("desk_single", "desk_end_l", "desk_mid", "desk_end_r")
        sections = [{p: v for p, v in self.assets[id].parts[0].model.cells.items() if p[1] >= 10} for id in ids]
        self.assertTrue(all(s == sections[0] for s in sections))
        for model in sections:
            for z in range(-8, 8):
                self.assertIn((-8, 11, z), model)
                self.assertIn((7, 11, z), model)
        self.assertFalse(any(y < 10 for x, y, z in self.assets['desk_mid'].parts[0].model.cells))

    def test_pod_and_bookshelf_voxels_do_not_overlap(self):
        row = [('desk_end_l', 0), ('desk_mid', 16), ('desk_mid', 32), ('desk_end_r', 48)]
        combined = set()
        for z, reverse in [(0, False), (-16, True)]:
            for id, x in row:
                model = self.assets[id].parts[0].model
                if reverse:
                    model = model.rotate(2)
                    x = 48 - x
                cells = {(a+x, b, c+z) for a, b, c in model.cells}
                self.assertFalse(combined & cells)
                combined |= cells
        shelf = self.assets['bookshelf'].parts[0].model
        self.assertFalse(set(shelf.cells) & {(x+16, y, z) for x, y, z in shelf.cells})
        for y in (1, 8, 15, 23):
            for z in range(-5, 5):
                self.assertIn((-8, y, z), shelf.cells)
                self.assertIn((7, y, z), shelf.cells)

    def test_character_shoulders_and_hips_connect(self):
        for id in ('max', 'dev_glasses'):
            parts = {p.name: p for p in self.assets[id].parts}
            body = set(parts['body'].model.cells)
            for name in ('arm_l', 'arm_r', 'leg_l', 'leg_r'):
                cells = set(parts[name].model.cells)
                self.assertFalse(cells & body, f'{id}/{name} intersects body')
                self.assertTrue(any(tuple(p[i]+d[i] for i in range(3)) in body
                                    for p in cells for d in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]),
                                f'{id}/{name} floats away from body')


if __name__ == '__main__':
    unittest.main()
