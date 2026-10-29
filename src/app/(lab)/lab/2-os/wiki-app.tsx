'use client';

import { PortableText, type PortableTextComponents } from '@portabletext/react';
import { useId, useRef } from 'react';
import type { LabWikiPage } from '../_shared/content';
import styles from './os.module.css';

const components: PortableTextComponents = {
	block: {
		h1: ({ children }) => <h4 className={styles.mdH1}>{children}</h4>,
		h2: ({ children }) => <h4 className={styles.mdH2}>{children}</h4>,
		h3: ({ children }) => <h5 className={styles.mdH3}>{children}</h5>,
		normal: ({ children }) => <p className={styles.mdP}>{children}</p>,
		blockquote: ({ children }) => (
			<blockquote className={styles.mdQuote}>{children}</blockquote>
		),
	},
	list: {
		bullet: ({ children }) => <ul className={styles.mdUl}>{children}</ul>,
		number: ({ children }) => <ol className={styles.mdOl}>{children}</ol>,
	},
	marks: {
		link: ({ children, value }) => (
			<a className={styles.mdLink} href={(value as { href?: string })?.href}>
				{children}
			</a>
		),
		code: ({ children }) => <code className={styles.mdCode}>{children}</code>,
	},
};

function FileGlyph() {
	return (
		<svg
			viewBox="0 0 16 16"
			width={16}
			height={16}
			aria-hidden
			className={styles.fileGlyph}
		>
			<path
				d="M3 1.5h7l3 3v10H3z"
				fill="#fff"
				stroke="currentColor"
				strokeWidth={1.4}
				strokeLinejoin="round"
			/>
			<path
				d="M10 1.5v3h3M5.5 8h5M5.5 10.5h5"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.2}
			/>
		</svg>
	);
}

type Props = {
	pages: LabWikiPage[];
	selected: string;
	onSelect: (filename: string) => void;
};

export function WikiApp({ pages, selected, onSelect }: Props) {
	const page = pages.find((p) => p.filename === selected) ?? pages[0];
	const headingId = useId();
	const latest = pages[0];
	const listRef = useRef<HTMLDivElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const articleRef = useRef<HTMLElement>(null);

	function select(filename: string) {
		onSelect(filename);
		// When the panes are stacked (narrow window or phone), jump down to what was picked.
		const list = listRef.current?.getBoundingClientRect();
		const article = articleRef.current;
		if (list && article && article.getBoundingClientRect().top >= list.bottom - 2) {
			requestAnimationFrame(() => {
				article.scrollIntoView({ block: 'start' });
				headingRef.current?.focus({ preventScroll: true });
			});
		}
	}

	if (!page) return <p className={styles.wikiEmpty}>This repository is empty.</p>;

	return (
		<div className={styles.wiki}>
			<div className={styles.repoBar}>
				<span className={styles.repoName}>
					zaunermax / <strong>wiki</strong>
				</span>
				<span className={styles.repoBranch}>main</span>
			</div>
			<div className={styles.wikiPanes}>
				<div ref={listRef} className={styles.fileList}>
					{latest && (
						<p className={styles.latestCommit}>
							<strong>zaunermax</strong> <span>{latest.commitMsg}</span>
						</p>
					)}
					<ul aria-label="Files">
						{pages.map((p) => (
							<li key={p.filename}>
								<button
									type="button"
									className={styles.fileRow}
									aria-current={p.filename === page.filename ? 'true' : undefined}
									onClick={() => select(p.filename)}
								>
									<FileGlyph />
									<span className={styles.fileName}>{p.filename}</span>
									<span className={styles.fileMsg}>{p.commitMsg}</span>
									<span className={styles.fileTime}>{p.relativeTimeAgo}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
				<article ref={articleRef} className={styles.readme} aria-labelledby={headingId}>
					<div className={styles.readmeHead}>
						<h3 id={headingId} ref={headingRef} tabIndex={-1}>
							{page.filename}
						</h3>
						<a href={`/wiki/${page.filename}`} className={styles.readmeOpen}>
							Open as page
						</a>
					</div>
					<div className={styles.readmeBody}>
						<PortableText value={page.content} components={components} />
					</div>
				</article>
			</div>
		</div>
	);
}
