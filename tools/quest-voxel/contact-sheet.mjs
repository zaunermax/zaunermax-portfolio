import sharp from 'sharp';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'out/previews');
const manifest = JSON.parse(await readFile(path.join(root, '../../public/lab/quest/kit-manifest.json')));
const files = (await readdir(dir)).filter(f => f.endsWith('.png') && manifest[f.slice(0, -4)]).sort();
const w = 320, h = 356, cols = 4, rows = Math.ceil(files.length / cols);
const layers = [];
for (const [i, file] of files.entries()) {
  const left = (i % cols) * w, top = Math.floor(i / cols) * h;
  layers.push({ input: await sharp(path.join(dir, file)).resize(w, w).toBuffer(), left, top });
  const label = file.slice(0, -4).replaceAll('_', ' ');
  layers.push({ input: Buffer.from(`<svg width="${w}" height="36"><rect width="100%" height="100%" fill="#eee7da"/><text x="160" y="23" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#423d4c">${label}</text></svg>`), left, top: top + w });
}
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#eee7da' } })
  .composite(layers).png().toFile(path.join(dir, '_sheet.png'));
console.log(`Contact sheet: ${dir}/_sheet.png (${files.length} assets)`);
