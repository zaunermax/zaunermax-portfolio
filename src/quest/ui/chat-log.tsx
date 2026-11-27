'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import styles from './hud.module.css';

export type LogEntry = {
	id: string;
	kind: 'system' | 'forge' | 'npc' | 'whisper' | 'discovery' | 'error';
	text: string;
	speaker?: string;
	/** Whispers: from Max (in) or to Max (out). */
	direction?: 'in' | 'out';
	/** Overheard in passing (what people say about Max as the visitor walks by). */
	ambient?: boolean;
};

/**
 * What counts as new on the phone's chat button: what people said about Max and Max's own
 * replies, not the build replay, the welcome or "Found …".
 */
export const countsAsNew = (e: LogEntry) => e.kind === 'npc' || (e.kind === 'whisper' && e.direction === 'in');

/** The chat log as a tiny external store: anything may push, the view subscribes. */
export class ChatLog {
	private entries: LogEntry[] = [];
	private ids = new Set<string>();
	private listeners = new Set<() => void>();

	push(entry: LogEntry) {
		if (this.ids.has(entry.id)) return;
		this.ids.add(entry.id);
		this.entries = [...this.entries, entry].slice(-160);
		for (const l of this.listeners) l();
	}

	get = () => this.entries;

	subscribe = (l: () => void) => {
		this.listeners.add(l);
		return () => {
			this.listeners.delete(l);
		};
	};
}

/** Who a line is from: a small coloured name chip, like a messenger. */
function From({ entry }: { entry: LogEntry }) {
	const name =
		entry.kind === 'forge'
			? 'Deploy'
			: entry.kind === 'npc'
				? entry.speaker
				: entry.kind === 'whisper'
					? entry.direction === 'out'
						? `To ${entry.speaker}`
						: entry.speaker
					: entry.kind === 'discovery'
						? 'Found'
						: entry.kind === 'error'
							? 'Error'
							: 'Office';
	return (
		<span className={styles.speaker} data-kind={entry.kind} data-direction={entry.direction}>
			{name}
		</span>
	);
}

/**
 * #general: on desktop a short strip with the latest few lines fading out at the top, which
 * grows into a scrollable log on demand; on phones a button that opens the log.
 */
export function ChatLogView({
	log,
	compact,
	hidden = false,
	open: shown,
	onOpen,
}: {
	log: ChatLog;
	compact: boolean;
	/** Out of the way while the Talk window shows the same conversation. */
	hidden?: boolean;
	/** Phones: open or not, when the app decides (one panel at a time). */
	open?: boolean;
	onOpen?: (open: boolean) => void;
}) {
	const entries = useSyncExternalStore(log.subscribe, log.get, log.get);
	const body = useRef<HTMLDivElement>(null);
	const stick = useRef(true);
	const [ownOpen, setOwnOpen] = useState(false);
	const open = shown ?? ownOpen;
	const setOpen = (next: boolean) => {
		setOwnOpen(next);
		onOpen?.(next);
	};
	const [expanded, setExpanded] = useState(false);
	/** More lines than the strip shows: only then do the oldest fade out at the top. */
	const [overflow, setOverflow] = useState(false);
	/** The newest entry when the chat was last opened or closed; older ones may be dropped. */
	const [seen, setSeen] = useState<string | null>(null);
	const unread =
		compact && !open
			? entries.slice(entries.findIndex((e) => e.id === seen) + 1).filter(countsAsNew).length
			: 0;

	useEffect(() => {
		const el = body.current;
		if (!el) return;
		if (stick.current || !expanded) el.scrollTop = el.scrollHeight;
		// A lone welcome that runs long is not "older lines": no fade over its first words.
		setOverflow(entries.length > 1 && el.scrollHeight > el.clientHeight + 2);
	}, [entries, open, expanded]);

	return (
		<section
			className={styles.chat}
			hidden={hidden}
			data-open={compact ? String(open) : 'true'}
			data-expanded={expanded}
			data-overflow={overflow}
			data-hud=""
			aria-label="Chat log"
		>
			<div className={styles.chatHead}>
				<span className={styles.chatTab} aria-hidden="true">
					<span className={styles.chatHash}>#</span>general
				</span>
				<button
					type="button"
					className={styles.chatToggle}
					aria-expanded={open}
					onClick={() => {
						setOpen(!open);
						setSeen(entries.at(-1)?.id ?? null);
					}}
				>
					{open ? 'Hide chat' : unread ? `Chat (${unread} new)` : 'Chat'}
				</button>
				<button
					type="button"
					className={styles.chatMore}
					aria-expanded={expanded}
					onClick={() => {
						stick.current = true;
						setExpanded(!expanded);
					}}
				>
					{expanded ? 'Less' : 'More'}
				</button>
			</div>
			<div
				ref={body}
				className={styles.chatBody}
				tabIndex={0}
				onScroll={(e) => {
					const el = e.currentTarget;
					stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
			>
				<ol
					className={styles.chatList}
					role="log"
					aria-live="polite"
					aria-relevant="additions"
				>
					{entries.map((entry) => (
						<li key={entry.id} className={styles.chatLine} data-kind={entry.kind}>
							<From entry={entry} /> <span className={styles.chatText}>{entry.text}</span>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
