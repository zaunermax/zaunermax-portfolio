import type { LandmarkId } from '../world/schema';
import type { CharacterId } from '../world/catalog';

/**
 * The seam between the HTML HUD and the 3D scene. Hot data (positions) is plain mutable state
 * read in animation frames; rare events (what is nearby, speech) go through subscriptions so
 * React only re-renders when something a person can see changes.
 */

export type Interactable =
	| { kind: 'landmark'; id: LandmarkId; name: string }
	| { kind: 'npc'; id: string; name: string; npc: CharacterId; line: string };

export type WalkTarget = (
	| { kind: 'cell'; x: number; y: number }
	| { kind: 'landmark'; id: LandmarkId }
	| { kind: 'npc'; id: string }
) & { warp?: boolean };

type Listener = () => void;

/** Anchor id of Max himself; his desk needs no plate of its own. */
export const MAX_ANCHOR = 'max-npc';

export class GameBus {
	/** Player position in cell space and heading in radians (0 faces south). */
	player = { x: 20, y: 16, heading: Math.PI, moving: false };
	/** NPC positions by entity id. */
	npcs = new Map<string, { x: number; y: number }>();
	/** Other visitors' smoothed positions by public id (multiplayer), written by the scene. */
	visitors = new Map<string, { x: number; y: number }>();
	/** Camera yaw, for rotating the minimap arrow when the map is not north-up. */
	cameraYaw = 0;
	/** Where labels hang in world space (x, height, z), by entity id. Written by the scene. */
	anchors = new Map<string, { x: number; y: number; z: number }>();
	/** View-projection matrix and camera position of the last frame, for the HTML label layer. */
	view = { matrix: new Float32Array(16), x: 0, y: 0, z: 0, frame: 0, overview: false };

	private nearby: Interactable | null = null;
	private nearbyListeners = new Set<Listener>();
	private speech: ReadonlyMap<string, { text: string; until: number }> = new Map();
	private speechListeners = new Set<Listener>();
	private walkListeners = new Set<(target: WalkTarget) => void>();
	private interactListeners = new Set<(target: Interactable) => void>();
	private skipListeners = new Set<Listener>();
	private waveListeners = new Set<Listener>();
	private waveAt = -Infinity;

	setPlayer(x: number, y: number, heading: number, moving: boolean) {
		this.player.x = x;
		this.player.y = y;
		this.player.heading = heading;
		this.player.moving = moving;
	}

	setNpc(id: string, x: number, y: number) {
		const pos = this.npcs.get(id);
		if (pos) {
			pos.x = x;
			pos.y = y;
		} else this.npcs.set(id, { x, y });
	}

	setCameraYaw(yaw: number) {
		this.cameraYaw = yaw;
	}

	setAnchor(id: string, x: number, y: number, z: number) {
		const a = this.anchors.get(id);
		if (a) {
			a.x = x;
			a.y = y;
			a.z = z;
		} else this.anchors.set(id, { x, y, z });
	}

	removeAnchor(id: string) {
		this.anchors.delete(id);
	}

	setView(matrix: ArrayLike<number>, x: number, y: number, z: number, overview: boolean) {
		this.view.matrix.set(matrix);
		this.view.x = x;
		this.view.y = y;
		this.view.z = z;
		this.view.overview = overview;
		this.view.frame++;
	}

	// --- nearby (scene writes, HUD reads)
	setNearby(next: Interactable | null) {
		const prev = this.nearby;
		if (prev === next) return;
		if (prev && next && prev.kind === next.kind && prev.id === next.id) return;
		this.nearby = next;
		for (const l of this.nearbyListeners) l();
	}
	getNearby = () => this.nearby;
	subscribeNearby = (l: Listener) => {
		this.nearbyListeners.add(l);
		return () => this.nearbyListeners.delete(l);
	};

	// --- speech bubbles: an immutable snapshot, replaced on every change
	say(id: string, text: string, ms = 6000) {
		const next = new Map(this.speech);
		next.set(id, { text, until: performance.now() + ms });
		this.speech = next;
		for (const l of this.speechListeners) l();
	}
	getSpeech = () => this.speech;
	subscribeSpeech = (l: Listener) => {
		this.speechListeners.add(l);
		return () => this.speechListeners.delete(l);
	};

	// --- commands (HUD → scene)
	/** Puts the visitor straight at a target (review tooling and tests). */
	warpTo(target: WalkTarget) {
		for (const l of this.walkListeners) l({ ...target, warp: true } as WalkTarget);
	}

	walkTo(target: WalkTarget) {
		for (const l of this.walkListeners) l(target);
	}
	onWalk(l: (target: WalkTarget) => void) {
		this.walkListeners.add(l);
		return () => {
			this.walkListeners.delete(l);
		};
	}

	/** Interact with whatever is nearby (F key, or the prompt button). */
	interact() {
		if (this.nearby) for (const l of this.interactListeners) l(this.nearby);
	}
	/** Scene → app: the visitor arrived at or pressed F on something. */
	emitInteract(target: Interactable) {
		for (const l of this.interactListeners) l(target);
	}
	onInteract(l: (target: Interactable) => void) {
		this.interactListeners.add(l);
		return () => {
			this.interactListeners.delete(l);
		};
	}

	/** The visitor waves (G key or the HUD button), at most every 1.5 seconds. */
	wave() {
		const t = performance.now();
		if (t - this.waveAt < 1500) return;
		this.waveAt = t;
		for (const l of this.waveListeners) l();
	}
	onWave(l: Listener) {
		this.waveListeners.add(l);
		return () => {
			this.waveListeners.delete(l);
		};
	}

	/** Any key or click during the intro skips it. */
	skipIntro() {
		for (const l of this.skipListeners) l();
	}
	onSkip(l: Listener) {
		this.skipListeners.add(l);
		return () => {
			this.skipListeners.delete(l);
		};
	}
}
