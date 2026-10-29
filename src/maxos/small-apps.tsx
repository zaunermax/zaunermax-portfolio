'use client';

import { useId, useState, type FormEvent } from 'react';
import portrait from '@/components/ui/own-avatar/assets/pp.jpg';
import type { business as Business } from '@/lab-shared/content';
import { useTypedLines } from './hooks';
import styles from './os.module.css';

export type BusinessInfo = typeof Business;

/** The cream note that writes the fun facts down one line at a time. */
export function FactsNote({
	facts,
	instant,
	paused,
}: {
	facts: string[];
	instant: boolean;
	paused: boolean;
}) {
	const { done, typing } = useTypedLines(facts, { instant, paused });
	return (
		<div className={styles.note}>
			<ul className={styles.srOnly}>
				{facts.map((fact) => (
					<li key={fact}>{fact}</li>
				))}
			</ul>
			<div aria-hidden className={styles.noteLines}>
				{done.map((fact) => (
					<p key={fact}>{fact}</p>
				))}
				{typing !== null && (
					<p>
						{typing}
						<span className={styles.noteCaret} />
					</p>
				)}
			</div>
		</div>
	);
}

export function MailApp({ business }: { business: BusinessInfo }) {
	const [subject, setSubject] = useState('Project idea');
	const [body, setBody] = useState('');
	const [sent, setSent] = useState(false);
	const subjectId = useId();
	const bodyId = useId();
	const toId = useId();

	function send(event: FormEvent) {
		event.preventDefault();
		const params = new URLSearchParams({ subject, body })
			.toString()
			.replaceAll('+', '%20');
		window.location.href = `mailto:${business.email}?${params}`;
		setSent(true);
	}

	return (
		<div className={styles.mail}>
			<form className={styles.compose} onSubmit={send}>
				<div className={styles.mailToolbar}>
					<button type="submit" className={styles.defaultButton}>
						<svg viewBox="0 0 20 20" width={18} height={18} aria-hidden>
							<path
								d="M2 9.5L18 3l-5 15-3.5-6z"
								fill="#DB7093"
								stroke="currentColor"
								strokeWidth={1.6}
								strokeLinejoin="round"
							/>
							<path d="M9.5 12L18 3" stroke="currentColor" strokeWidth={1.6} />
						</svg>
						Send to Max
					</button>
					<p className={styles.mailHint} role="status">
						{sent
							? `Your email app should open now. If it does not, write to ${business.email}.`
							: 'Opens your email app with this message.'}
					</p>
				</div>
				<div className={styles.mailField}>
					<label htmlFor={toId}>To:</label>
					<input id={toId} value={business.email} readOnly className={styles.mailInput} />
				</div>
				<div className={styles.mailField}>
					<label htmlFor={subjectId}>Subject:</label>
					<input
						id={subjectId}
						data-autofocus
						value={subject}
						onChange={(event) => setSubject(event.target.value)}
						className={styles.mailInput}
					/>
				</div>
				<label htmlFor={bodyId} className={styles.srOnly}>
					Message
				</label>
				<textarea
					id={bodyId}
					className={styles.mailBody}
					value={body}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Hi Max, I want to build… Tell me what it is, when you need it, and where you are stuck."
					rows={6}
				/>
			</form>
			<section className={styles.mailAbout} aria-labelledby={`${toId}-about`}>
				<h3 id={`${toId}-about`}>{business.tagline}</h3>
				<p>{business.pitch}</p>
				<ul className={styles.services}>
					{business.services.map((service) => (
						<li key={service}>{service}</li>
					))}
				</ul>
				<p className={styles.mailLinks}>
					<a href={business.links.github} className={styles.mdLink}>
						GitHub
					</a>
					<a href={business.links.linkedin} className={styles.mdLink}>
						LinkedIn
					</a>
					<a href={`mailto:${business.email}`} className={styles.mdLink}>
						{business.email}
					</a>
				</p>
			</section>
		</div>
	);
}

export function AboutApp({
	business,
	onHire,
}: {
	business: BusinessInfo;
	onHire: () => void;
}) {
	return (
		<div className={styles.about}>
			<img
				src={portrait}
				alt="Max Zauner"
				width={112}
				height={112}
				className={styles.aboutPhoto}
			/>
			<h3 className={styles.aboutName}>maxOS</h3>
			<p className={styles.aboutVersion}>Running on Max Zauner since September 1993</p>
			<dl className={styles.aboutSpecs}>
				<div>
					<dt>Job</dt>
					<dd>{business.tagline}</dd>
				</div>
				<div>
					<dt>Builds</dt>
					<dd>{business.services.join(', ')}</dd>
				</div>
				<div>
					<dt>Status</dt>
					<dd>Open for projects</dd>
				</div>
			</dl>
			<button type="button" className={styles.defaultButton} onClick={onHire}>
				Write to Max
			</button>
		</div>
	);
}
