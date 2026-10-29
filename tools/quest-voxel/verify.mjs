// Parse the real exports with the engine's three.js GLTFLoader, without DOM/WebGL.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBytes } from './gltf-loader.mjs';
import { verifyOptimization } from './verify-optimization.mjs';
import { Box3 } from 'three';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, '../../public/lab/quest');
const manifest = JSON.parse(await readFile(path.join(publicDir, 'kit-manifest.json')));
const stats = JSON.parse(await readFile(path.join(root, 'out/build-report.json')));
const expectedMaterials = ['voxel', 'voxel_glow', 'voxel_glass'];
const expectedParts = ['head', 'body', 'arm_l', 'arm_r', 'leg_l', 'leg_r'].sort();
const files = ['office-kit.glb', 'characters.glb'].map(f => path.join(publicDir, f));
files.push(...Object.keys(manifest).map(id => path.join(root, 'out', `${id}.glb`)));
const report = [];
for (const file of files) {
  const bytes = await readFile(file);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.deepEqual(doc.materials.map(m => m.name), expectedMaterials);
  const names = doc.scenes[0].nodes.map(index => doc.nodes[index].name).sort();
  const basename = path.basename(file);
  const expected = basename === 'office-kit.glb' ? Object.keys(manifest).filter(id => manifest[id].family !== 'characters') :
    basename === 'characters.glb' ? Object.keys(manifest).filter(id => manifest[id].family === 'characters') : [basename.slice(0, -4)];
  assert.deepEqual(names, expected.sort(), `Top-level ids in ${basename}`);
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.COLOR_0 !== undefined);
    assert.ok(primitive.attributes.NORMAL !== undefined);
    assert.equal(primitive.attributes.TEXCOORD_0, undefined);
    assert.equal(doc.accessors[primitive.attributes.COLOR_0].count, doc.accessors[primitive.attributes.POSITION].count);
  }
  const gltf = await loadBytes(bytes);
  const entries = [];
  for (const asset of gltf.scene.children) {
    const id = asset.userData.id;
    assert.ok(manifest[id]);
    if (manifest[id].family === 'characters') {
      const partNames = Object.keys(stats[id].parts).sort();
      if (manifest[id].tags.includes('humanoid')) assert.deepEqual(partNames, expectedParts);
      assert.deepEqual(asset.children.map(p => p.userData.part).sort(), partNames);
      for (const part of asset.children) {
        const pivot = stats[id].parts[part.userData.part].map(v => v / 16);
        assert.deepEqual(part.position.toArray(), pivot);
      }
    }
    let triangles = 0, meshes = 0;
    const materials = new Set();
    asset.traverse(obj => {
      if (!obj.isMesh) return;
      meshes++;
      const g = obj.geometry;
      assert.ok(g.attributes.color && g.attributes.normal);
      assert.equal(obj.material.vertexColors, true);
      assert.equal(obj.material.flatShading, false); // Supplied split normals carry flat shading.
      materials.add(obj.material.name);
      triangles += g.index.count / 3;
      for (const key of ['position', 'normal', 'color']) {
        for (const value of g.attributes[key].array) assert.ok(Number.isFinite(value));
      }
      const color = g.attributes.color;
      for (let i = 0; i < color.count; i++) for (let j = 0; j < color.itemSize; j++) {
        const value = color.getComponent(i, j); // Normalized bytes decode to [0,1].
        assert.ok(value >= 0 && value <= 1);
      }
      // Winding must agree with the normals; verify every triangle in every GLB.
      const p = g.attributes.position, n = g.attributes.normal;
      for (let t = 0; t < g.index.count; t += 3) {
        const [a, b, c] = [0, 1, 2].map(i => g.index.getX(t + i));
        const u = [p.getX(b)-p.getX(a), p.getY(b)-p.getY(a), p.getZ(b)-p.getZ(a)];
        const v = [p.getX(c)-p.getX(a), p.getY(c)-p.getY(a), p.getZ(c)-p.getZ(a)];
        const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        assert.ok(cross[0]*n.getX(a)+cross[1]*n.getY(a)+cross[2]*n.getZ(a) > 0);
      }
    });
    assert.equal(triangles, stats[id].triangles, `${id} individual/combined geometry disagrees`);
    assert.ok(triangles <= stats[id].budget);
    const bounds = new Box3().setFromObject(asset);
    assert.ok(Math.abs(bounds.max.y - manifest[id].height) < 1e-6);
    assert.ok(bounds.min.y >= 0);
    assert.ok(bounds.min.x >= -manifest[id].footprint[0]/2 && bounds.max.x <= manifest[id].footprint[0]/2);
    const back = manifest[id].wall ? 0 : -manifest[id].footprint[1]/2;
    assert.ok(bounds.min.z >= back && bounds.max.z <= back + manifest[id].footprint[1]);
    entries.push({ id, meshes, triangles, materials: [...materials], attributes: ['position', 'normal', 'color'],
      ...(manifest[id].family === 'characters' ? {parts: asset.children.map(p => ({name: p.name, part: p.userData.part, pivot: p.position.toArray()}))} : {}) });
  }
  report.push({ file: path.relative(root, file), bytes: bytes.length, nodes: entries });
  console.log(`${basename}: ${entries.map(a => `${a.id} (${a.triangles} tris; ${a.materials.join(',')}; COLOR_0)`).join(' | ')}`);
}
await writeFile(path.join(root, 'out/validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${files.length} GLBs; all ids, joint pivots, materials, colours, winding, bounds and budgets.`);

await import("./verify-characters.mjs");
await verifyOptimization();
