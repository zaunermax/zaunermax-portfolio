import { describe, expect, it } from 'vitest';
import { createRoom, newSessionId, publicIdFor, type RoomSocket } from './room.server';
import {
	CLOSE_FULL,
	CLOSE_REPLACED,
	CLOSE_STALE,
	EMOTE_COOLDOWN_MS,
	MAX_MESSAGE_LENGTH,
	RATE_BURST,
	RATE_PER_SECOND,
	ROOM_CAP,
	SESSION_ID,
	STALE_MS,
	type ServerMessage,
} from './protocol';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/schema';

class Socket implements RoomSocket {
	readyState = 1;
	attachment: unknown = null;
	messages: ServerMessage[] = [];
	closes: { code?: number; reason?: string }[] = [];
	broken = false;
	send(data: string) {
		if (this.broken) throw new Error('disconnected');
		this.messages.push(JSON.parse(data));
	}
	close(code?: number, reason?: string) {
		this.closes.push({ code, reason });
		this.readyState = 2;
	}
	serializeAttachment(value: unknown) {
		this.attachment = structuredClone(value);
	}
	deserializeAttachment() {
		return structuredClone(this.attachment);
	}
}

const move = JSON.stringify({ t: 'move', x: 4, y: 6, h: 0, m: true });
const wave = JSON.stringify({ t: 'emote', e: 'wave' });
function setup() {
	let now = 10_000;
	const sockets: Socket[] = [];
	const pings = new Map<RoomSocket, number>();
	const host = {
		sockets: () => sockets,
		now: () => now,
		lastPing: (s: RoomSocket) => pings.get(s) ?? null,
	};
	const room = createRoom(host);
	async function join(session = newSessionId()) {
		const socket = new Socket();
		sockets.push(socket);
		room.join(socket, session, await publicIdFor(session));
		return socket;
	}
	return {
		room,
		join,
		sockets,
		pings,
		host,
		advance: (ms: number) => {
			now += ms;
		},
	};
}
function welcome(socket: Socket) {
	const message = socket.messages.find((m) => m.t === 'welcome');
	if (!message || message.t !== 'welcome') throw new Error('no welcome');
	return message;
}

it('issues UUID sessions and stable, distinct 16-hex SHA-256 public ids', async () => {
	expect(newSessionId()).toMatch(SESSION_ID);
	expect(await publicIdFor('abc')).toBe('ba7816bf8f01cfea');
	expect(await publicIdFor('abcd')).not.toBe(await publicIdFor('abc'));
});

describe('room capacity and reconnects', () => {
	it('caps at 50, excludes replacements, and frees a place after a leave', async () => {
		const { room, join, sockets } = setup();
		for (let i = 0; i < ROOM_CAP; i++) await join();
		expect(room.count()).toBe(50);
		const full = await join();
		expect(full.closes).toEqual([{ code: CLOSE_FULL, reason: 'full' }]);
		expect(full.messages).toEqual([]);
		const replacement = await join(welcome(sockets[0]).session);
		expect(welcome(replacement).you).toBe(welcome(sockets[0]).you);
		expect(room.count()).toBe(50);
		room.close(sockets[1]);
		expect(welcome(await join()).t).toBe('welcome');
		expect(room.count()).toBe(50);
	});

	it('replaces without leave, carries the pose, and keeps one public entry', async () => {
		const { room, join } = setup();
		const a = await join();
		const b = await join();
		room.message(a, move);
		const replacement = await join(welcome(a).session);
		expect(a.closes).toEqual([{ code: CLOSE_REPLACED, reason: 'replaced' }]);
		expect(welcome(replacement).you).toBe(welcome(a).you);
		expect(welcome(replacement).players).toEqual([]);
		room.close(a);
		room.message(a, move);
		expect(b.messages.filter((m) => m.t === 'leave')).toEqual([]);
		expect(b.messages.filter((m) => m.t === 'move')).toHaveLength(1);
		expect(welcome(await join()).players).toEqual([
			{ id: welcome(a).you, x: 4, y: 6, h: 0, m: true },
		]);
		room.message(replacement, move);
		expect(replacement.messages).toHaveLength(1);
		expect(room.count()).toBe(3);
	});

	it('deduplicates positioned peers and excludes the joining public id', async () => {
		const { room, join, sockets } = setup();
		const a = await join();
		room.message(a, move);
		const duplicate = new Socket();
		duplicate.attachment = a.attachment;
		sockets.push(duplicate);
		expect(welcome(await join()).players).toHaveLength(1);
		const own = new Socket();
		sockets.push(own);
		room.join(own, newSessionId(), welcome(a).you);
		expect(welcome(own).players).toEqual([]);
	});
});

describe('messages', () => {
	it('drops binary, oversize, malformed, unknown, extra keys and non-finite values', async () => {
		const { room, join } = setup();
		const a = await join();
		const b = await join();
		for (const data of [
			new ArrayBuffer(2),
			' '.repeat(MAX_MESSAGE_LENGTH + 1),
			'{',
			'null',
			'{"t":"unknown"}',
			'{"t":"move","x":0,"y":0,"h":0,"m":false,"secret":1}',
			'{"t":"move","x":1e999,"y":0,"h":0,"m":false}',
			'{"t":"move","x":NaN,"y":0,"h":0,"m":false}',
			'{"t":"move","x":null,"y":0,"h":0,"m":false}',
			'{"t":"emote","e":"wave","extra":1}',
		])
			room.message(a, data);
		expect(b.messages).toHaveLength(1);
		expect(a.attachment).toMatchObject({ pose: null });
		room.message(
			a,
			JSON.stringify({ t: 'move', x: WORLD_WIDTH + 9, y: -4, h: 20, m: false }),
		);
		expect(b.messages.at(-1)).toMatchObject({
			t: 'move',
			x: WORLD_WIDTH,
			y: 0,
			m: false,
		});
		room.message(
			a,
			JSON.stringify({ t: 'move', x: -4, y: WORLD_HEIGHT + 9, h: 0, m: true }),
		);
		expect(b.messages.at(-1)).toMatchObject({ t: 'move', x: 0, y: WORLD_HEIGHT });
		expect(a.messages).toHaveLength(1);
	});

	it('limits each socket with a replenishing token bucket', async () => {
		const { room, join, advance } = setup();
		const a = await join();
		const b = await join();
		for (let i = 0; i < RATE_BURST + 10; i++) room.message(a, move);
		expect(b.messages.filter((m) => m.t === 'move')).toHaveLength(RATE_BURST);
		advance(1000);
		for (let i = 0; i < RATE_BURST; i++) room.message(a, move);
		expect(b.messages.filter((m) => m.t === 'move')).toHaveLength(
			RATE_BURST + RATE_PER_SECOND,
		);
		room.message(b, move);
		expect(a.messages.at(-1)?.t).toBe('move');
	});

	it('limits waves per player across replacement and refreshes accepted-message timestamps', async () => {
		const { room, join, advance } = setup();
		const a = await join();
		const b = await join();
		advance(10);
		room.message(a, wave);
		expect(a.attachment).toMatchObject({ seen: 10_010 });
		const replacement = await join(welcome(a).session);
		room.message(replacement, wave);
		expect(b.messages.filter((m) => m.t === 'emote')).toHaveLength(1);
		advance(EMOTE_COOLDOWN_MS);
		room.message(replacement, wave);
		expect(b.messages.filter((m) => m.t === 'emote')).toHaveLength(2);
		expect(replacement.messages).toHaveLength(1);
	});

	it('tolerates invalid attachments and recovers positioned peers after hibernation', async () => {
		const { room, join, host, sockets } = setup();
		const a = await join();
		const b = await join();
		room.message(a, move);
		const awake = createRoom(host);
		const c = new Socket();
		sockets.push(c);
		const session = newSessionId();
		awake.join(c, session, await publicIdFor(session));
		expect(welcome(c).players).toHaveLength(1);
		for (const bad of [
			null,
			{},
			{ session: 'bad' },
			{ ...(a.attachment as object), seen: Infinity },
			{ ...(a.attachment as object), pose: { x: 0 } },
		]) {
			b.attachment = bad;
			awake.message(b, move);
		}
		b.deserializeAttachment = () => {
			throw new Error('corrupt');
		};
		awake.message(b, move);
		expect(c.messages).toHaveLength(1);
	});
});

describe('cleanup and broadcasts', () => {
	it('broadcasts leave exactly once, including after rehydration', async () => {
		const { room, join, host } = setup();
		const a = await join();
		const b = await join();
		a.readyState = 3;
		room.close(a);
		room.close(a);
		createRoom(host).close(a);
		expect(b.messages.filter((m) => m.t === 'leave')).toEqual([
			{ t: 'leave', id: welcome(a).you },
		]);
	});

	it('prunes stale peers on join but keeps sockets with recent auto-pings', async () => {
		const { room, join, advance, pings, host } = setup();
		const a = await join();
		const b = await join();
		advance(STALE_MS + 1);
		pings.set(b, host.now());
		await join();
		expect(a.closes).toEqual([{ code: CLOSE_STALE, reason: 'stale' }]);
		expect(b.closes).toEqual([]);
		expect(b.messages.filter((m) => m.t === 'leave')).toEqual([
			{ t: 'leave', id: welcome(a).you },
		]);
		room.close(a);
		expect(b.messages.filter((m) => m.t === 'leave')).toHaveLength(1);
	});

	it('also prunes ghosts between joins when others move, never the mover', async () => {
		const { room, join, advance } = setup();
		const ghost = await join();
		const mover = await join();
		const watcher = await join();
		advance(STALE_MS - 1_000);
		room.message(mover, move);
		// Past the 30 s prune throttle.
		advance(31_000);
		// The watcher was silent too, but its own message proves it is alive.
		room.message(watcher, move);
		expect(ghost.closes).toEqual([{ code: CLOSE_STALE, reason: 'stale' }]);
		expect(mover.closes).toEqual([]);
		expect(watcher.closes).toEqual([]);
		expect(mover.messages.filter((m) => m.t === 'leave')).toEqual([
			{ t: 'leave', id: welcome(ghost).you },
		]);
		expect(watcher.messages.some((m) => m.t === 'move')).toBe(true);
	});

	it('fans forge events out to all joined peers despite send failures', async () => {
		const { room, join, sockets } = setup();
		const a = await join();
		const broken = await join();
		const b = await join();
		const unjoined = new Socket();
		sockets.push(unjoined);
		broken.broken = true;
		for (const phase of ['start', 'done', 'error'] as const) room.forge(phase);
		for (const peer of [a, b])
			expect(peer.messages.slice(1)).toEqual([
				{ t: 'forge', phase: 'start' },
				{ t: 'forge', phase: 'done' },
				{ t: 'forge', phase: 'error' },
			]);
		expect(unjoined.messages).toEqual([]);
		room.message(a, move);
		expect(b.messages.at(-1)?.t).toBe('move');
	});

	it('never leaks another player’s session in welcome, movement, emotes, forge or leave', async () => {
		const { room, join } = setup();
		const a = await join();
		room.message(a, move);
		const b = await join();
		room.message(a, move);
		room.message(a, wave);
		room.forge('start');
		room.close(a);
		expect(JSON.stringify(b.messages)).not.toContain(welcome(a).session);
		expect(JSON.stringify(a.messages)).not.toContain(welcome(b).session);
	});
});
