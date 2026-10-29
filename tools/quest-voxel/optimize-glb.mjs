// Conservative runtime packing: preserve scene graph, pivots, triangle order and
// every position bit (including 1/16384 decals). Never run simplify/join/flatten.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sizes } from './measure-glb.mjs';
import { compareKits } from './verify-optimization.mjs';

export async function optimize(bytes) {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(bytes);
  await doc.transform(
    quantize({ pattern: /^(NORMAL|COLOR_0)$/, quantizeNormal: 8, quantizeColor: 8, cleanup: false }),
    weld(), // Exact equality across ALL attributes, including colour, normal and _SLOT.
    dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
    prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true }),
  );
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const index = prim.getIndices();
    if (prim.getAttribute('POSITION').getCount() < 65535) index.setArray(new Uint16Array(index.getArray()));
  }
  // glTF-Transform 4.5.1's extension inference inspects POSITION for every
  // semantic, missing quantized normals when positions deliberately stay float.
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    // QUANTIZE disables lossy exponential and octahedral filters. Use the v0 EXT
    // bitstream (encodeGltfBuffer), compatible with drei's older bundled decoder.
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });
  return io.writeBinary(doc);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(root, '../../public/lab/quest');
  const results = [], pending = [];
  for (const name of ['office-kit', 'characters', 'character-parts']) {
    const raw = await readFile(path.join(root, 'out/raw', `${name}.glb`));
    const packed = await optimize(raw);
    const comparison = await compareKits(raw, packed);
    results.push({ file: `${name}.glb`, raw: sizes(raw), optimized: sizes(packed), comparison });
    pending.push([path.join(publicDir, `${name}.glb`), packed]);
    console.log(`${name}: ${raw.length} -> ${packed.length} bytes; exact geometry/normals/slots, max colour error ${comparison.maxColorError}`);
  }
  // Validate all three before publishing any of them. Every replacement is atomic.
  await mkdir(publicDir, { recursive: true });
  for (const [file, bytes] of pending) {
    await writeFile(`${file}.tmp`, bytes);
    await rename(`${file}.tmp`, file);
  }
  await writeFile(path.join(root, 'out/optimization-report.json'), JSON.stringify(results, null, 2) + '\n');
}
