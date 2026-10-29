'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribeMedia(query: string) {
	return (onChange: () => void) => {
		const list = window.matchMedia(query);
		list.addEventListener('change', onChange);
		return () => list.removeEventListener('change', onChange);
	};
}

/** `null` until hydrated, so server and first client render agree. */
export function useMediaQuery(query: string): boolean | null {
	return useSyncExternalStore(
		subscribeMedia(query),
		() => window.matchMedia(query).matches,
		() => null,
	);
}

export function useReducedMotion() {
	return useMediaQuery('(prefers-reduced-motion: reduce)') ?? false;
}

const clockFormat = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Europe/Vienna',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit',
});

function subscribeMinute(onChange: () => void) {
	const id = window.setInterval(onChange, 10_000);
	return () => window.clearInterval(id);
}

/** Vienna wall-clock time, e.g. "Tue 14:32". Empty on the server. */
export function useViennaClock() {
	return useSyncExternalStore(
		subscribeMinute,
		() => clockFormat.format(Date.now()).replace(',', ''),
		() => '',
	);
}

const segmenter =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter('en', { granularity: 'grapheme' })
		: null;

function graphemes(text: string) {
	return segmenter
		? Array.from(segmenter.segment(text), (s) => s.segment)
		: Array.from(text);
}

/**
 * Types the lines one after another, keeping the finished ones,
 * like someone writing a text file. Instant when motion is reduced.
 */
export function useTypedLines(
	lines: string[],
	{ instant, paused = false }: { instant: boolean; paused?: boolean },
) {
	const [state, setState] = useState({ line: 0, chars: 0 });

	useEffect(() => {
		if (instant || paused || state.line >= lines.length) return;
		const current = graphemes(lines[state.line]);
		const doneWithLine = state.chars >= current.length;
		const delay = doneWithLine ? 900 : 38 + Math.random() * 50;
		const id = window.setTimeout(() => {
			setState((s) =>
				doneWithLine
					? { line: s.line + 1, chars: 0 }
					: { line: s.line, chars: s.chars + 1 },
			);
		}, delay);
		return () => window.clearTimeout(id);
	}, [instant, paused, lines, state]);

	if (instant) return { done: lines, typing: null as string | null };
	const done = lines.slice(0, state.line);
	const typing =
		state.line < lines.length
			? graphemes(lines[state.line]).slice(0, state.chars).join('')
			: null;
	return { done, typing };
}
