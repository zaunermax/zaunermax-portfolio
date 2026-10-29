/** Engine reference, deliberately outside src/. Works with stock three.js GLTFLoader. */
import { Color, Group, Float32BufferAttribute } from 'three';

const sourceColours = new WeakMap();
const geometrySources = new WeakMap();

/** Immutable source multipliers are retained per mesh; recolouring never compounds. */
export function applyPalette(root, palette, catalog) {
  const linear = catalog.slots.map(({ index, name }) => {
    if (!index) return null;
    if (!/^#[0-9a-f]{6}$/i.test(palette[name] ?? '')) throw new Error(`Missing/invalid palette slot ${name}`);
    // THREE.Color interprets CSS hex in sRGB and converts it to working linear RGB.
    return new Color(palette[name]);
  });
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.getAttribute('_slot')) return;
    let source = sourceColours.get(mesh);
    if (!source) {
      // GLTFLoader clones share BufferGeometry: own it before changing colours.
      source = geometrySources.get(mesh.geometry) ?? mesh.geometry.getAttribute('color').clone();
      mesh.geometry = mesh.geometry.clone();
      // Kits store normalized uint8 colours. Palette products need float storage
      // to avoid a second quantization, especially on darker skin/hair palettes.
      const values = new Float32Array(source.count * source.itemSize);
      for (let i = 0; i < source.count; i++) for (let j = 0; j < source.itemSize; j++) {
        values[i * source.itemSize + j] = source.getComponent(i, j);
      }
      mesh.geometry.setAttribute('color', new Float32BufferAttribute(values, source.itemSize));
      geometrySources.set(mesh.geometry, source);
      sourceColours.set(mesh, source);
    }
    const colours = mesh.geometry.getAttribute('color');
    const slots = mesh.geometry.getAttribute('_slot');
    for (let i = 0; i < colours.count; i++) {
      const slot = slots.getX(i), p = linear[slot];
      if (!Number.isInteger(slot) || slot < 0 || slot >= linear.length) throw new Error(`Invalid slot ${slot}`);
      colours.setXYZ(i, source.getX(i) * (p?.r ?? 1), source.getY(i) * (p?.g ?? 1), source.getZ(i) * (p?.b ?? 1));
      if (colours.itemSize === 4) colours.setW(i, source.getW(i));
    }
    colours.needsUpdate = true;
  });
  return root;
}

export function partKeys(recipe, catalog) {
  if (!catalog.categories.hair.includes(recipe.hair)) throw new Error(`Unknown hair ${recipe.hair}`);
  const keys = ['base', 'face', 'top', 'bottom'].map(c => `${c}/${recipe[c]}`);
  const hat = recipe.headwear && catalog.compatibility.headwear[recipe.headwear];
  if (recipe.headwear && !hat) throw new Error(`Unknown headwear ${recipe.headwear}`);
  if (!hat?.hides.includes('hair')) {
    if (hat && !hat.allowedHair.includes(recipe.hair)) throw new Error('Incompatible hair/headwear');
    keys.push(`hair/${recipe.hair}`);
  }
  if (hat) keys.push(`headwear/${recipe.headwear}`);
  const accessories = recipe.accessories ?? [];
  if (!Array.isArray(accessories)) throw new Error("Accessories must be an array");
  if (accessories.length > catalog.compatibility.maxAccessories || new Set(accessories).size !== accessories.length) throw new Error('Invalid accessory count');
  for (const pair of catalog.compatibility.exclusiveAccessories) {
    if (pair.every(id => accessories.includes(id))) throw new Error(`Exclusive accessories: ${pair}`);
  }
  keys.push(...accessories.map(id => `accessory/${id}`).filter(key => !hat?.hides.includes(key)));
  for (const key of keys) if (!catalog.parts.some(e => e.node === key)) throw new Error(`Unknown part ${key}`);
  return keys;
}

/** Create six canonical sibling joint Groups, then attach component-local geometry. */
export function assembleCharacter(library, catalog, recipe, palette) {
  const keys = partKeys(recipe, catalog);
  const root = new Group();
  const bones = {};
  for (const [name, pivot] of Object.entries(catalog.rig)) {
    const bone = new Group();
    bone.name = name;
    bone.userData.part = name;
    bone.position.fromArray(pivot);
    root.add(bone);
    bones[name] = bone;
  }
  for (const key of keys) {
    const template = library.children.find(o => o.userData.id === key);
    if (!template) throw new Error(`Missing GLB node ${key}`);
    for (const component of template.children) {
      const bone = bones[component.userData.part];
      if (!bone) throw new Error(`Unknown rig bone ${component.userData.part}`);
      const clone = component.clone(true);
      // Local vertices already have the pivot subtracted. The bone owns translation.
      clone.position.set(0, 0, 0);
      clone.userData.component = key;
      bone.add(clone);
    }
  }
  applyPalette(root, palette, catalog);
  root.updateMatrixWorld(true);
  return root;
}

/** Independent deterministic skin choice: pass world seed + numeric NPC index, not role/name.
 * Style may choose only palette IDs for hair/clothes. It cannot override skin or skin_shade.
 */
export function paletteForSeed(catalog, seed, style = {}) {
  let hash = 2166136261;
  for (const char of `${seed}:skin`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Avalanche sequential NPC seeds before mapping uniformly into the tone distribution.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const tones = catalog.palettes.skin;
  let weight = hash / 4294967296 * tones.reduce((n,t) => n+t.weight,0);
  let tone = tones.at(-1);
  for (const candidate of tones) {
    weight -= candidate.weight;
    if (weight < 0) { tone = candidate; break; }
  }
  const hair = catalog.palettes.hair.find(h => h.id === (style.hair ?? 'espresso'));
  if (!hair) throw new Error('Unknown hair palette');
  const result = {skin:tone.skin,skin_shade:tone.skin_shade,hair:hair.hair,hair_shade:hair.hair_shade};
  const defaults = {top:'teal',top_trim:'teal_dark',bottom:'navy',shoes:'cream',accent:'mustard'};
  for (const [slot,fallback] of Object.entries(defaults)) {
    const colour = catalog.palettes.clothing[style[slot] ?? fallback];
    if (!colour) throw new Error(`Unknown clothing palette for ${slot}`);
    result[slot] = colour;
  }
  return result;
}

/** Dispose instance-owned colour buffers; shared library geometry/materials stay alive. */
export function disposeCharacter(root) {
  root.traverse(mesh => {
    if (!mesh.isMesh || !sourceColours.has(mesh)) return;
    mesh.geometry.dispose();
    sourceColours.delete(mesh);
  });
  root.removeFromParent();
}
