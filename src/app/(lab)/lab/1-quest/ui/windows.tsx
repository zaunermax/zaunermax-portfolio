'use client';

import { Tabs } from '@base-ui/react/tabs';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import portrait from '@/components/ui/own-avatar/assets/pp.jpg';
import type { business as businessValue, LabContent } from '../../_shared/content';
import {
	CHAT_LIMITS,
	contactSubmission,
	type ChatLine,
	type ContactDraft,
} from '../chat/contract';
import { sendQuest, type UseMaxChat } from '../chat/use-max-chat';
import styles from './hud.module.css';
import { Ability, Diamond, GossipBubble, QuestMark, WaxSeal } from './icons';
import { cx, WowWindow } from './window';

export type Business = typeof businessValue;

function MaxPortrait({ className, size }: { className: string; size: number }) {
	return (
		<span className={className}>
			<Image src={portrait} alt="" width={size} height={size} sizes={`${size}px`} />
		</span>
	);
}

// ---------------------------------------------------------------------------
// Talking to Max: a real conversation, plus a quest scroll when there is a project.

export function GossipWindow({
	open,
	onClose,
	chat,
	onDisclaimer,
}: {
	open: boolean;
	onClose: () => void;
	chat: UseMaxChat;
	onDisclaimer: () => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const [text, setText] = useState('');
	const [dismissed, setDismissed] = useState<string[]>([]);
	const inputId = useId();

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: 'nearest' });
	}, [chat.lines.length, chat.streaming]);

	function say(value: string) {
		const v = value.trim().slice(0, CHAT_LIMITS.messageChars);
		if (!v || chat.isBusy) return;
		chat.send(v);
		setText('');
		inputRef.current?.focus();
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		say(text);
	}

	return (
		<WowWindow
			open={open}
			onClose={onClose}
			side="left"
			width="580px"
			keepMounted
			initialFocus={inputRef}
			portrait={<MaxPortrait className={styles.gossipPortrait} size={64} />}
			title={<span className={styles.gossipName}>Max Zauner</span>}
			sub="Independent software engineer · Vienna"
		>
			<div className={styles.parchment}>
				<p style={{ margin: '0 0 14px' }}>
					Well met, traveller! I&rsquo;m Max&rsquo;s echo, a little AI that knows what Max
					builds, where he has spoken and how he works. Ask me anything, or tell me about
					a project you have in mind and I&rsquo;ll write it up as a quest for him.
				</p>
				<ol className={styles.transcript} aria-label="Conversation">
					{chat.lines.map((line) => (
						<li key={line.id}>
							<Said line={line} />
							{line.draft && !dismissed.includes(line.id) ? (
								<QuestScroll
									draft={line.draft}
									onDismiss={() => setDismissed([...dismissed, line.id])}
								/>
							) : null}
						</li>
					))}
					{chat.streaming !== null ? (
						<li aria-hidden="true" className={styles.saidByMax}>
							{chat.streaming || 'Max thinks for a moment'}
							<span className={styles.caret} />
						</li>
					) : null}
				</ol>
				{chat.error ? (
					<p className={styles.error} role="alert">
						{chat.error}
					</p>
				) : null}
				{chat.suggestions.length ? (
					<>
						<hr className={styles.rule} />
						<ul className={styles.options} aria-label="Things to say">
							{chat.suggestions.map((s) => (
								<li key={s}>
									<button
										type="button"
										className={styles.option}
										disabled={chat.isBusy}
										onClick={() => say(s)}
									>
										<GossipBubble />
										{s}
									</button>
								</li>
							))}
						</ul>
					</>
				) : null}
				<div ref={endRef} />
			</div>
			<form className={styles.say} onSubmit={onSubmit}>
				<label htmlFor={inputId} className={styles.sayLabel}>
					Say something to Max
				</label>
				<div className={styles.sayRow}>
					<input
						id={inputId}
						ref={inputRef}
						className={styles.input}
						value={text}
						onChange={(e) => setText(e.target.value)}
						maxLength={CHAT_LIMITS.messageChars}
						placeholder="What are you working on right now?"
						autoComplete="off"
					/>
					{chat.isBusy ? (
						<button
							type="button"
							className={cx(styles.button, styles.buttonQuiet)}
							onClick={chat.stop}
						>
							Stop
						</button>
					) : (
						<button type="submit" className={styles.button}>
							Send
						</button>
					)}
				</div>
				<p className={styles.note}>
					Max&rsquo;s echo is an AI and can be wrong.{' '}
					<button type="button" className={styles.inkLink} onClick={onDisclaimer}>
						Read the disclaimer
					</button>
				</p>
			</form>
		</WowWindow>
	);
}

function Said({ line }: { line: ChatLine }) {
	if (line.role === 'visitor')
		return (
			<p className={styles.saidByYou} style={{ margin: 0 }}>
				<b>You:</b> {line.text}
			</p>
		);
	return (
		<p className={styles.saidByMax} style={{ margin: 0 }}>
			{line.text}
		</p>
	);
}

type ScrollField =
	'title' | 'name' | 'email' | 'company' | 'summary' | 'timeline' | 'budget';

const FIELD_HELP: Record<ScrollField, string> = {
	title: 'Give the quest a title of 3 to 60 characters.',
	name: 'Tell Max your name.',
	email: 'Max needs a valid email address to reply to.',
	company: 'Keep it under 80 characters.',
	summary: 'Describe the project in 20 to 1500 characters.',
	timeline: 'Keep it under 80 characters.',
	budget: 'Keep it under 80 characters.',
};

/** The editable quest scroll. Nothing is sent until the visitor presses the button. */
export function QuestScroll({
	draft,
	onDismiss,
}: {
	draft: ContactDraft | null;
	onDismiss: () => void;
}) {
	const id = useId();
	const [values, setValues] = useState<Record<ScrollField, string>>(() => ({
		title: draft?.title ?? '',
		name: draft?.name ?? '',
		email: draft?.email ?? '',
		company: draft?.company ?? '',
		summary: draft?.summary ?? '',
		timeline: draft?.timeline ?? '',
		budget: draft?.budget ?? '',
	}));
	const [website, setWebsite] = useState('');
	const [errors, setErrors] = useState<Partial<Record<ScrollField, string>>>({});
	const [status, setStatus] = useState<{
		state: 'idle' | 'sending' | 'sent' | 'error';
		message?: string;
	}>({
		state: 'idle',
	});
	const openedAt = useRef(0);
	useEffect(() => {
		openedAt.current = performance.now();
	}, []);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (status.state === 'sending') return;
		const parsed = contactSubmission.safeParse({
			...values,
			website,
			elapsedMs: Math.max(0, Math.round(performance.now() - openedAt.current)),
		});
		if (!parsed.success) {
			const next: Partial<Record<ScrollField, string>> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] as ScrollField;
				if (key in FIELD_HELP) next[key] = FIELD_HELP[key];
			}
			setErrors(next);
			const first = (Object.keys(FIELD_HELP) as ScrollField[]).find((k) => next[k]);
			if (first) document.getElementById(`${id}-${first}`)?.focus();
			return;
		}
		setErrors({});
		setStatus({ state: 'sending' });
		const result = await sendQuest(parsed.data);
		setStatus(
			result.ok ? { state: 'sent' } : { state: 'error', message: result.message },
		);
	}

	if (status.state === 'sent')
		return (
			<div className={styles.seal} role="status">
				<WaxSeal />
				Quest sent. Max will reply by email.
			</div>
		);

	const field = (
		key: ScrollField,
		label: string,
		opts: { wide?: boolean; area?: boolean; type?: string; required?: boolean } = {},
	) => {
		const fid = `${id}-${key}`;
		const err = errors[key];
		const common = {
			id: fid,
			className: styles.fieldInput,
			value: values[key],
			onChange: (e: { target: { value: string } }) =>
				setValues({ ...values, [key]: e.target.value }),
			'aria-invalid': err ? true : undefined,
			'aria-describedby': err ? `${fid}-err` : undefined,
			required: opts.required,
		};
		return (
			<div className={cx(styles.field, opts.wide && styles.fieldWide)}>
				<label htmlFor={fid} className={styles.fieldLabel}>
					{label}
				</label>
				{opts.area ? (
					<textarea {...common} maxLength={1500} />
				) : (
					<input
						{...common}
						type={opts.type ?? 'text'}
						maxLength={key === 'title' ? 60 : 120}
					/>
				)}
				{err ? (
					<span id={`${fid}-err`} className={styles.fieldError}>
						{err}
					</span>
				) : null}
			</div>
		);
	};

	return (
		<form
			className={styles.scroll}
			onSubmit={submit}
			noValidate
			aria-labelledby={`${id}-h`}
		>
			<h3 id={`${id}-h`} className={styles.scrollTitle}>
				A quest for Max
			</h3>
			<p className={styles.scrollIntro}>
				{draft
					? 'Max’s echo wrote this down. Check it, change anything, then send it.'
					: 'Write it in your own words. Max reads every scroll himself.'}
			</p>
			<div className={styles.fields}>
				{field('title', 'Quest title', { wide: true, required: true })}
				{field('name', 'Your name', { required: true })}
				{field('email', 'Your email', { type: 'email', required: true })}
				{field('company', 'Company (optional)')}
				{field('timeline', 'Timeline (optional)')}
				{field('summary', 'What should be built?', {
					wide: true,
					area: true,
					required: true,
				})}
				{field('budget', 'Budget (optional)')}
			</div>
			<div className={styles.honeypot} aria-hidden="true">
				<label htmlFor={`${id}-website`}>Website</label>
				<input
					id={`${id}-website`}
					tabIndex={-1}
					autoComplete="off"
					value={website}
					onChange={(e) => setWebsite(e.target.value)}
				/>
			</div>
			{status.state === 'error' ? (
				<p className={styles.error} role="alert" style={{ marginTop: 12 }}>
					{status.message}
				</p>
			) : null}
			<div className={styles.buttonRow} style={{ marginTop: 16 }}>
				<button
					type="submit"
					className={styles.button}
					disabled={status.state === 'sending'}
				>
					{status.state === 'sending' ? 'Sending…' : 'Send quest to Max'}
				</button>
				<button
					type="button"
					className={cx(styles.button, styles.buttonQuiet)}
					onClick={onDismiss}
				>
					Not now
				</button>
			</div>
		</form>
	);
}

// ---------------------------------------------------------------------------
// The library: a book with the file list on the left page and the file on the right.

export function LibraryWindow({
	open,
	onClose,
	pages,
	file,
	onFile,
	name,
}: {
	open: boolean;
	onClose: () => void;
	pages: LabContent['wiki'];
	file: string;
	onFile: (file: string) => void;
	name: string;
}) {
	const components: PortableTextComponents = {
		block: {
			h1: ({ children }) => <h3>{children}</h3>,
			h2: ({ children }) => <h3>{children}</h3>,
			h3: ({ children }) => <h4>{children}</h4>,
			normal: ({ children }) => <p>{children}</p>,
		},
		marks: {
			link: ({ children, value }) => {
				const href = String(value?.href ?? '');
				const inner = href.match(/^\/wiki\/(.+)$/)?.[1];
				if (inner && pages.some((p) => p.filename === inner))
					return (
						<button
							type="button"
							className={styles.inkLink}
							onClick={() => onFile(inner)}
						>
							{children}
						</button>
					);
				return (
					<a
						href={href}
						target={href.startsWith('http') ? '_blank' : undefined}
						rel="noreferrer"
					>
						{children}
					</a>
				);
			},
		},
	};
	const current = pages.find((p) => p.filename === file) ?? pages[0];
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title={name}
			sub="Max’s wiki, kept like a git repo"
			width="1040px"
		>
			<Tabs.Root
				value={current?.filename ?? ''}
				onValueChange={(v) => onFile(String(v))}
				orientation="vertical"
				className={styles.book}
			>
				<div className={cx(styles.page, styles.pageLeft)}>
					<h3 className={styles.heading} style={{ fontSize: 19 }}>
						Contents
					</h3>
					<Tabs.List className={styles.files} aria-label="Wiki files">
						{pages.map((page) => (
							<Tabs.Tab key={page.filename} value={page.filename} className={styles.file}>
								<span className={styles.fileName}>{page.filename}</span>
								<span className={styles.fileMeta}>
									<code>{page.commitMsg}</code>
								</span>
								<span className={styles.fileMeta}>{page.relativeTimeAgo}</span>
							</Tabs.Tab>
						))}
					</Tabs.List>
				</div>
				{pages.map((page) => (
					<Tabs.Panel
						key={page.filename}
						value={page.filename}
						className={cx(styles.page, styles.pageRight)}
					>
						<h3 className={styles.heading} style={{ fontSize: 26 }}>
							{page.filename}
						</h3>
						<p className={styles.fileMeta} style={{ margin: '0 0 16px' }}>
							Last commit: <code>{page.commitMsg}</code>, {page.relativeTimeAgo}
						</p>
						<div className={styles.prose}>
							<PortableText value={page.content} components={components} />
						</div>
					</Tabs.Panel>
				))}
				{pages.length ? null : (
					<p className={styles.page}>The shelves are empty right now.</p>
				)}
			</Tabs.Root>
		</WowWindow>
	);
}

// ---------------------------------------------------------------------------
// The stage: talks as a quest log.

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

function formatDate(date: string) {
	const [d, m, y] = date.split('.').map(Number);
	if (!d || !m || !y) return { label: date, iso: undefined };
	return {
		label: `${d} ${MONTHS[m - 1]} ${y}`,
		iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
	};
}

export function StageWindow({
	open,
	onClose,
	talks,
	events,
	name,
}: {
	open: boolean;
	onClose: () => void;
	talks: LabContent['talks'];
	events: LabContent['events'];
	name: string;
}) {
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title={name}
			sub={`Talks given · ${talks.length}`}
			width="720px"
		>
			<div className={styles.parchment}>
				<p style={{ marginTop: 0 }}>
					Max speaks at Vienna meetups
					{events.length ? (
						<>
							{' '}
							like{' '}
							{events.map((e, i) => (
								<span key={e.url}>
									<a href={e.url} target="_blank" rel="noreferrer">
										{e.name}
									</a>
									{i < events.length - 2 ? ', ' : i === events.length - 2 ? ' and ' : ''}
								</span>
							))}
						</>
					) : null}
					. Open a talk for the slides and the recording.
				</p>
				<ol className={styles.questLog}>
					{talks.map((talk) => {
						const date = formatDate(talk.date);
						return (
							<li key={talk.slug} className={styles.questItem}>
								<span className={styles.questMark}>
									<QuestMark done />
								</span>
								<span>
									<a className={styles.questTitle} href={`/talks/${talk.slug}`}>
										{talk.talk}
									</a>
									<span className={styles.questMeta}>{talk.event}</span>
								</span>
								<time className={styles.questDate} dateTime={date.iso}>
									{date.label}
								</time>
							</li>
						);
					})}
				</ol>
				{talks.length ? null : <p>No talks on the board yet.</p>}
			</div>
		</WowWindow>
	);
}

// ---------------------------------------------------------------------------
// The quest board: hire Max.

export function QuestBoardWindow({
	open,
	onClose,
	business,
	name,
	onTellMax,
}: {
	open: boolean;
	onClose: () => void;
	business: Business;
	name: string;
	onTellMax: () => void;
}) {
	const [writing, setWriting] = useState(false);
	const mailto = `mailto:${business.email}?subject=${encodeURIComponent('A quest for Max')}`;
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title={name}
			sub="Got a project? Max takes quests."
			width="720px"
		>
			<div className={styles.board}>
				{writing ? (
					<div className={styles.notice} style={{ transform: 'none' }}>
						<QuestScroll draft={null} onDismiss={() => setWriting(false)} />
					</div>
				) : (
					<>
						<article className={styles.notice}>
							<span className={styles.pin} aria-hidden="true" />
							<h3 className={styles.heading} style={{ fontSize: 25, marginTop: 6 }}>
								Wanted: your next product, built well
							</h3>
							<p style={{ margin: '0 0 6px', fontWeight: 700 }}>{business.tagline}.</p>
							<p style={{ margin: '0 0 14px' }}>{business.pitch}</p>
							<h4 className={styles.heading} style={{ fontSize: 19 }}>
								Quests Max takes on
							</h4>
							<ul className={styles.services}>
								{business.services.map((s) => (
									<li key={s}>
										<Diamond />
										{s}
									</li>
								))}
							</ul>
							<div className={styles.buttonRow}>
								<button type="button" className={styles.button} onClick={onTellMax}>
									Tell Max about your project
								</button>
								<button
									type="button"
									className={cx(styles.button, styles.buttonQuiet)}
									onClick={() => setWriting(true)}
								>
									Write a quest scroll yourself
								</button>
							</div>
						</article>
						<article className={styles.notice}>
							<span className={styles.pin} aria-hidden="true" />
							<p style={{ margin: '6px 0 0' }}>
								Prefer a plain letter? Send a raven to{' '}
								<a href={mailto}>{business.email}</a>. Or find Max on{' '}
								<a href={business.links.github} target="_blank" rel="noreferrer">
									GitHub
								</a>{' '}
								and{' '}
								<a href={business.links.linkedin} target="_blank" rel="noreferrer">
									LinkedIn
								</a>
								.
							</p>
						</article>
					</>
				)}
			</div>
		</WowWindow>
	);
}

// ---------------------------------------------------------------------------
// The world forge.

function ago(ms: number) {
	const min = Math.round(ms / 60000);
	if (min < 1) return 'moments ago';
	if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
	const h = Math.round(min / 60);
	if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
	return `${Math.round(h / 24)} days ago`;
}

export function untilLabel(ms: number) {
	const min = Math.ceil(ms / 60000);
	if (min <= 1) return 'in a minute';
	return `in ${min} minutes`;
}

export function ForgeWindow({
	open,
	onClose,
	worldName,
	tagline,
	createdAt,
	source,
	nextAt,
	canGenerate,
	generating,
	error,
	now,
	onForge,
}: {
	open: boolean;
	onClose: () => void;
	worldName: string;
	tagline: string;
	createdAt: number;
	source: 'default' | 'generated';
	nextAt: Date | null;
	canGenerate: boolean;
	generating: boolean;
	error: string | null;
	now: number;
	onForge: () => void;
}) {
	const remaining = nextAt && now ? nextAt.getTime() - now : 0;
	const created = createdAt;
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title="The World Forge"
			sub="A rune-carved waystone"
			width="640px"
		>
			<div className={styles.parchment}>
				<span className={styles.forgeArt} aria-hidden="true">
					<Ability name="forge" />
				</span>
				<p style={{ marginTop: 0 }}>
					Once an hour, anyone can forge a new world. An AI places every building, tree
					and villager from the same set of blocks, live.
				</p>
				<p>Everyone who visits sees the same world until the next one is forged.</p>
				<dl className={styles.forgeStat}>
					<dt>This world</dt>
					<dd>{worldName}</dd>
					{tagline ? (
						<>
							<dt>Lore</dt>
							<dd>{tagline}</dd>
						</>
					) : null}
					<dt>Forged</dt>
					<dd>
						{source === 'default' || !created
							? 'By hand, as the starter world'
							: now
								? ago(now - created)
								: '…'}
					</dd>
					<dt>Next forge</dt>
					<dd>
						{generating
							? 'A world is being forged right now'
							: remaining > 0
								? untilLabel(remaining)
								: 'Ready now'}
					</dd>
				</dl>
				{error ? (
					<p className={styles.error} role="alert">
						{error}
					</p>
				) : null}
				<div className={styles.buttonRow}>
					<button
						type="button"
						className={styles.button}
						disabled={!canGenerate}
						onClick={onForge}
					>
						{generating ? 'Forging…' : 'Forge a new world'}
					</button>
					{!canGenerate && !generating && remaining > 0 ? (
						<span style={{ fontFamily: 'var(--q-ui)', fontSize: 16 }}>
							The waystone is still cooling down.
						</span>
					) : null}
				</div>
			</div>
		</WowWindow>
	);
}

// ---------------------------------------------------------------------------
// Character sheet and controls.

export function CharacterWindow({
	open,
	onClose,
	business,
	level,
	onHire,
}: {
	open: boolean;
	onClose: () => void;
	business: Business;
	level: number;
	onHire: () => void;
}) {
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title={<span className={styles.gossipName}>Max Zauner</span>}
			sub={`Level ${level} Independent Software Engineer`}
			width="720px"
		>
			<div className={styles.parchment}>
				<div className={styles.sheet}>
					<MaxPortrait className={styles.sheetPortrait} size={150} />
					<div>
						<p style={{ marginTop: 0 }}>{business.pitch}</p>
						<dl className={styles.stats}>
							<dt>Class</dt>
							<dd>Independent software engineer</dd>
							<dt>Home</dt>
							<dd>Vienna, Austria</dd>
							<dt>Guild</dt>
							<dd>A one-person business</dd>
							<dt>Raven</dt>
							<dd>
								<a href={`mailto:${business.email}`}>{business.email}</a>
							</dd>
						</dl>
						<h3 className={styles.heading} style={{ marginTop: 18, fontSize: 20 }}>
							Specializations
						</h3>
						<ul className={styles.services}>
							{business.services.map((s) => (
								<li key={s}>
									<Diamond />
									{s}
								</li>
							))}
						</ul>
						<div className={styles.buttonRow}>
							<button type="button" className={styles.button} onClick={onHire}>
								Post a quest for Max
							</button>
							<a
								className={cx(styles.button, styles.buttonQuiet)}
								href={business.links.github}
								target="_blank"
								rel="noreferrer"
							>
								GitHub
							</a>
							<a
								className={cx(styles.button, styles.buttonQuiet)}
								href={business.links.linkedin}
								target="_blank"
								rel="noreferrer"
							>
								LinkedIn
							</a>
						</div>
					</div>
				</div>
			</div>
		</WowWindow>
	);
}

const KEYS: [string[], string][] = [
	[['W', 'A', 'S', 'D'], 'Walk (arrow keys work too)'],
	[['Space'], 'Jump'],
	[['F'], 'Talk, read or use what is in front of you'],
	[['Click'], 'Walk to a spot, a person or a place'],
	[['Drag'], 'Turn the camera'],
	[['Wheel'], 'Zoom in and out (pinch on touch screens)'],
	[['1', '–', '6'], 'Use the action bar'],
	[['Esc'], 'Close a window'],
];

export function ControlsWindow({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	return (
		<WowWindow
			open={open}
			onClose={onClose}
			title="Controls"
			sub="Everything also works from the action bar"
			width="600px"
		>
			<div className={styles.parchment}>
				<dl className={styles.keys}>
					{KEYS.map(([keys, what]) => (
						<div key={what} style={{ display: 'contents' }}>
							<dt>
								{keys.map((k) =>
									k === '–' ? (
										<span key={k}>–</span>
									) : (
										<kbd key={k} className={styles.key}>
											{k}
										</kbd>
									),
								)}
							</dt>
							<dd>{what}</dd>
						</div>
					))}
				</dl>
				<hr className={styles.rule} />
				<p style={{ margin: 0 }}>
					On a phone: tap the ground to walk, tap a person or place to visit it, drag to
					look around and pinch to zoom.
				</p>
			</div>
		</WowWindow>
	);
}
