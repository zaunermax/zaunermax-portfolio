// Render the actual decoded raw/packed geometry, not the Python source models.
// Run after build.py: node tools/quest-voxel/render-optimization.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { loadBytes } from './gltf-loader.mjs';
import { assembleCharacter } from './character-runtime.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, '../../public/lab/quest');
const out = path.join(root, 'out/optimization-previews');
await mkdir(out, { recursive: true });
const catalog = JSON.parse(await readFile(path.join(publicDir, 'character-parts.json')));
const jobs = [];
for (const [label, kit, id] of [
  ['office', 'office-kit', 'big_desk_max'],
  ['fixed', 'characters', 'max'],
  ['modular', 'character-parts', null],
]) {
  for (const version of ['before', 'after']) {
    const dir = version === 'before' ? path.join(root, 'out/raw') : publicDir;
    const { scene } = await loadBytes(await readFile(path.join(dir, `${kit}.glb`)));
    const asset = id ? scene.children.find(n => n.userData.id === id)
      : assembleCharacter(scene, catalog, {
        base: 'regular', face: 'smile', hair: 'side_part', top: 'hoodie', bottom: 'trousers',
        accessories: ['freckles', 'round_glasses', 'lanyard'],
      }, catalog.previewSamples[0].palette);
    if (!asset) throw new Error(`Missing ${id}`);
    if (id === 'max') asset.children.find(n => n.userData.part === 'arm_l').rotation.z = 1.2;
    asset.updateMatrixWorld(true);
    const meshes = [];
    asset.traverse(mesh => {
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      const attribute = name => Array.from({ length: g.attributes[name].count }, (_, i) =>
        Array.from({ length: g.attributes[name].itemSize }, (_, j) => g.attributes[name].getComponent(i, j)));
      meshes.push({ matrix: mesh.matrixWorld.toArray(), positions: attribute('position'),
        normals: attribute('normal'), colors: attribute('color'),
        indices: Array.from(g.index.array), material: mesh.material.name });
    });
    jobs.push({ name: `${label}-${version}`, meshes });
  }
}
const input = path.join(out, 'decoded-scenes.json');
await writeFile(input, JSON.stringify(jobs));
const env = { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', EGL_PLATFORM: 'surfaceless' };
const runtime = path.join(root, 'out/runtime/usr');
try {
  await readFile(path.join(runtime, 'lib/x86_64-linux-gnu/libEGL.so.1'));
  env.LD_LIBRARY_PATH = `${runtime}/lib/x86_64-linux-gnu:${env.LD_LIBRARY_PATH ?? ''}`;
  env.__EGL_VENDOR_LIBRARY_FILENAMES = `${runtime}/share/glvnd/egl_vendor.d/50_mesa.json`;
} catch { /* Use system Mesa when the optional local runtime is absent. */ }
await new Promise((resolve, reject) => {
  const child = spawn('blender', ['-b', '-P', path.join(root, 'render-optimization.py'), '--', input, out], { env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Blender render failed: ${code}`)));
});

const report = [];
for (const label of ['office', 'fixed', 'modular']) {
  const before = await sharp(path.join(out, `${label}-before.png`)).removeAlpha().raw().toBuffer();
  const after = await sharp(path.join(out, `${label}-after.png`)).removeAlpha().raw().toBuffer();
  let sum = 0, max = 0, changedPixels = 0;
  for (let i = 0; i < before.length; i += 3) {
    let changed = false;
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs(before[i + c] - after[i + c]);
      sum += delta; max = Math.max(max, delta); changed ||= delta > 0;
    }
    if (changed) changedPixels++;
  }
  report.push({ scene: label, meanChannelError255: sum / before.length, maxChannelError255: max, changedPixels });
  const title = Buffer.from(`<svg width="1024" height="36"><rect width="1024" height="36" fill="#f4efe6"/><text x="16" y="25" font-family="sans-serif" font-size="18">${label}: raw</text><text x="528" y="25" font-family="sans-serif" font-size="18">meshopt + packed attributes</text></svg>`);
  await sharp({ create: { width: 1024, height: 548, channels: 3, background: '#f4efe6' } })
    .composite([{ input: title, top: 0, left: 0 },
      { input: path.join(out, `${label}-before.png`), top: 36, left: 0 },
      { input: path.join(out, `${label}-after.png`), top: 36, left: 512 }])
    .png().toFile(path.join(out, `${label}-comparison.png`));
}
await writeFile(path.join(out, 'pixel-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
