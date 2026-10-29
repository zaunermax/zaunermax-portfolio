import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBytes } from './gltf-loader.mjs';
import { Box3, Color } from 'three';
import { applyPalette, assembleCharacter, partKeys, paletteForSeed } from './character-runtime.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, '../../public/lab/quest');
const catalog = JSON.parse(await readFile(path.join(publicDir, 'character-parts.json')));
async function load(file) {
  const bytes = await readFile(file);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const gltf = await loadBytes(bytes);
  return { doc, scene: gltf.scene };
}
const { doc, scene } = await load(path.join(publicDir, catalog.glb));
assert.deepEqual(doc.scenes[0].nodes.map(i => doc.nodes[i].name).sort(), catalog.parts.map(p => p.node).sort());
assert.equal(catalog.palettes.skin.length, 10);
assert.equal(catalog.palettes.hair.length, 14);
assert.equal(catalog.previewSamples.length, 30);
assert.equal(new Set(catalog.previewSamples.map(s => s.skinTone)).size, 10);
const allSlots = new Set();
let vertices = 0, sourceTriangles = 0;
const originals = new Map();
for (const node of scene.children) {
  const entry = catalog.parts.find(e => e.node === node.userData.id);
  assert.ok(entry);
  assert.deepEqual(node.children.map(c => c.userData.part).sort(), [...entry.bones].sort());
  for (const part of node.children) assert.deepEqual(part.position.toArray(), catalog.rig[part.userData.part]);
  node.traverse(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry, c = g.getAttribute('color'), slot = g.getAttribute('_slot');
    assert.ok(c);
    if (slot) assert.equal(slot.count, c.count);
    assert.equal(mesh.material.vertexColors, true);
    for (const key of ['position','normal','color', ...(slot ? ['_slot'] : [])]) {
      for (const v of g.attributes[key].array) assert.ok(Number.isFinite(v));
    }
    for (let i=0;i<c.count;i++) {
      const s=slot?.getX(i) ?? 0;
      assert.ok(Number.isInteger(s) && s>=0 && s<catalog.slots.length);
      allSlots.add(s);
      for (const value of [c.getX(i),c.getY(i),c.getZ(i)]) assert.ok(value>=0 && value<=1);
    }
    // Supplied normals and index winding agree, including thin front-only decals.
    const p=g.attributes.position,n=g.attributes.normal;
    for(let t=0;t<g.index.count;t+=3) {
      const [a,b,c]=[0,1,2].map(i=>g.index.getX(t+i));
      const u=[p.getX(b)-p.getX(a),p.getY(b)-p.getY(a),p.getZ(b)-p.getZ(a)];
      const v=[p.getX(c)-p.getX(a),p.getY(c)-p.getY(a),p.getZ(c)-p.getZ(a)];
      assert.ok((u[1]*v[2]-u[2]*v[1])*n.getX(a)+(u[2]*v[0]-u[0]*v[2])*n.getY(a)+(u[0]*v[1]-u[1]*v[0])*n.getZ(a)>0);
    }
    vertices+=c.count;
    sourceTriangles+=g.index.count/3;
    originals.set(mesh, Array.from(c.array));
  });
}
assert.deepEqual([...allSlots].sort((a,b)=>a-b),catalog.slots.map(s=>s.index));

let maxTriangles=0, assembledCount=0;
const samples=[...catalog.previewSamples,...Object.values(catalog.recipes).filter(r=>r.recipe)];
for (const sample of samples) {
  const npc=assembleCharacter(scene,catalog,sample.recipe,sample.palette);
  assert.deepEqual(npc.children.map(c=>c.userData.part).sort(),Object.keys(catalog.rig).sort());
  const before=[];
  let triangles=0;
  npc.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const { geometry:g }=mesh;
    triangles+=g.index.count/3;
    before.push([mesh,Array.from(g.attributes.color.array)]);
    const component=mesh.userData.component ?? mesh.parent.userData.component;
    assert.ok(component);
    // Match source primitive by material within its canonical bone/component.
    const source=scene.children.find(n=>n.userData.id===component);
    const bone=mesh.isMesh && mesh.userData.part ? mesh.userData.part : mesh.parent.userData.part;
    const part=source.children.find(p=>p.userData.part===bone);
    assert.ok(part, `${component} bone ${bone}`);
    let original;
    part.traverse(o=>{if(o.isMesh && o.material.name===mesh.material.name) original=o;});
    const c=g.attributes.color, s=g.attributes._slot, c0=original.geometry.attributes.color;
    for(let i=0;i<c.count;i++) {
      const slot=s?.getX(i)??0;
      const p=slot ? new Color(sample.palette[catalog.slots[slot].name]) : {r:1,g:1,b:1};
      assert.ok(Math.abs(c.getX(i)-c0.getX(i)*p.r)<1e-6);
      assert.ok(Math.abs(c.getY(i)-c0.getY(i)*p.g)<1e-6);
      assert.ok(Math.abs(c.getZ(i)-c0.getZ(i)*p.b)<1e-6);
    }
  });
  maxTriangles=Math.max(maxTriangles,triangles);
  assert.ok(triangles<=catalog.compatibility.maxAssembledTriangles,`${triangles} exceeds modular budget`);
  const bounds=new Box3().setFromObject(npc);
  assert.equal(bounds.min.y,0);
  assert.ok(bounds.min.x>=-.5 && bounds.max.x<=.5 && bounds.min.z>=-.5 && bounds.max.z<=.5);
  applyPalette(npc,catalog.previewSamples[0].palette,catalog);
  applyPalette(npc,sample.palette,catalog);
  for(const [mesh,expected] of before) assert.deepEqual(Array.from(mesh.geometry.attributes.color.array),expected,'Repeated recolouring compounds');
  // An engine clone of an already coloured NPC must also retain source multipliers.
  const cloned=npc.clone(true);
  applyPalette(cloned,sample.palette,catalog);
  const clonedColours=[];
  cloned.traverse(m=>{if(m.isMesh)clonedColours.push(Array.from(m.geometry.attributes.color.array));});
  assert.deepEqual(clonedColours,before.map(([,c])=>c));
  assembledCount++;
}
for(const [mesh,colours] of originals) assert.deepEqual(Array.from(mesh.geometry.attributes.color.array),colours,'Template/shared geometry mutated');
const base=catalog.previewSamples[0].recipe;
assert.throws(()=>partKeys({...base,hair:'high_bun',headwear:'cap'},catalog),/Incompatible/);
assert.throws(()=>partKeys({...base,accessories:['round_glasses','square_glasses']},catalog),/Exclusive/);
assert.ok(!partKeys({...base,headwear:'headwrap'},catalog).some(k=>k.startsWith('hair/')));
assert.throws(()=>partKeys({...base,top:'missing'},catalog),/Unknown/);

const toneCounts=Object.fromEntries(catalog.palettes.skin.map(t=>[t.skin,0]));
for(let i=0;i<10000;i++) {
  const p=paletteForSeed(catalog,`world-123:${i}`);
  toneCounts[p.skin]++;
  assert.deepEqual(p,paletteForSeed(catalog,`world-123:${i}`));
  assert.equal(p.skin,paletteForSeed(catalog,`world-123:${i}`,{hair:'rose',skin:'ignored'}).skin);
}
for(const count of Object.values(toneCounts)) assert.ok(count>850 && count<1150,`Biased skin sampler: ${count}`);

// Compare actual Blender import/export output, not a synthetically fabricated attribute.
// Blender may weld/reindex vertices and store imported colours as sRGB BYTE_COLOR. Compare semantic
// position/normal/slot keys and colours to 0.0045 linear (half an sRGB byte near white), independently of vertex ordering.
const roundtrip=await load(path.join(root,'out/character-parts-blender.glb'));
function semanticVertices(scene) {
  const records=new Map();
  let triangles=0;
  for(const node of scene.children) {
    for(const part of node.children) {
      part.traverse(mesh=>{
        if(!mesh.isMesh) return;
        const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,s=g.attributes._slot;
        triangles+=g.index.count/3;
        for(let i=0;i<p.count;i++) {
          const key=[node.userData.id,part.userData.part,mesh.material.name,
            p.getX(i).toFixed(5),p.getY(i).toFixed(5),p.getZ(i).toFixed(5),
            n.getX(i),n.getY(i),n.getZ(i),s?.getX(i)??0].join('|');
          const list=records.get(key)??[];
          list.push([c.getX(i),c.getY(i),c.getZ(i)]);
          records.set(key,list);
        }
      });
    }
  }
  return {records,triangles};
}
const raw=await load(path.join(root,'out/raw/character-parts.glb'));
const original=semanticVertices(raw.scene),back=semanticVertices(roundtrip.scene);
assert.equal(back.triangles,original.triangles);
assert.equal(back.records.size,original.records.size,'Blender lost slots/vertices');
for(const [key,colours] of original.records) {
  const reexported=back.records.get(key);
  assert.ok(reexported,`Blender lost ${key}`);
  for(const c of colours) assert.ok(reexported.some(d=>c.every((v,i)=>Math.abs(v-d[i])<=.0045)),`Blender altered colour for ${key}`);
  for(const d of reexported) assert.ok(colours.some(c=>c.every((v,i)=>Math.abs(v-d[i])<=.0045)));
}
// The re-export itself must still assemble and recolour through GLTFLoader.
assembleCharacter(roundtrip.scene,catalog,samples[0].recipe,samples[0].palette);
const report={parts:catalog.parts.length,vertices,sourceTriangles,slots:[...allSlots].sort(),assembledCount,maxTriangles,
  toneCounts,formulaVerified:true,bakedPixelsPreserved:true,repeatedRecolourStable:true,templatesUnchanged:true,
  blenderRoundtrip:{triangles:back.triangles,semanticVertices:back.records.size,colourTolerance:.0045}};
await writeFile(path.join(root,'out/character-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: modular kit ${report.parts} parts, all ten slots, ${assembledCount} assemblies, max ${maxTriangles} triangles; palette math, immutable templates, and real Blender round trip.`);
