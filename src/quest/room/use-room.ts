'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameBus } from '../scene/bus';
import { now } from '../scene/spawn';
import { Presence } from './presence';
import {
	clampPose,
	CLOSE_DISABLED,
	CLOSE_FULL,
	CLOSE_REPLACED,
	parseServerMessage,
	PING,
	PING_EVERY_MS,
	ROOM_API,
	SESSION_ID,
	SESSION_PARAM,
	type ForgePhase,
	type Pose,
} from './protocol';

/**
 * The client side of the live room. Connects when multiplayer is on, sends the visitor's pose
 * when it changes (10 Hz at most, never while the tab is hidden), and falls back to solo play
 * whenever there is no room: switched off, full, or unreachable. Solo play is exactly the office
 * without anyone else in it.
 */

export type RoomStatus =
	/** Multiplayer is off, or this page shows a preview office: never connects. */
	| 'off'
	| 'connecting'
	| 'live'
	/** The room is at its cap; playing solo and trying again now and then. */
	| 'full'
	/** Lost or could not reach the room; playing solo and reconnecting with backoff. */
	| 'offline';

/** Room events the world hook cares about: a resync after joining, and redeploys. */
export type RoomEvent = { type: 'joined' } | { type: 'forge'; phase: ForgePhase };

export type UseRoom = {
	status: RoomStatus;
	/** This tab's public id once it has joined, kept through reconnects (for its own look). */
	you: string | null;
	/** People in the office, this visitor included; 0 when not connected. */
	count: number;
	presence: Presence;
	subscribe: (listener: (event: RoomEvent) => void) => () => void;
};

const SESSION_KEY = 'quest-room-session';
const SEND_EVERY_MS = 100;
/** A tab hidden this long leaves the room (freeing its place) and rejoins when shown again. */
const HIDDEN_LEAVE_MS = 2 * 60_000;

/**
 * How long to wait before the next attempt: a full room is retried slowly (30 s doubling to
 * 5 min), a failed connection quickly (1 s doubling to 30 s), both with ±20% jitter.
 */
export function retryDelay(reason: 'full' | 'error', attempt: number, random = Math.random) {
	const [base, cap] = reason === 'full' ? [30_000, 5 * 60_000] : [1_000, 30_000];
	const delay = Math.min(cap, base * 2 ** Math.min(attempt, 10));
	return Math.round(delay * (0.8 + random() * 0.4));
}

/** Whether a pose differs enough from the last one sent to be worth sending. */
export function poseChanged(last: Pose | null, next: Pose) {
	if (!last) return true;
	let dh = Math.abs(next.h - last.h);
	if (dh > Math.PI) dh = Math.PI * 2 - dh;
	return (
		last.m !== next.m ||
		Math.abs(next.x - last.x) >= 0.02 ||
		Math.abs(next.y - last.y) >= 0.02 ||
		dh >= 0.05
	);
}

function readSession() {
	try {
		const value = sessionStorage.getItem(SESSION_KEY);
		return value && SESSION_ID.test(value) ? value : null;
	} catch {
		return null;
	}
}

function writeSession(value: string | null) {
	try {
		if (value) sessionStorage.setItem(SESSION_KEY, value);
		else sessionStorage.removeItem(SESSION_KEY);
	} catch {
		/* Private mode without storage: every reconnect is a new visitor. */
	}
}

const NO_IDS: readonly string[] = [];

export function useRoom({ enabled, bus }: { enabled: boolean; bus: GameBus }): UseRoom {
	const [presence] = useState(() => new Presence());
	const [listeners] = useState(() => new Set<(event: RoomEvent) => void>());
	const [subscribe] = useState(() => (listener: (event: RoomEvent) => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	});
	const [status, setStatus] = useState<Exclude<RoomStatus, 'off'>>('connecting');
	const [you, setYou] = useState<string | null>(null);
	const ids = useSyncExternalStore(presence.subscribe, presence.getIds, () => NO_IDS);

	useEffect(() => {
		if (!enabled || typeof WebSocket === 'undefined') return;
		let socket: WebSocket | null = null;
		let live = false;
		let stopped = false;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let retryPending = false;
		let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
		let leftWhileHidden = false;
		let failures = 0;
		let fullTries = 0;
		let sent: Pose | null = null;
		const emit = (event: RoomEvent) => {
			for (const l of listeners) l(event);
		};

		const schedule = (ms: number) => {
			clearTimeout(retry);
			retryPending = true;
			retry = setTimeout(() => {
				retryPending = false;
				connect();
			}, ms);
		};

		const send = (data: unknown) => {
			if (live && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
		};

		const sendPose = () => {
			if (!live || document.hidden) return;
			const p = bus.player;
			const pose = clampPose({ x: p.x, y: p.y, h: p.heading, m: p.moving });
			if (!poseChanged(sent, pose)) return;
			sent = pose;
			send({ t: 'move', ...pose });
		};

		function connect() {
			// A hidden tab waits until it is shown again.
			if (stopped || socket || document.hidden) return;
			const url = new URL(ROOM_API, window.location.href);
			url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
			const session = readSession();
			if (session) url.searchParams.set(SESSION_PARAM, session);
			let ws: WebSocket;
			try {
				ws = new WebSocket(url);
			} catch {
				setStatus('offline');
				schedule(retryDelay('error', failures++));
				return;
			}
			socket = ws;
			ws.onmessage = (e) => {
				if (socket !== ws) return;
				const message = parseServerMessage(e.data);
				if (!message) return;
				if (message.t === 'welcome') {
					live = true;
					failures = 0;
					fullTries = 0;
					sent = null;
					writeSession(message.session);
					presence.apply(message, now());
					setYou(message.you);
					setStatus('live');
					sendPose();
					emit({ type: 'joined' });
				} else if (message.t === 'forge') {
					emit({ type: 'forge', phase: message.phase });
				} else presence.apply(message, now());
			};
			ws.onclose = (e) => {
				if (socket !== ws) return;
				socket = null;
				live = false;
				presence.reset();
				if (stopped) return;
				if (e.code === CLOSE_DISABLED) {
					// Switched off: stay solo for the rest of this visit.
					stopped = true;
					setStatus('offline');
					return;
				}
				if (e.code === CLOSE_FULL) {
					setStatus('full');
					schedule(retryDelay('full', fullTries++));
					return;
				}
				if (e.code === CLOSE_REPLACED) {
					// This session connected again elsewhere (a duplicated tab): rejoin as someone new.
					writeSession(null);
					setStatus('connecting');
					schedule(retryDelay('error', 0));
					return;
				}
				if (leftWhileHidden) {
					setStatus('connecting');
					return;
				}
				setStatus((s) => (s === 'full' ? s : 'offline'));
				schedule(retryDelay('error', failures++));
			};
		}

		const onVisibility = () => {
			clearTimeout(hiddenTimer);
			if (document.hidden) {
				hiddenTimer = setTimeout(() => {
					if (!socket) return;
					leftWhileHidden = true;
					socket.close(1000, 'hidden');
				}, HIDDEN_LEAVE_MS);
				return;
			}
			leftWhileHidden = false;
			if (socket) sendPose();
			else if (!retryPending) connect();
		};

		const onWave = bus.onWave(() => send({ t: 'emote', e: 'wave' }));
		const sender = setInterval(sendPose, SEND_EVERY_MS);
		const pinger = setInterval(() => {
			if (live && socket?.readyState === WebSocket.OPEN) socket.send(PING);
		}, PING_EVERY_MS);
		document.addEventListener('visibilitychange', onVisibility);
		connect();
		return () => {
			stopped = true;
			clearTimeout(retry);
			clearTimeout(hiddenTimer);
			clearInterval(sender);
			clearInterval(pinger);
			onWave();
			document.removeEventListener('visibilitychange', onVisibility);
			const ws = socket;
			socket = null;
			ws?.close(1000, 'bye');
			presence.reset();
		};
	}, [enabled, bus, presence, listeners]);

	const current: RoomStatus = enabled ? status : 'off';
	return {
		status: current,
		you: enabled ? you : null,
		count: current === 'live' ? ids.length + 1 : 0,
		presence,
		subscribe,
	};
}
