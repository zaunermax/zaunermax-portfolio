'use client';

import { legacyUrl } from '@/lab-shared/legacy-url';

import { Tabs } from '@base-ui/react/tabs';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import portrait from '@/components/ui/own-avatar/assets/pp.jpg';
import type { business as businessValue, LabContent } from '@/lab-shared/content';
import {
	CHAT_LIMITS,
	contactSubmission,
	type ChatLine,
	type ContactDraft,
} from '../chat/contract';
import { sendQuest, type UseMaxChat } from '../chat/use-max-chat';
import styles from './hud.module.css';
import { Ability, GossipBubble, QuestMark, Sparkle, WaxSeal } from './icons';
import { AppWindow, cx } from './window';

export type Business = typeof businessValue;

function MaxPortrait({ className, size }: { className: string; size: number }) {
	return (
		<span className={className}>
			<img src={portrait} alt="" width={size} height={size} sizes={`${size}px`} />
		</span>
	);
}

// ---------------------------------------------------------------------------
// Talking to Max: a messenger thread, plus a ticket draft when there is a project.

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
		<AppWindow
			open={open}
			onClose={onClose}
			side="left"
			width="580px"
			tone="coral"
			keepMounted
			initialFocus={inputRef}
			portrait={<MaxPortrait className={styles.gossipPortrait} size={64} />}
			title="Max Zauner"
			sub={
				<>
					<span className={styles.onlineDot} aria-hidden="true" />
					Online as an AI echo, in Vienna
				</>
			}
		>
			<div className={cx(styles.panelBody, styles.thread)}>
				<p className={styles.saidByMax}>
					Hi! I&rsquo;m Max&rsquo;s echo, a little AI that knows what Max builds, where he
					has spoken and how he works. Ask me anything, or tell me about a project and
					I&rsquo;ll turn it into a ticket for him.
				</p>
				<ol className={styles.transcript} aria-label="Conversation">
					{chat.lines.map((line) => (
						<li key={line.id}>
							<Said line={line} />
							{line.draft && !dismissed.includes(line.id) ? (
								<TicketForm
									draft={line.draft}
									onDismiss={() => setDismissed([...dismissed, line.id])}
								/>
							) : null}
						</li>
					))}
					{chat.streaming !== null ? (
						<li aria-hidden="true" className={styles.saidByMax}>
							{chat.streaming || 'Max is typing'}
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
						placeholder="Message Max"
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
		</AppWindow>
	);
}

function Said({ line }: { line: ChatLine }) {
	if (line.role === 'visitor')
		return (
			<p className={styles.saidByYou}>
				<span className={styles.srOnly}>You: </span>
				{line.text}
			</p>
		);
	return (
		<p className={styles.saidByMax}>
			<span className={styles.srOnly}>Max: </span>
			{line.text}
		</p>
	);
}

type TicketField =
	'title' | 'name' | 'email' | 'company' | 'summary' | 'timeline' | 'budget';

const FIELD_HELP: Record<TicketField, string> = {
	title: 'Give the ticket a title of 3 to 60 characters.',
	name: 'Tell Max your name.',
	email: 'Max needs a valid email address to reply to.',
	company: 'Keep it under 80 characters.',
	summary: 'Describe the project in 20 to 1500 characters.',
	timeline: 'Keep it under 80 characters.',
	budget: 'Keep it under 80 characters.',
};

/** The editable ticket. Nothing is sent until the visitor presses the button. */
export function TicketForm({
	draft,
	onDismiss,
}: {
	draft: ContactDraft | null;
	onDismiss: () => void;
}) {
	const id = useId();
	const [values, setValues] = useState<Record<TicketField, string>>(() => ({
		title: draft?.title ?? '',
		name: draft?.name ?? '',
		email: draft?.email ?? '',
		company: draft?.company ?? '',
		summary: draft?.summary ?? '',
		timeline: draft?.timeline ?? '',
		budget: draft?.budget ?? '',
	}));
	const [website, setWebsite] = useState('');
	const [errors, setErrors] = useState<Partial<Record<TicketField, string>>>({});
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
			const next: Partial<Record<TicketField, string>> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] as TicketField;
				if (key in FIELD_HELP) next[key] = FIELD_HELP[key];
			}
			setErrors(next);
			const first = (Object.keys(FIELD_HELP) as TicketField[]).find((k) => next[k]);
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
				Ticket sent. Max will reply by email.
			</div>
		);

	const field = (
		key: TicketField,
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
			className={styles.ticket}
			onSubmit={submit}
			noValidate
			aria-labelledby={`${id}-h`}
		>
			<h3 id={`${id}-h`} className={styles.ticketTitle}>
				<span className={styles.ticketTag} aria-hidden="true">
					New
				</span>
				A ticket for Max
			</h3>
			<p className={styles.ticketIntro}>
				{draft
					? 'Max’s echo wrote this down. Check it, change anything, then send it.'
					: 'Write it in your own words. Max reads every ticket himself.'}
			</p>
			<div className={styles.fields}>
				{field('title', 'Ticket title', { wide: true, required: true })}
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
				<p className={styles.error} role="alert">
					{status.message}
				</p>
			) : null}
			<div className={styles.buttonRow}>
				<button
					type="submit"
					className={styles.button}
					disabled={status.state === 'sending'}
				>
					{status.state === 'sending' ? 'Sending…' : 'Send ticket to Max'}
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
// The wiki: a little file browser, files on the left and the open page on the right.

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
						href={legacyUrl(href)}
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
		<AppWindow
			open={open}
			onClose={onClose}
			title={name}
			sub="Max’s wiki, kept like a git repo"
			icon="library"
			tone="teal"
			width="1040px"
		>
			<Tabs.Root
				value={current?.filename ?? ''}
				onValueChange={(v) => onFile(String(v))}
				orientation="vertical"
				className={styles.book}
			>
				<div className={cx(styles.page, styles.pageLeft)}>
					<h3 className={styles.pageLabel}>Files</h3>
					<Tabs.List className={styles.files} aria-label="Wiki files">
						{pages.map((page) => (
							<Tabs.Tab key={page.filename} value={page.filename} className={styles.file}>
								<span className={styles.fileName}>
									<span className={styles.fileGlyph} aria-hidden="true" />
									{page.filename}
								</span>
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
						<h3 className={styles.docTitle}>{page.filename}</h3>
						<p className={styles.docMeta}>
							Last commit <code>{page.commitMsg}</code>, {page.relativeTimeAgo}
						</p>
						<div className={styles.prose}>
							<PortableText value={page.content} components={components} />
						</div>
					</Tabs.Panel>
				))}
				{pages.length ? null : (
					<p className={styles.page}>The wiki is empty right now.</p>
				)}
			</Tabs.Root>
		</AppWindow>
	);
}

// ---------------------------------------------------------------------------
// The stage: every talk Max has given, newest first.

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
		<AppWindow
			open={open}
			onClose={onClose}
			title={name}
			sub={`${talks.length} talk${talks.length === 1 ? '' : 's'} given so far`}
			icon="stage"
			tone="lilac"
			width="720px"
		>
			<div className={styles.panelBody}>
				<p className={styles.lede}>
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
									<QuestMark />
								</span>
								<span>
									<a className={styles.questTitle} href={`https://zaunermax.at/talks/${talk.slug}`}>
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
				{talks.length ? null : <p>No talks listed yet.</p>}
			</div>
		</AppWindow>
	);
}

// ---------------------------------------------------------------------------
// The ticket board: hire Max.

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
	const mailto = `mailto:${business.email}?subject=${encodeURIComponent('A project for Max')}`;
	return (
		<AppWindow
			open={open}
			onClose={onClose}
			title={name}
			sub="Got a project? File a ticket."
			icon="quest"
			tone="mustard"
			width="740px"
		>
			<div className={styles.board}>
				{writing ? (
					<TicketForm draft={null} onDismiss={() => setWriting(false)} />
				) : (
					<>
						<article className={styles.notice}>
							<span className={styles.pin} aria-hidden="true" />
							<h3 className={styles.noticeTitle}>Wanted: your next product, built well</h3>
							<p className={styles.noticeTagline}>{business.tagline}.</p>
							<p>{business.pitch}</p>
							<h4 className={styles.heading}>What Max builds</h4>
							<ul className={styles.services}>
								{business.services.map((s) => (
									<li key={s}>
										<Sparkle />
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
									Write the ticket yourself
								</button>
							</div>
						</article>
						<article className={cx(styles.notice, styles.noticeSmall)}>
							<span className={styles.pin} aria-hidden="true" />
							<p>
								Prefer plain email? Write to{' '}
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
		</AppWindow>
	);
}

// ---------------------------------------------------------------------------
// The main server rack: redeploying the office.

function ago(ms: number) {
	const min = Math.round(ms / 60000);
	if (min < 1) return 'moments ago';
	if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
	const h = Math.round(min / 60);
	if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
	return `${Math.round(h / 24)} days ago`;
}

const HOUR = 60 * 60 * 1000;

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
	const cooling = !canGenerate && !generating && remaining > 0;
	const created = createdAt;
	return (
		<AppWindow
			open={open}
			onClose={onClose}
			title="Redeploy the office"
			sub="The main server rack"
			icon="forge"
			tone="navy"
			width="640px"
		>
			<div className={styles.panelBody}>
				<div className={styles.forgeIntro}>
					<span className={styles.forgeArt} aria-hidden="true">
						<Ability name="forge" />
					</span>
					<div>
						<p className={styles.lede}>
							Once an hour, anyone can redeploy the office. An AI dreams up a new company,
							its rooms, its people and their small dramas; the office then builds itself,
							live.
						</p>
						<p className={styles.lede}>
							Everyone who visits sees the same office until the next redeploy.
						</p>
					</div>
				</div>
				<dl className={styles.forgeStat}>
					<dt>This office</dt>
					<dd>{worldName}</dd>
					{tagline ? (
						<>
							<dt>Motto</dt>
							<dd>{tagline}</dd>
						</>
					) : null}
					<dt>Deployed</dt>
					<dd>
						{source === 'default' || !created
							? 'By hand, as the starter office'
							: now
								? ago(now - created)
								: '…'}
					</dd>
					<dt>Next redeploy</dt>
					<dd>
						{generating
							? 'A redeploy is running right now'
							: remaining > 0
								? untilLabel(remaining)
								: 'Ready now'}
						{cooling ? (
							<span className={styles.cooling} aria-hidden="true">
								<span style={{ width: `${(1 - Math.min(1, remaining / HOUR)) * 100}%` }} />
							</span>
						) : null}
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
						{generating ? 'Deploying…' : 'Redeploy the office'}
					</button>
					{cooling ? (
						<span className={styles.buttonNote}>The rack is still cooling down.</span>
					) : null}
				</div>
			</div>
		</AppWindow>
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
		<AppWindow
			open={open}
			onClose={onClose}
			title="Max Zauner"
			sub={`Employee file, level ${level}`}
			icon="talk"
			tone="coral"
			width="720px"
		>
			<div className={styles.panelBody}>
				<div className={styles.sheet}>
					<div className={styles.idCard} aria-hidden="true">
						<span className={styles.idClip} />
						<span className={styles.idBand}>Hello, I&rsquo;m Max</span>
						<MaxPortrait className={styles.sheetPortrait} size={150} />
						<span className={styles.idName}>Max Zauner</span>
						<span className={styles.idBarcode} />
					</div>
					<div>
						<p className={styles.lede}>{business.pitch}</p>
						<dl className={styles.stats}>
							<dt>Role</dt>
							<dd>Independent software engineer</dd>
							<dt>Based in</dt>
							<dd>Vienna, Austria</dd>
							<dt>Team</dt>
							<dd>A one-person business</dd>
							<dt>Email</dt>
							<dd>
								<a href={`mailto:${business.email}`}>{business.email}</a>
							</dd>
						</dl>
						<h3 className={styles.heading}>Specializations</h3>
						<ul className={styles.services}>
							{business.services.map((s) => (
								<li key={s}>
									<Sparkle />
									{s}
								</li>
							))}
						</ul>
						<div className={styles.buttonRow}>
							<button type="button" className={styles.button} onClick={onHire}>
								File a ticket for Max
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
		</AppWindow>
	);
}

const KEYS: [string[], string][] = [
	[['W', 'A', 'S', 'D'], 'Walk (arrow keys work too)'],
	[['F'], 'Talk, read or use what is in front of you'],
	[['G'], 'Wave to other visitors'],
	[['Click'], 'Walk to a spot, a person or a place'],
	[['Q', 'E'], 'Turn the view by a quarter'],
	[['Wheel'], 'Zoom in and out (pinch on touch screens)'],
	[['1', '–', '6'], 'Open an app from the dock'],
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
		<AppWindow
			open={open}
			onClose={onClose}
			title="Controls"
			sub="Everything also works from the dock"
			icon="controls"
			tone="sage"
			width="600px"
		>
			<div className={styles.panelBody}>
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
				<p className={styles.touchNote}>
					On a phone: tap the floor to walk there or hold a finger down to keep walking
					towards it, tap a person or place to visit it and pinch to zoom.
				</p>
			</div>
		</AppWindow>
	);
}
