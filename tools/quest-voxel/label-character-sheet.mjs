import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const [file, annotations] = process.argv.slice(2);
const { title, labels } = JSON.parse(await readFile(annotations));
const { width, height } = await sharp(file).metadata();
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<style>text{font-family:sans-serif;fill:#423d4c;paint-order:stroke;stroke:#eee7da;stroke-width:4px;stroke-linejoin:round}</style>
<text x="28" y="42" font-size="25">${escape(title)}</text>
${labels.map(l=>`<text x="${l.x}" y="${Math.min(height-16,l.y+20)}" text-anchor="middle" font-size="17">${escape(l.text)}</text>`).join('')}
</svg>`;
const result = await sharp(file).composite([{input:Buffer.from(svg)}]).png().toBuffer();
await sharp(result).toFile(file);
