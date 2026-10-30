'use client';

import { useLoader } from '@react-three/fiber';
import {
	Component,
	createContext,
	Suspense,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { reportLoad, type LoadStage } from '../ui/load-progress';
import { ASSETS, CHARACTERS, RIG_PARTS, type AssetId, type CharacterId } from '../world/catalog';
import { hashString } from '../world/random';
import { placeholderColor } from './palette';

/**
 * The voxel kit from tools/quest-voxel: `office-kit.glb` (one top-level node per asset id) and
 * `characters.glb` (one node per character with jointed parts). Both load through fiber's
 * useLoader once the manifest says they exist; until then, and for any id the kit does not have
 * yet, a footprint-sized pastel placeholder stands in. A missing or broken file never breaks
 * the scene.
 */

export type MaterialKind = 'voxel' | 'glow' | 'glass';
export type KitPart = { geometry: THREE.BufferGeometry; material: MaterialKind };
export type KitAsset = { parts: KitPart[]; placeholder: boolean };
export type CharacterPart = { name: string; pivot: THREE.Vector3; parts: KitPart[] };
export type CharacterKit = { parts: CharacterPart[]; placeholder: boolean };
/** character-parts.glb: component templates by `userData.id` (e.g. `hair/afro`). */
export type PartsLibrary = Map<string, THREE.Object3D>;

type Manifest = Record<string, { footprint?: [number, number]; height?: number }>;

export type Kit = {
	assets: Map<string, KitAsset>;
	characters: Map<string, CharacterKit>;
	/** The modular character kit, once loaded. */
	parts: PartsLibrary | null;
	manifest: Manifest;
	/** Changes whenever new kit data arrives. */
	version: string;
	/**
	 * Every kit file has loaded or failed for good: from here on a placeholder means an id the
	 * kit really lacks. The loading veil waits for this, so nobody sees boxes first.
	 */
	ready: boolean;
};

const EMPTY: Kit = { assets: new Map(), characters: new Map(), parts: null, manifest: {}, version: 'none', ready: false };
const KitContext = createContext<Kit>(EMPTY);
export const useKit = () => useContext(KitContext);

const BASE = '/lab/quest';

function materialKind(material: THREE.Material | THREE.Material[]): MaterialKind {
	const name = (Array.isArray(material) ? material[0] : material)?.name ?? '';
	return name.startsWith('voxel_glow') ? 'glow' : name.startsWith('voxel_glass') ? 'glass' : 'voxel';
}

/**
 * Float32 copies of every attribute: the kits are meshopt-compressed with quantized (normalized
 * integer) positions, normals and colours, which must not be transformed or recoloured in place.
 */
export function dequantize(source: THREE.BufferGeometry) {
	const geometry = new THREE.BufferGeometry();
	for (const [name, attr] of Object.entries(source.attributes)) {
		const { count, itemSize } = attr;
		const array = new Float32Array(count * itemSize);
		const get = [attr.getX, attr.getY, attr.getZ, attr.getW];
		for (let i = 0; i < count; i++)
			for (let k = 0; k < itemSize; k++) array[i * itemSize + k] = get[k].call(attr, i);
		geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
	}
	const index = source.getIndex();
	if (index) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(index.array as ArrayLike<number>), 1));
	return geometry;
}

/** Meshes under `root`, baked into `frame`'s local space. */
function bake(root: THREE.Object3D, frame: THREE.Object3D): KitPart[] {
	frame.updateWorldMatrix(true, true);
	const inverse = frame.matrixWorld.clone().invert();
	const parts: KitPart[] = [];
	root.traverse((child) => {
		const mesh = child as THREE.Mesh;
		if (!mesh.isMesh) return;
		const geometry = dequantize(mesh.geometry);
		geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
		parts.push({ geometry, material: materialKind(mesh.material) });
	});
	return parts;
}

function officeAssets(scene: THREE.Object3D) {
	const out = new Map<string, KitAsset>();
	for (const node of scene.children) out.set(node.name, { parts: bake(node, node), placeholder: false });
	return out;
}

function characterKits(scene: THREE.Object3D) {
	const out = new Map<string, CharacterKit>();
	for (const node of scene.children) {
		node.updateWorldMatrix(true, true);
		// CAST.md: resolve parts by userData.part (names may carry exporter suffixes).
		const parts: CharacterPart[] = node.children.map((part) => ({
			name: (part.userData.part as string | undefined) ?? part.name,
			pivot: part.position.clone(),
			parts: bake(part, part),
		}));
		out.set(node.name, { parts, placeholder: false });
	}
	return out;
}

function partsLibrary(scene: THREE.Object3D): PartsLibrary {
	const out: PartsLibrary = new Map();
	// CHARACTERS.md: resolve components by userData.id; names lose their slashes in GLTFLoader.
	for (const node of scene.children) out.set((node.userData.id as string | undefined) ?? node.name, node);
	scene.updateMatrixWorld(true);
	return out;
}

// ---------------------------------------------------------------------------------------------
// Placeholders

const placeholders = new Map<string, KitAsset>();

/** Mirrored copy of a part list: X flipped with the winding fixed, so culling stays right. */
export function mirrorParts(parts: KitPart[]): KitPart[] {
	return parts.map(({ geometry, material }) => {
		const g = geometry.clone();
		g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
		const index = g.getIndex();
		if (index) {
			const array = index.array;
			for (let i = 0; i < array.length; i += 3) {
				const t = array[i + 1];
				array[i + 1] = array[i + 2];
				array[i + 2] = t;
			}
			index.needsUpdate = true;
		} else {
			const position = g.getAttribute('position');
			const swap = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
				for (let i = 0; i < attr.count; i += 3)
					for (let k = 0; k < attr.itemSize; k++) {
						const a = attr.getComponent(i + 1, k);
						attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
						attr.setComponent(i + 2, k, a);
					}
			};
			for (const name of Object.keys(g.attributes)) swap(g.getAttribute(name));
			position.needsUpdate = true;
		}
		return { geometry: g, material };
	});
}

function colorBox(w: number, h: number, d: number, color: string, y = 0) {
	const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
	g.translate(0, y + h / 2, 0);
	const c = new THREE.Color(color);
	const colors = new Float32Array(g.getAttribute('position').count * 3);
	const normal = g.getAttribute('normal');
	for (let i = 0; i < colors.length / 3; i++) {
		// Tops a little lighter, sides a little darker, like the voxel kit.
		const f = normal.getY(i) > 0.5 ? 1.06 : normal.getY(i) < -0.5 ? 0.7 : 0.9;
		colors[i * 3] = c.r * f;
		colors[i * 3 + 1] = c.g * f;
		colors[i * 3 + 2] = c.b * f;
	}
	g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return g;
}

/** A pastel box the size of the asset's footprint (or desk-top size) and height. */
export function placeholderAsset(id: string, manifest: Manifest): KitAsset {
	const hit = placeholders.get(id);
	if (hit) return hit;
	const info = ASSETS[id as AssetId];
	const m = manifest[id];
	let w = 0.5;
	let d = 0.5;
	let h = m?.height ?? 0.5;
	if (info && 'fp' in info) {
		[w, d] = info.fp;
		w = w - 0.12;
		d = d - 0.12;
		h = m?.height ?? info.h;
	} else if (info) {
		[w, d] = info.size;
		h = m?.height ?? info.h;
	}
	const geometry = colorBox(w, Math.max(0.04, h), d, placeholderColor(id));
	if (info && 'kind' in info && info.kind === 'wall') geometry.translate(0, 0, d / 2);
	const asset: KitAsset = { parts: [{ geometry, material: 'voxel' }], placeholder: true };
	placeholders.set(id, asset);
	return asset;
}

const PLACEHOLDER_RIG: Record<string, { pivot: [number, number, number]; box: [number, number, number, number]; tone: number }> = {
	// [w, h, d, y offset from pivot]; tone indexes the character colours (skin, hair, top, legs)
	body: { pivot: [0, 0.5625, 0], box: [0.46, 0.5, 0.3, 0], tone: 2 },
	head: { pivot: [0, 1.0625, 0], box: [0.56, 0.52, 0.5, 0], tone: 0 },
	arm_l: { pivot: [0.28, 0.9375, 0], box: [0.14, 0.42, 0.16, -0.4], tone: 2 },
	arm_r: { pivot: [-0.28, 0.9375, 0], box: [0.14, 0.42, 0.16, -0.4], tone: 2 },
	leg_l: { pivot: [0.12, 0.5625, 0], box: [0.17, 0.56, 0.2, -0.56], tone: 3 },
	leg_r: { pivot: [-0.12, 0.5625, 0], box: [0.17, 0.56, 0.2, -0.56], tone: 3 },
};
const PLACEHOLDER_ANIMAL: typeof PLACEHOLDER_RIG = {
	body: { pivot: [0, 0.3, 0], box: [0.32, 0.26, 0.62, 0], tone: 0 },
	head: { pivot: [0, 0.45, 0.3], box: [0.3, 0.28, 0.3, 0], tone: 1 },
	tail: { pivot: [0, 0.45, -0.3], box: [0.08, 0.08, 0.22, 0], tone: 0 },
	leg_fl: { pivot: [0.1, 0.3, 0.2], box: [0.09, 0.3, 0.09, -0.3], tone: 3 },
	leg_fr: { pivot: [-0.1, 0.3, 0.2], box: [0.09, 0.3, 0.09, -0.3], tone: 3 },
	leg_bl: { pivot: [0.1, 0.3, -0.2], box: [0.09, 0.3, 0.09, -0.3], tone: 3 },
	leg_br: { pivot: [-0.1, 0.3, -0.2], box: [0.09, 0.3, 0.09, -0.3], tone: 3 },
};
const PLACEHOLDER_ROBOT: typeof PLACEHOLDER_RIG = {
	body: { pivot: [0, 0, 0], box: [0.55, 0.14, 0.55, 0], tone: 0 },
	top: { pivot: [0, 0.14, 0], box: [0.3, 0.05, 0.3, 0], tone: 1 },
};

const PLACEHOLDER_DRONE: typeof PLACEHOLDER_RIG = {
	body: { pivot: [0, 0.25, 0], box: [0.4, 0.16, 0.4, -0.08], tone: 0 },
	rotor_fl: { pivot: [0.25, 0.34, 0.25], box: [0.2, 0.03, 0.06, 0], tone: 1 },
	rotor_fr: { pivot: [-0.25, 0.34, 0.25], box: [0.2, 0.03, 0.06, 0], tone: 1 },
	rotor_bl: { pivot: [0.25, 0.34, -0.25], box: [0.2, 0.03, 0.06, 0], tone: 1 },
	rotor_br: { pivot: [-0.25, 0.34, -0.25], box: [0.2, 0.03, 0.06, 0], tone: 1 },
};
const PLACEHOLDER_BIRD: typeof PLACEHOLDER_RIG = {
	body: { pivot: [0, 0.19, 0], box: [0.22, 0.26, 0.26, -0.1], tone: 0 },
	head: { pivot: [0, 0.44, 0.06], box: [0.18, 0.18, 0.18, 0], tone: 1 },
	wing_l: { pivot: [0.12, 0.38, 0], box: [0.04, 0.2, 0.2, -0.2], tone: 2 },
	wing_r: { pivot: [-0.12, 0.38, 0], box: [0.04, 0.2, 0.2, -0.2], tone: 2 },
	tail: { pivot: [0, 0.19, -0.12], box: [0.08, 0.04, 0.2, 0], tone: 2 },
};
const PLACEHOLDER_HAMSTER: typeof PLACEHOLDER_RIG = {
	body: { pivot: [0, 0.12, 0], box: [0.2, 0.16, 0.24, -0.08], tone: 0 },
	head: { pivot: [0, 0.25, 0.06], box: [0.16, 0.14, 0.14, 0], tone: 1 },
	ball: { pivot: [0, 0.25, 0.06], box: [0.48, 0.48, 0.48, -0.24], tone: 2 },
};
const PLACEHOLDER_TABLES = {
	human: PLACEHOLDER_RIG,
	animal: PLACEHOLDER_ANIMAL,
	robot: PLACEHOLDER_ROBOT,
	drone: PLACEHOLDER_DRONE,
	bird: PLACEHOLDER_BIRD,
	hamster: PLACEHOLDER_HAMSTER,
} as const;

const characterPlaceholders = new Map<string, CharacterKit>();

export function placeholderCharacter(
	id: CharacterId,
	colors: [string, string, string, string],
	variant = '',
): CharacterKit {
	const key = `${id}|${variant}`;
	const hit = characterPlaceholders.get(key);
	if (hit) return hit;
	const rig = CHARACTERS[id];
	const table = PLACEHOLDER_TABLES[rig];
	const parts = RIG_PARTS[rig].map((name) => {
		const spec = table[name];
		const [w, h, d, y] = spec.box;
		const parts: KitPart[] = [{ geometry: colorBox(w, h, d, colors[spec.tone], y), material: 'voxel' }];
		if (name === 'head' && rig === 'human') {
			// A cap of hair so placeholders still read as people from above.
			parts.push({ geometry: colorBox(w + 0.04, 0.14, d + 0.04, colors[1], h - 0.08), material: 'voxel' });
		}
		return { name, pivot: new THREE.Vector3(...spec.pivot), parts };
	});
	const kit = { parts, placeholder: true };
	characterPlaceholders.set(key, kit);
	return kit;
}

// ---------------------------------------------------------------------------------------------
// Loading

class Quiet extends Component<{ children: ReactNode; name: string; onFail: () => void }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: unknown) {
		console.warn(`[quest] ${this.props.name} could not be loaded; using placeholders`, error);
		this.props.onFail();
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}

const withMeshopt = (loader: GLTFLoader) => loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * Loads one kit GLB (meshopt-compressed) and hands its scene, converted, to `onLoad`; its
 * download counts towards the loading bar as `stage`.
 */
function GlbLoader<T>({ url, stage, convert, onLoad }: { url: string; stage: LoadStage; convert: (scene: THREE.Object3D) => T; onLoad: (value: T) => void }) {
	const gltf = useLoader(GLTFLoader, url, withMeshopt, (e) => {
		if (e.lengthComputable && e.total > 0) reportLoad(stage, e.loaded / e.total);
	});
	useEffect(() => {
		onLoad(convert(gltf.scene));
		reportLoad(stage, 1);
	}, [gltf, stage, convert, onLoad]);
	return null;
}

/** Provides the kit to the scene; children render right away with placeholders. */
export function KitProvider({ children }: { children: ReactNode }) {
	const [manifest, setManifest] = useState<{ version: string; entries: Manifest } | null>(null);
	const [assets, setAssets] = useState<Map<string, KitAsset> | null>(null);
	const [characters, setCharacters] = useState<Map<string, CharacterKit> | null>(null);
	const [parts, setParts] = useState<PartsLibrary | null>(null);
	/** Kit files that will never arrive (missing manifest, a broken GLB). */
	const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
	const fail = (name: LoadStage) => () => {
		reportLoad(name, 1);
		setFailed((f) => new Set([...f, name]));
	};

	useEffect(() => {
		let live = true;
		const give = () => {
			if (!live) return;
			for (const stage of ['office', 'characters', 'parts'] as const) reportLoad(stage, 1);
			setFailed(new Set(['manifest']));
		};
		fetch(`${BASE}/kit-manifest.json`, { cache: 'no-store' })
			.then((r) => (r.ok ? r.text() : null))
			.then((text) => {
				if (!live) return;
				if (!text) return give();
				setManifest({ version: hashString(text).toString(36), entries: JSON.parse(text) as Manifest });
			})
			.catch(give);
		return () => {
			live = false;
		};
	}, []);

	const kit = useMemo<Kit>(
		() => ({
			assets: assets ?? EMPTY.assets,
			characters: characters ?? EMPTY.characters,
			parts,
			manifest: manifest?.entries ?? {},
			version: `${manifest?.version ?? 'none'}-${assets ? 'a' : ''}${characters ? 'c' : ''}${parts ? 'p' : ''}`,
			ready:
				failed.has('manifest') ||
				((assets !== null || failed.has('office')) &&
					(characters !== null || failed.has('characters')) &&
					(parts !== null || failed.has('parts'))),
		}),
		[assets, characters, parts, manifest, failed],
	);

	return (
		<KitContext.Provider value={kit}>
			{manifest ? (
				<>
					<Quiet name="office-kit.glb" onFail={fail('office')}>
						<Suspense fallback={null}>
							<GlbLoader url={`${BASE}/office-kit.glb?v=${manifest.version}`} stage="office" convert={officeAssets} onLoad={setAssets} />
						</Suspense>
					</Quiet>
					<Quiet name="characters.glb" onFail={fail('characters')}>
						<Suspense fallback={null}>
							<GlbLoader url={`${BASE}/characters.glb?v=${manifest.version}`} stage="characters" convert={characterKits} onLoad={setCharacters} />
						</Suspense>
					</Quiet>
					<Quiet name="character-parts.glb" onFail={fail('parts')}>
						<Suspense fallback={null}>
							<GlbLoader url={`${BASE}/character-parts.glb?v=${manifest.version}`} stage="parts" convert={partsLibrary} onLoad={setParts} />
						</Suspense>
					</Quiet>
				</>
			) : null}
			{children}
		</KitContext.Provider>
	);
}

const NOTHING: KitAsset = { parts: [], placeholder: true };

/**
 * The asset's parts from the kit. While the kit is still loading a missing id shows nothing
 * (it pops in with the real model); once it has loaded, a placeholder box stands in for an id
 * the kit really lacks.
 */
export function assetParts(kit: Kit, id: string): KitAsset {
	return kit.assets.get(id) ?? (kit.ready ? placeholderAsset(id, kit.manifest) : NOTHING);
}
