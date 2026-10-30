import {
	clientMessage,
	clampPose,
	CLOSE_FULL,
	CLOSE_REPLACED,
	CLOSE_STALE,
	EMOTE_COOLDOWN_MS,
	MAX_MESSAGE_LENGTH,
	PUBLIC_ID,
	RATE_BURST,
	RATE_PER_SECOND,
	ROOM_CAP,
	SESSION_ID,
	STALE_MS,
	type ForgePhase,
	type PlayerState,
	type Pose,
	type ServerMessage,
} from './protocol';

export type RoomSocket = {
	readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	serializeAttachment(value: unknown): void;
	deserializeAttachment(): unknown;
};

const PRUNE_EVERY_MS = 30_000;

type Attachment = { session: string; id: string; pose: Pose | null; seen: number };
type Host = {
	sockets(): RoomSocket[];
	now(): number;
	lastPing(socket: RoomSocket): number | null;
};

export function newSessionId(): string {
	return crypto.randomUUID();
}

export async function publicIdFor(sessionId: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(sessionId),
	);
	return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
		byte.toString(16).padStart(2, '0'),
	).join('');
}

function attachment(socket: RoomSocket): Attachment | null {
	try {
		const raw: unknown = socket.deserializeAttachment();
		if (!raw || typeof raw !== 'object') return null;
		const value = raw as Record<string, unknown>;
		if (
			typeof value.session !== 'string' ||
			!SESSION_ID.test(value.session) ||
			typeof value.id !== 'string' ||
			!PUBLIC_ID.test(value.id) ||
			typeof value.seen !== 'number' ||
			!Number.isFinite(value.seen)
		)
			return null;
		let pose: Pose | null = null;
		if (value.pose !== null) {
			if (!value.pose || typeof value.pose !== 'object') return null;
			const parsed = clientMessage.safeParse({ ...value.pose, t: 'move' });
			if (!parsed.success || parsed.data.t !== 'move') return null;
			pose = clampPose(parsed.data);
		}
		return { session: value.session, id: value.id, pose, seen: value.seen };
	} catch {
		return null;
	}
}

export function createRoom(host: Host) {
	const closed = new WeakSet<RoomSocket>();
	const buckets = new WeakMap<RoomSocket, { tokens: number; at: number }>();
	const emotes = new Map<string, number>();
	const joined = (socket: RoomSocket) =>
		socket.readyState === 1 && !closed.has(socket) ? attachment(socket) : null;

	function send(socket: RoomSocket, message: ServerMessage) {
		try {
			socket.send(JSON.stringify(message));
		} catch {
			/* A broken peer cannot stop fan-out. */
		}
	}
	function broadcast(message: ServerMessage, exceptId?: string) {
		for (const socket of host.sockets()) {
			const state = joined(socket);
			if (state && state.id !== exceptId) send(socket, message);
		}
	}
	function detach(socket: RoomSocket) {
		closed.add(socket);
		buckets.delete(socket);
		// Persist cleanup too: a delayed close/message after hibernation stays harmless.
		try {
			socket.serializeAttachment(null);
		} catch {
			/* The connection may already be gone. */
		}
	}
	function stop(socket: RoomSocket, code: number, reason: string) {
		detach(socket);
		try {
			socket.close(code, reason);
		} catch {
			/* Already disconnected. */
		}
	}
	function leave(id: string) {
		if (host.sockets().some((socket) => joined(socket)?.id === id)) return;
		emotes.delete(id);
		broadcast({ t: 'leave', id });
	}
	function close(socket: RoomSocket) {
		if (closed.has(socket)) return;
		const state = attachment(socket);
		detach(socket);
		if (state) leave(state.id);
	}
	function count() {
		return host.sockets().filter((socket) => joined(socket)).length;
	}

	let prunedAt = -Infinity;
	/** Drops sockets with no message and no ping for STALE_MS (vanished without a close). */
	function prune(except?: RoomSocket) {
		prunedAt = host.now();
		const staleIds = new Set<string>();
		for (const peer of host.sockets()) {
			if (peer === except) continue;
			const state = joined(peer);
			if (
				state &&
				host.now() - Math.max(state.seen, host.lastPing(peer) ?? state.seen) > STALE_MS
			) {
				stop(peer, CLOSE_STALE, 'stale');
				staleIds.add(state.id);
			}
		}
		for (const staleId of staleIds) leave(staleId);
	}

	function join(socket: RoomSocket, session: string, id: string) {
		prune(socket);
		let pose: Pose | null = null;
		for (const peer of host.sockets()) {
			if (peer === socket) continue;
			const state = joined(peer);
			if (state?.session === session) {
				pose = state.pose ?? pose;
				stop(peer, CLOSE_REPLACED, 'replaced');
			}
		}
		const peers = host.sockets().filter((peer) => peer !== socket && joined(peer));
		if (peers.length >= ROOM_CAP) {
			stop(socket, CLOSE_FULL, 'full');
			return;
		}
		socket.serializeAttachment({
			session,
			id,
			pose,
			seen: host.now(),
		} satisfies Attachment);
		const players = new Map<string, PlayerState>();
		for (const peer of peers) {
			const state = joined(peer);
			if (state?.pose && state.id !== id)
				players.set(state.id, { id: state.id, ...state.pose });
		}
		send(socket, { t: 'welcome', you: id, session, players: [...players.values()] });
	}

	function message(socket: RoomSocket, data: string | ArrayBuffer) {
		const state = joined(socket);
		if (!state || typeof data !== 'string' || data.length > MAX_MESSAGE_LENGTH) return;
		// Ghosts also go between joins, at most every PRUNE_EVERY_MS.
		if (host.now() - prunedAt > PRUNE_EVERY_MS) prune(socket);
		let raw: unknown;
		try {
			raw = JSON.parse(data);
		} catch {
			return;
		}
		const parsed = clientMessage.safeParse(raw);
		if (!parsed.success) return;
		const now = host.now();
		const bucket = buckets.get(socket) ?? { tokens: RATE_BURST, at: now };
		bucket.tokens = Math.min(
			RATE_BURST,
			bucket.tokens + (Math.max(0, now - bucket.at) * RATE_PER_SECOND) / 1000,
		);
		bucket.at = now;
		buckets.set(socket, bucket);
		if (bucket.tokens < 1) return;
		bucket.tokens--;
		const event = parsed.data;
		if (event.t === 'emote') {
			const last = emotes.get(state.id);
			if (last !== undefined && now - last < EMOTE_COOLDOWN_MS) return;
			emotes.set(state.id, now);
		} else state.pose = clampPose(event);
		state.seen = now;
		socket.serializeAttachment(state);
		if (event.t === 'move')
			broadcast({ t: 'move', id: state.id, ...state.pose! }, state.id);
		else broadcast({ t: 'emote', id: state.id, e: event.e }, state.id);
	}

	return {
		join,
		message,
		close,
		count,
		forge: (phase: ForgePhase) => broadcast({ t: 'forge', phase }),
	};
}
