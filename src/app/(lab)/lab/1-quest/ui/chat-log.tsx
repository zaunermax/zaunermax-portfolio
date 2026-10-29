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
};

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

function Line({ entry }: { entry: LogEntry }) {
	switch (entry.kind) {
		case 'forge':
			return (
				<>
					<span className={styles.speaker}>[World Forge]</span> {entry.text}
				</>
			);
		case 'npc':
			return (
				<>
					<span className={styles.speaker}>[{entry.speaker}]</span> says: {entry.text}
				</>
			);
		case 'whisper':
			return entry.direction === 'out' ? (
				<>
					To <span className={styles.speaker}>[{entry.speaker}]</span>: {entry.text}
				</>
			) : (
				<>
					<span className={styles.speaker}>[{entry.speaker}]</span> whispers: {entry.text}
				</>
			);
		case 'discovery':
			return <>Discovered: {entry.text}</>;
		default:
			return <>{entry.text}</>;
	}
}

export function ChatLogView({ log, compact }: { log: ChatLog; compact: boolean }) {
	const entries = useSyncExternalStore(log.subscribe, log.get, log.get);
	const body = useRef<HTMLDivElement>(null);
	const stick = useRef(true);
	const [open, setOpen] = useState(false);
	const [seen, setSeen] = useState(0);
	const unread = compact && !open ? Math.max(0, entries.length - seen) : 0;

	useEffect(() => {
		const el = body.current;
		if (el && stick.current) el.scrollTop = el.scrollHeight;
	}, [entries, open]);

	return (
		<section
			className={styles.chat}
			data-open={compact ? String(open) : 'true'}
			aria-label="Chat log"
		>
			<div className={styles.chatHead}>
				<span className={styles.chatTab} aria-hidden="true">
					General
				</span>
				<button
					type="button"
					className={styles.chatToggle}
					aria-expanded={open}
					onClick={() => {
						setOpen(!open);
						setSeen(entries.length);
					}}
				>
					{open ? 'Hide chat' : unread ? `Chat (${unread} new)` : 'Chat'}
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
							<Line entry={entry} />
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
