import * as THREE from 'three';

/**
 * A tiny modelling kit for procedural low-poly prefabs.
 *
 * Every part is a primitive with a transform and a flat colour. Parts are baked into one
 * non-indexed geometry with vertex colours, so a whole cottage is a single draw call.
 * `shade` darkens the bottom of a part (a cheap painted ambient occlusion) and `jitter`
 * varies the brightness per face, which is most of the hand-painted feel.
 */

export type Xf = {
	x?: number;
	y?: number;
	z?: number;
	rx?: number;
	ry?: number;
	rz?: number;
	sx?: number;
	sy?: number;
	sz?: number;
};

export type PartStyle = {
	/** 0..1, how much darker the bottom of the part is. */
	shade?: number;
	/** 0..1, random brightness variation per face. */
	jitter?: number;
	/** Keep smooth normals (canopies, wool); default is faceted. */
	smooth?: boolean;
};

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export class Kit {
	private positions: number[] = [];
	private normals: number[] = [];
	private colors: number[] = [];
	private random: () => number;

	constructor(seed = 1) {
		this.random = rng(seed);
	}

	add(
		source: THREE.BufferGeometry,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style: PartStyle = {},
	) {
		const geo = source.index ? source.toNonIndexed() : source.clone();
		if (!style.smooth) {
			geo.deleteAttribute('normal');
			geo.computeVertexNormals();
		}
		const pos = geo.getAttribute('position');
		let minY = Infinity;
		let maxY = -Infinity;
		for (let i = 0; i < pos.count; i++) {
			const y = pos.getY(i);
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		tmpEuler.set(xf.rx ?? 0, xf.ry ?? 0, xf.rz ?? 0);
		tmpQuat.setFromEuler(tmpEuler);
		tmpPos.set(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
		tmpScale.set(xf.sx ?? 1, xf.sy ?? 1, xf.sz ?? 1);
		tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
		const local = pos.array.slice();
		geo.applyMatrix4(tmpMatrix);
		const p = geo.getAttribute('position');
		const n = geo.getAttribute('normal');
		const base = tmpColor.set(color).clone();
		const shade = style.shade ?? 0.25;
		const jitter = style.jitter ?? 0.06;
		const span = maxY - minY || 1;
		let faceTint = 1;
		for (let i = 0; i < p.count; i++) {
			if (i % 3 === 0) faceTint = 1 + (this.random() - 0.5) * 2 * jitter;
			const t = (local[i * 3 + 1] - minY) / span;
			const k = (1 - shade + shade * t) * faceTint;
			this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
			this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
			this.colors.push(base.r * k, base.g * k, base.b * k);
		}
		geo.dispose();
		if (geo !== source) source.dispose();
		return this;
	}

	/** Bakes in a geometry that already carries its own vertex colours (built by another Kit). */
	merge(source: THREE.BufferGeometry) {
		const geo = source.index ? source.toNonIndexed() : source;
		const p = geo.getAttribute('position');
		const n = geo.getAttribute('normal');
		const c = geo.getAttribute('color');
		for (let i = 0; i < p.count; i++) {
			this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
			this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
			if (c) this.colors.push(c.getX(i), c.getY(i), c.getZ(i));
			else this.colors.push(1, 1, 1);
		}
		if (geo !== source) geo.dispose();
		source.dispose();
		return this;
	}

	/** Box standing on y (its base), centred on x/z. */
	box(
		w: number,
		h: number,
		d: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		const g = new THREE.BoxGeometry(w, h, d);
		g.translate(0, h / 2, 0);
		return this.add(g, color, xf, style);
	}

	/** Cylinder standing on its base. */
	cyl(
		rTop: number,
		rBottom: number,
		h: number,
		seg: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
		g.translate(0, h / 2, 0);
		return this.add(g, color, xf, style);
	}

	cone(
		r: number,
		h: number,
		seg: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		const g = new THREE.ConeGeometry(r, h, seg, 1);
		g.translate(0, h / 2, 0);
		return this.add(g, color, xf, style);
	}

	/** Icosphere centred on its position; detail 0 is chunky, 1 is round. */
	ball(
		r: number,
		detail: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		return this.add(new THREE.IcosahedronGeometry(r, detail), color, xf, style);
	}

	sphere(
		r: number,
		wSeg: number,
		hSeg: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		return this.add(new THREE.SphereGeometry(r, wSeg, hSeg), color, xf, style);
	}

	/** Triangular prism, ridge along x, standing on its base. */
	prism(
		w: number,
		h: number,
		d: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		style?: PartStyle,
	) {
		const shape = new THREE.Shape();
		shape.moveTo(-d / 2, 0);
		shape.lineTo(d / 2, 0);
		shape.lineTo(0, h);
		shape.closePath();
		const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
		g.translate(0, 0, -w / 2);
		g.rotateY(Math.PI / 2);
		return this.add(g, color, xf, style);
	}

	/**
	 * A steep gable roof over a w × d body (ridge along x), with overhang and thickness.
	 * `y` is the eave height.
	 */
	gableRoof(
		w: number,
		d: number,
		h: number,
		color: THREE.ColorRepresentation,
		xf: Xf = {},
		opts: { overhang?: number; thickness?: number } = {},
	) {
		const over = opts.overhang ?? 0.18;
		const thick = opts.thickness ?? 0.12;
		const half = d / 2 + over;
		const slope = Math.hypot(half, h);
		const angle = Math.atan2(h, half);
		for (const side of [-1, 1]) {
			const g = new THREE.BoxGeometry(w + over * 2, thick, slope);
			// Hinge at the ridge so the slab hangs down to the eave.
			g.translate(0, thick / 2, (side * slope) / 2);
			g.rotateX(side * angle);
			g.translate(0, h, 0);
			this.add(g, color, xf, { shade: 0.15, jitter: 0.05 });
		}
		return this;
	}

	build() {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
		geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
		geo.computeBoundingSphere();
		geo.computeBoundingBox();
		return geo;
	}

	get empty() {
		return this.positions.length === 0;
	}
}

/** Linear-space copy of a palette colour, mixed toward another. */
export function mix(
	a: THREE.ColorRepresentation,
	b: THREE.ColorRepresentation,
	t: number,
) {
	return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export function shadeOf(a: THREE.ColorRepresentation, k: number) {
	return new THREE.Color(a).multiplyScalar(k);
}

/** A cache of built geometries; prefabs are rebuilt only when their key changes. */
const cache = new Map<string, unknown>();
export function cached<T>(key: string, make: () => T): T {
	let v = cache.get(key) as T | undefined;
	if (!v) {
		v = make();
		cache.set(key, v);
	}
	return v;
}
