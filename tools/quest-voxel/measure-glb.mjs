// Audit the original per-face exports, including exact-colour greedy/weld potential.
import { NodeIO } from '@gltf-transform/core';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function sizes(bytes) {
  return { bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes).length }; // Brotli default quality 11.
}

function greedyCount(cells) {
  let count = 0;
  for (const key of [...cells].sort((a, b) => {
    const [x, y] = a.split(',').map(Number), [u, v] = b.split(',').map(Number);
    return y - v || x - u;
  })) {
    if (!cells.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    let w = 1, h = 1;
    while (cells.has(`${x + w},${y}`)) w++;
    while (Array.from({ length: w }, (_, i) => cells.has(`${x + i},${y + h}`)).every(Boolean)) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.delete(`${x + i},${y + j}`);
    count++;
  }
  return count;
}

export async function measure(file) {
  const bytes = await readFile(file), doc = await new NodeIO().readBinary(bytes);
  const assets = [];
  for (const node of doc.getRoot().getDefaultScene().listChildren()) {
    const row = { id: node.getExtras().id, vertices: 0, triangles: 0,
      attributes: {}, indices: 0, exactWeldVertices: 0, quads: 0, greedyQuads: 0 };
    node.traverse(n => {
      for (const prim of n.getMesh()?.listPrimitives() ?? []) {
        const p = prim.getAttribute('POSITION'), normal = prim.getAttribute('NORMAL');
        const color = prim.getAttribute('COLOR_0'), slot = prim.getAttribute('_SLOT');
        row.vertices += p.getCount();
        row.triangles += prim.getIndices().getCount() / 3;
        row.indices += prim.getIndices().getArray().byteLength;
        const attributes = prim.listSemantics().map(s => [s, prim.getAttribute(s)]);
        for (const [s, a] of attributes) row.attributes[s] = (row.attributes[s] ?? 0) + a.getArray().byteLength;
        const unique = new Set();
        for (let i = 0; i < p.getCount(); i++) unique.add(attributes.flatMap(([, a]) => a.getElement(i, [])).join(','));
        row.exactWeldVertices += unique.size;
        const groups = new Map();
        for (let i = 0; i < p.getCount(); i += 4) {
          const n = normal.getElement(i, []), c = color.getElement(i, []);
          const axis = n.findIndex(v => v !== 0), uv = [0, 1, 2].filter(v => v !== axis);
          const points = [0, 1, 2, 3].map(j => p.getElement(i + j, []));
          const key = [n, points[0][axis], c, slot?.getScalar(i) ?? 0].join('|');
          const cells = groups.get(key) ?? new Set();
          cells.add(uv.map(a => Math.round(Math.min(...points.map(v => v[a])) * 32)).join(','));
          groups.set(key, cells);
          row.quads++;
        }
        // Coordinates in half-voxels above preserve half-voxel pivots. Convert each
        // plane's origin to unit cells before the ordinary rectangle scan.
        for (const cells of groups.values()) {
          const [ox, oy] = cells.values().next().value.split(',').map(Number);
          row.greedyQuads += greedyCount(new Set([...cells].map(k => {
            const [x, y] = k.split(',').map(Number);
            return `${(x - ox) / 2},${(y - oy) / 2}`;
          })));
        }
      }
    });
    assets.push(row);
  }
  const total = { vertices: 0, triangles: 0, attributes: {}, indices: 0, exactWeldVertices: 0, quads: 0, greedyQuads: 0 };
  for (const row of assets) {
    for (const k of Object.keys(total).filter(k => k !== 'attributes')) total[k] += row[k];
    for (const [k, v] of Object.entries(row.attributes)) total.attributes[k] = (total.attributes[k] ?? 0) + v;
  }
  return { file: path.basename(file), ...sizes(bytes), total, assets };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const report = [];
  for (const name of ['office-kit', 'characters', 'character-parts']) {
    const result = await measure(path.join(root, 'out/raw', `${name}.glb`));
    report.push(result);
    console.log(JSON.stringify({ ...result, assets: undefined }));
  }
  await writeFile(path.join(root, 'out/optimization-baseline.json'), JSON.stringify(report, null, 2) + '\n');
}
