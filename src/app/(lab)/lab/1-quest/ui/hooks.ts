'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

export function useMedia(query: string) {
	return useSyncExternalStore(
		(cb) => {
			const mql = window.matchMedia(query);
			mql.addEventListener('change', cb);
			return () => mql.removeEventListener('change', cb);
		},
		() => window.matchMedia(query).matches,
		() => false,
	);
}

export function useDocumentHidden() {
	return useSyncExternalStore(
		(cb) => {
			document.addEventListener('visibilitychange', cb);
			return () => document.removeEventListener('visibilitychange', cb);
		},
		() => document.hidden,
		() => false,
	);
}

/** True once the client has hydrated; false during SSR and hydration. */
export function useHydrated() {
	return useSyncExternalStore(
		noop,
		() => true,
		() => false,
	);
}

type Clock = { value: number; listeners: Set<() => void>; timer: number | null };
const clocks = new Map<number, Clock>();

function clock(ms: number) {
	let c = clocks.get(ms);
	if (!c) {
		c = { value: 0, listeners: new Set(), timer: null };
		clocks.set(ms, c);
	}
	return c;
}

/** Wall-clock time, refreshed every `ms`. 0 on the server so markup stays stable. */
export function useNow(ms = 1000) {
	return useSyncExternalStore(
		(cb) => {
			const c = clock(ms);
			c.listeners.add(cb);
			if (c.timer === null)
				c.timer = window.setInterval(() => {
					c.value = Date.now();
					for (const l of c.listeners) l();
				}, ms);
			return () => {
				c.listeners.delete(cb);
				if (!c.listeners.size && c.timer !== null) {
					window.clearInterval(c.timer);
					c.timer = null;
				}
			};
		},
		() => {
			const c = clock(ms);
			if (!c.value) c.value = Date.now();
			return c.value;
		},
		() => 0,
	);
}

/** A sessionStorage flag; null until hydrated. */
export function useSessionFlag(key: string) {
	return useSyncExternalStore(
		noop,
		() => {
			try {
				return window.sessionStorage.getItem(key) === '1';
			} catch {
				return true;
			}
		},
		() => null,
	);
}

export function setSessionFlag(key: string) {
	try {
		window.sessionStorage.setItem(key, '1');
	} catch {
		/* Private mode: the intro simply plays again. */
	}
}

/** Raw query string, for preview overrides like ?time=night&biome=winter. */
export function useSearch() {
	return useSyncExternalStore(
		noop,
		() => window.location.search,
		() => '',
	);
}

export function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
	);
}
