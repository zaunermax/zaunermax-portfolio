// Compare decoded indexed triangles, allowing only meshopt's cyclic rotation of
// triangle corners. A multiset of vertices alone would miss altered connectivity.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBytes } from './gltf-loader.mjs';

const json = bytes => JSON.parse(Buffer.from(bytes).subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)));
function graph(doc) {
  return { scenes: doc.scenes.map(s => ({ ...s, name: s.name ?? '' })),
    nodes: doc.nodes.map(n => ({ name: n.name, extras: n.extras ?? {}, children: n.children ?? [],
      meshName: n.mesh === undefined ? null : doc.meshes[n.mesh].name,
      matrix: n.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      translation: n.translation ?? [0, 0, 0], rotation: n.rotation ?? [0, 0, 0, 1], scale: n.scale ?? [1, 1, 1] })) };
}
function meshes(scene) {
  const result = [];
  scene.traverse(n => { if (n.isMesh) result.push(n); });
  return result;
}
const vector = (attribute, i) => Array.from({ length: attribute.itemSize }, (_, j) => attribute.getComponent(i, j));
function vertex(g, i) {
  return { position: vector(g.attributes.position, i), normal: vector(g.attributes.normal, i),
    slot: g.attributes._slot?.getX(i) ?? 0, color: vector(g.attributes.color, i) };
}
const geometryKey = v => JSON.stringify([v.position, v.normal, v.slot]);

export async function compareKits(raw, packed) {
  const a = json(raw), b = json(packed);
  assert.deepEqual(graph(b), graph(a), 'Names/extras/hierarchy/pivots changed');
  const materials = doc => doc.materials.map(m => ({ ...m, pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1], ...m.pbrMetallicRoughness } }));
  assert.deepEqual(materials(b), materials(a), 'Material contract changed');
  assert.ok(b.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.ok(b.extensionsRequired.includes('KHR_mesh_quantization'));
  for (const mesh of b.meshes) for (const p of mesh.primitives) {
    assert.equal(b.accessors[p.attributes.POSITION].componentType, 5126);
    assert.equal(b.accessors[p.attributes.NORMAL].componentType, 5120);
    assert.equal(b.accessors[p.attributes.NORMAL].normalized, true);
    assert.equal(b.accessors[p.attributes.COLOR_0].componentType, 5121);
    assert.equal(b.accessors[p.attributes.COLOR_0].normalized, true);
    if (p.attributes._SLOT !== undefined) {
      assert.equal(b.accessors[p.attributes._SLOT].componentType, 5126);
      assert.ok(!b.accessors[p.attributes._SLOT].normalized);
    }
  }
  const original = meshes((await loadBytes(raw)).scene);
  let maxColorError = 0, triangles = 0, rawVertices = 0, optimizedVertices = 0;
  for (const drei of [false, true]) {
    const optimized = meshes((await loadBytes(packed, drei)).scene);
    assert.equal(optimized.length, original.length);
    for (let m = 0; m < original.length; m++) {
      const ga = original[m].geometry, gb = optimized[m].geometry;
      assert.equal(optimized[m].material.name, original[m].material.name);
      assert.deepEqual(Object.keys(gb.attributes).sort(), Object.keys(ga.attributes).sort());
      assert.equal(gb.index.count, ga.index.count);
      assert.ok(gb.index.array instanceof Uint16Array);
      if (!drei) {
        triangles += ga.index.count / 3;
        rawVertices += ga.attributes.position.count;
        optimizedVertices += gb.attributes.position.count;
      }
      for (let t = 0; t < ga.index.count; t += 3) {
        const va = [0, 1, 2].map(i => vertex(ga, ga.index.getX(t + i)));
        const vb = [0, 1, 2].map(i => vertex(gb, gb.index.getX(t + i)));
        const rotation = [0, 1, 2].find(r => va.every((v, i) => geometryKey(v) === geometryKey(vb[(i + r) % 3])));
        assert.notEqual(rotation, undefined, `Geometry/normal/slot/winding/order changed at mesh ${m}, triangle ${t / 3}`);
        va.forEach((v, i) => v.color.forEach((c, j) => {
          const error = Math.abs(c - vb[(i + rotation) % 3].color[j]);
          maxColorError = Math.max(maxColorError, error);
          assert.ok(error <= 1 / 255, `Colour changed by ${error}`);
        }));
      }
    }
  }
  return { triangles, rawVertices, optimizedVertices, maxPositionError: 0, maxNormalError: 0,
    slotsExact: true, hierarchyExact: true, triangleOrderExact: true, maxColorError,
    decoders: ['three/examples', 'drei/three-stdlib'] };
}

export async function verifyOptimization() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const report = [];
  for (const name of ['office-kit', 'characters', 'character-parts']) {
    report.push({ file: `${name}.glb`, ...await compareKits(
      await readFile(path.join(root, 'out/raw', `${name}.glb`)),
      await readFile(path.resolve(root, '../../public/lab/quest', `${name}.glb`))) });
  }
  await writeFile(path.join(root, 'out/optimization-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: all three optimized kits match raw triangles, positions, normals, slots, pivots and metadata with BOTH runtime decoders; colours within 1/255.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyOptimization();
