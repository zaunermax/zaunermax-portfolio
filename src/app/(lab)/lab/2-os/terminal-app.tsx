'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { useAsk } from '../_shared/use-ask';
import styles from './os.module.css';

type Props = {
	asker: ReturnType<typeof useAsk>;
	onOpenWikiFile: (filename: string) => void;
};

const PROMPT = 'guest@zaunermax.at:~$';

export function TerminalApp({ asker, onOpenWikiFile }: Props) {
	const {
		ask,
		history,
		pending,
		streaming,
		isAnswering,
		suggestions,
		refreshSuggestions,
	} = asker;
	const [value, setValue] = useState('');
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [history.length, streaming, pending]);

	function submit(question: string) {
		if (isAnswering) return;
		setValue('');
		void ask(question);
		inputRef.current?.focus({ preventScroll: true });
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		submit(value);
	}

	return (
		<div
			className={styles.terminal}
			onClick={(event) => {
				// Clicking empty terminal space puts the cursor back in the prompt, unless text is being selected.
				if (event.target === event.currentTarget || event.target === scrollRef.current) {
					if (!window.getSelection()?.toString())
						inputRef.current?.focus({ preventScroll: true });
				}
			}}
		>
			<div ref={scrollRef} className={styles.terminalScroll}>
				<p className={styles.termDim}>
					maxOS terminal. Ask anything about Max and an LLM answers from his wiki.
				</p>
				<p className={styles.termDim}>
					Answers can be wrong.{' '}
					<a
						href="/wiki/DISCLAIMER.md"
						className={styles.termLink}
						onClick={(event) => {
							if (event.metaKey || event.ctrlKey || event.shiftKey) return;
							event.preventDefault();
							onOpenWikiFile('DISCLAIMER.md');
						}}
					>
						Read the disclaimer
					</a>
					.
				</p>

				<p className={styles.termLine}>
					<span className={styles.termPrompt}>{PROMPT}</span> ask --example
				</p>
				{suggestions.length > 0 ? (
					<ul className={styles.termExamples} aria-label="Example questions">
						{suggestions.map((suggestion) => (
							<li key={suggestion}>
								<button
									type="button"
									className={styles.termExample}
									onClick={() => submit(suggestion)}
									disabled={isAnswering}
								>
									ask &quot;{suggestion}&quot;
								</button>
							</li>
						))}
						<li>
							<button
								type="button"
								className={styles.termMore}
								onClick={() => void refreshSuggestions(true)}
							>
								ask --example --more
							</button>
						</li>
					</ul>
				) : (
					<p className={styles.termDim}>Loading examples…</p>
				)}

				<div role="log" aria-label="Answers">
					{history.map((entry, index) => (
						<div key={index} className={styles.termEntry}>
							<p className={styles.termLine}>
								<span className={styles.termPrompt}>{PROMPT}</span> ask {entry.question}
							</p>
							<p className={entry.failed ? styles.termError : styles.termAnswer}>
								{entry.answer}
							</p>
						</div>
					))}
				</div>

				{pending !== null && (
					<div className={styles.termEntry} aria-hidden>
						<p className={styles.termLine}>
							<span className={styles.termPrompt}>{PROMPT}</span> ask {pending}
						</p>
						<p className={styles.termAnswer}>
							{streaming}
							<span className={styles.termCursor} />
						</p>
					</div>
				)}
				<p className={styles.srOnly} role="status">
					{isAnswering ? 'Max is answering.' : ''}
				</p>

				<form className={styles.termForm} onSubmit={onSubmit}>
					<label htmlFor={inputId} className={styles.termLine}>
						<span className={styles.termPrompt}>{PROMPT}</span> ask
						<span className={styles.srOnly}> a question about Max</span>
					</label>
					<input
						ref={inputRef}
						id={inputId}
						data-autofocus
						className={styles.termInput}
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder={isAnswering ? '' : 'what does Max do?'}
						maxLength={100}
						autoComplete="off"
						autoCapitalize="off"
						spellCheck={false}
						enterKeyHint="send"
					/>
				</form>
			</div>
		</div>
	);
}
