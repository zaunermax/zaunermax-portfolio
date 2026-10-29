import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paletteOf, type Appearance } from '../world/appearance';
import type { CharacterId } from '../world/catalog';
import { partNodes, RIG, SLOTS, type Palette } from '../world/character-parts';
import {
	dequantize,
	placeholderCharacter,
	type CharacterKit,
	type CharacterPart,
	type Kit,
	type KitPart,
	type MaterialKind,
	type PartsLibrary,
} from './kit';
import { CHARACTER_COLORS } from './palette';

/**
 * The one place that turns an actor into geometry.
 *
 * People with an appearance are assembled from the modular kit (character-parts.glb, see
 * tools/quest-voxel/CHARACTERS.md): one component per category hangs off six joint pivots, and
 * every vertex whose `_slot` is non-zero is recoloured as linear(palette[slot]) × COLOR_0. Each
 * distinct appearance is built once and cached, merged into one geometry per joint and material,
 * so a person costs about eight draw calls and shares materials with everything else.
 *
 * Max is bespoke (characters.glb, with his bun), and so are the visitor, pets and robots. Until
 * the parts kit has loaded, or if it lacks a component, people fall back to the fixed staff
 * character for their role, then to a placeholder chibi painted with their palette.
 */

type SourcePart = { geometry: THREE.BufferGeometry; material: MaterialKind; bone: string };

/** Each component's meshes in its joint's frame, as float geometry with `_slot`; built once. */
const sources = new WeakMap<THREE.Object3D, SourcePart[]>();

function componentParts(template: THREE.Object3D): SourcePart[] {
	const hit = sources.get(template);
	if (hit) return hit;
	const out: SourcePart[] = [];
	for (const joint of template.children) {
		const bone = joint.userData.part as string | undefined;
		if (!bone) continue;
		joint.updateWorldMatrix(true, true);
		const inverse = joint.matrixWorld.clone().invert();
		joint.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh.isMesh) return;
			const geometry = dequantize(mesh.geometry);
			geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
			const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '';
			const material: MaterialKind = name.startsWith('voxel_glow') ? 'glow' : name.startsWith('voxel_glass') ? 'glass' : 'voxel';
			out.push({ geometry, material, bone });
		});
	}
	sources.set(template, out);
	return out;
}

/** A recoloured copy of a source part with exactly position, normal and an RGB colour. */
function recolour(source: THREE.BufferGeometry, linear: (THREE.Color | null)[]) {
	const position = source.getAttribute('position');
	const color = source.getAttribute('color');
	const slot = source.getAttribute('_slot');
	const rgb = new Float32Array(position.count * 3);
	for (let i = 0; i < position.count; i++) {
		const s = slot ? Math.round(slot.getX(i)) : 0;
		const p = linear[s] ?? null;
		rgb[i * 3] = (color ? color.getX(i) : 1) * (p ? p.r : 1);
		rgb[i * 3 + 1] = (color ? color.getY(i) : 1) * (p ? p.g : 1);
		rgb[i * 3 + 2] = (color ? color.getZ(i) : 1) * (p ? p.b : 1);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', position);
	g.setAttribute('normal', source.getAttribute('normal'));
	g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
	const index = source.getIndex();
	if (index) g.setIndex(index);
	return g;
}

const assembled = new WeakMap<PartsLibrary, Map<string, CharacterKit | null>>();

/** A person built from the parts kit, or null if the kit lacks one of their components. */
export function assemblePerson(library: PartsLibrary, appearance: Appearance): CharacterKit | null {
	let cache = assembled.get(library);
	if (!cache) assembled.set(library, (cache = new Map()));
	const key = JSON.stringify(appearance);
	if (cache.has(key)) return cache.get(key)!;

	const palette = paletteOf(appearance);
	// THREE.Color reads CSS hex as sRGB and stores linear working RGB, as the formula wants.
	const linear = SLOTS.map((slot) => (slot === 'baked' ? null : new THREE.Color(palette[slot as keyof Palette])));
	const groups = new Map<string, THREE.BufferGeometry[]>();
	let complete = true;
	for (const node of partNodes(appearance)) {
		const template = library.get(node);
		if (!template) {
			complete = false;
			break;
		}
		for (const part of componentParts(template)) {
			const id = `${part.bone}|${part.material}`;
			let list = groups.get(id);
			if (!list) groups.set(id, (list = []));
			list.push(recolour(part.geometry, linear));
		}
	}
	let kit: CharacterKit | null = null;
	if (complete) {
		const parts: CharacterPart[] = Object.entries(RIG).map(([bone, pivot]) => {
			const meshes: KitPart[] = [];
			for (const material of ['voxel', 'glass', 'glow'] as const) {
				const list = groups.get(`${bone}|${material}`);
				if (!list?.length) continue;
				const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
				if (geometry) meshes.push({ geometry, material });
			}
			return { name: bone, pivot: new THREE.Vector3(...pivot), parts: meshes };
		});
		kit = { parts, placeholder: false };
	}
	cache.set(key, kit);
	return kit;
}

const NOBODY: CharacterKit = { parts: [], placeholder: true };

export function resolveCharacter(kit: Kit, character: CharacterId, appearance: Appearance | null): CharacterKit {
	// Nobody shows as a stand-in box while the kit is still on its way.
	if (!kit.ready) return NOBODY;
	if (appearance && kit.parts) {
		const person = assemblePerson(kit.parts, appearance);
		if (person) return person;
	}
	const fixed = kit.characters.get(character);
	if (fixed) return fixed;
	if (!appearance) return placeholderCharacter(character, CHARACTER_COLORS[character]);
	const p = paletteOf(appearance);
	const colors: [string, string, string, string] = [p.skin, p.hair, p.top, p.bottom];
	return placeholderCharacter(character, colors, colors.join());
}
