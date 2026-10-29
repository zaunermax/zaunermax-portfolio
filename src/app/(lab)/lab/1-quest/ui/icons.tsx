import { useId, type ReactNode } from 'react';

/**
 * Painted ability icons in the 2004 spirit: a dark vignette, one bold shape, warm highlights.
 * All decorative (aria-hidden); the buttons around them carry the names.
 */

export type AbilityIcon = 'talk' | 'library' | 'stage' | 'quest' | 'forge' | 'controls';

function Frame({
	id,
	from,
	to,
	children,
}: {
	id: string;
	from: string;
	to: string;
	children: ReactNode;
}) {
	return (
		<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
			<defs>
				<radialGradient id={`${id}bg`} cx="0.45" cy="0.4" r="0.75">
					<stop offset="0" stopColor={from} />
					<stop offset="1" stopColor={to} />
				</radialGradient>
				<radialGradient id={`${id}vig`} cx="0.5" cy="0.5" r="0.72">
					<stop offset="0.62" stopColor="#000" stopOpacity="0" />
					<stop offset="1" stopColor="#000" stopOpacity="0.75" />
				</radialGradient>
				<linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#fff3c4" />
					<stop offset="0.5" stopColor="#f2c94c" />
					<stop offset="1" stopColor="#a67c1b" />
				</linearGradient>
				<linearGradient id={`${id}paper`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#fffaf0" />
					<stop offset="1" stopColor="#d9c595" />
				</linearGradient>
			</defs>
			<rect width="64" height="64" fill={`url(#${id}bg)`} />
			{children}
			<rect width="64" height="64" fill={`url(#${id}vig)`} />
			<rect
				x="1"
				y="1"
				width="62"
				height="62"
				fill="none"
				stroke="#fff"
				strokeOpacity="0.12"
				strokeWidth="2"
			/>
		</svg>
	);
}

export function Ability({ name }: { name: AbilityIcon }) {
	const id = useId().replace(/:/g, '');
	switch (name) {
		case 'talk':
			return (
				<Frame id={id} from="#c0507a" to="#2a0816">
					<path
						d="M14 14h36a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H32l-11 9 2-9h-9a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z"
						fill={`url(#${id}paper)`}
						stroke="#3b2414"
						strokeWidth="2.5"
						strokeLinejoin="round"
					/>
					<path
						d="M30 19h4l-1 14h-2z"
						fill="#db7093"
						stroke="#5a1a2e"
						strokeWidth="1.2"
					/>
					<circle
						cx="32"
						cy="38"
						r="2.6"
						fill="#db7093"
						stroke="#5a1a2e"
						strokeWidth="1.2"
					/>
					<path
						d="M15 17c6-2 18-2 26-1"
						stroke="#fff"
						strokeOpacity="0.8"
						strokeWidth="2"
						fill="none"
						strokeLinecap="round"
					/>
				</Frame>
			);
		case 'library':
			return (
				<Frame id={id} from="#3a6ad0" to="#0a1438">
					<path
						d="M8 44c8-4 16-4 24 0 8-4 16-4 24 0V20c-8-4-16-4-24 0-8-4-16-4-24 0z"
						fill="#7a1e14"
						stroke="#2a0a06"
						strokeWidth="2"
					/>
					<path
						d="M11 41c7-3 14-3 21 0V20c-7-3-14-3-21 0z"
						fill={`url(#${id}paper)`}
						stroke="#5a3e1b"
						strokeWidth="1.2"
					/>
					<path
						d="M32 41c7-3 14-3 21 0V20c-7-3-14-3-21 0z"
						fill={`url(#${id}paper)`}
						stroke="#5a3e1b"
						strokeWidth="1.2"
					/>
					<path
						d="M15 25h12M15 29h12M15 33h9M36 25h12M36 29h12M36 33h10"
						stroke="#8a6a4a"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
					<path
						d="M44 18v18l3-3 3 3V18z"
						fill="#db7093"
						stroke="#5a1a2e"
						strokeWidth="1"
					/>
					<path
						d="M30 12l2-4 2 4 4 1-3 2 1 4-4-2-4 2 1-4-3-2z"
						fill={`url(#${id}gold)`}
						stroke="#5a3e1b"
						strokeWidth="0.8"
					/>
				</Frame>
			);
		case 'stage':
			return (
				<Frame id={id} from="#6a3a9a" to="#140820">
					<path
						d="M32 10l5 12 13 1-10 8 4 13-12-7-12 7 4-13-10-8 13-1z"
						fill={`url(#${id}gold)`}
						stroke="#5a3e1b"
						strokeWidth="1.5"
						strokeLinejoin="round"
					/>
					<path d="M4 4h56v8H4z" fill="#db7093" stroke="#5a1a2e" strokeWidth="1.5" />
					<path
						d="M4 12c4 10 6 26 5 48H4z"
						fill="#db7093"
						stroke="#5a1a2e"
						strokeWidth="1.5"
					/>
					<path
						d="M60 12c-4 10-6 26-5 48h5z"
						fill="#db7093"
						stroke="#5a1a2e"
						strokeWidth="1.5"
					/>
					<path
						d="M6 16c2 12 3 26 2 42M58 16c-2 12-3 26-2 42"
						stroke="#a8456a"
						strokeWidth="1.5"
						fill="none"
					/>
					<path
						d="M4 12q7 6 14 0t14 0 14 0 14 0"
						fill="none"
						stroke="#f2c94c"
						strokeWidth="2"
					/>
					<path d="M14 58h36" stroke="#8a5a32" strokeWidth="5" />
				</Frame>
			);
		case 'quest':
			return (
				<Frame id={id} from="#8a5a32" to="#2a1608">
					<rect
						x="14"
						y="20"
						width="36"
						height="34"
						fill={`url(#${id}paper)`}
						stroke="#3b2414"
						strokeWidth="2"
					/>
					<rect
						x="10"
						y="17"
						width="44"
						height="6"
						rx="3"
						fill="#a07040"
						stroke="#3b2414"
						strokeWidth="1.5"
					/>
					<rect
						x="10"
						y="51"
						width="44"
						height="6"
						rx="3"
						fill="#a07040"
						stroke="#3b2414"
						strokeWidth="1.5"
					/>
					<path
						d="M19 30h26M19 35h26M19 40h18"
						stroke="#8a6a4a"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
					<circle
						cx="42"
						cy="45"
						r="5"
						fill="#a8231c"
						stroke="#4a0a06"
						strokeWidth="1.2"
					/>
					<path
						d="M28 3h8l-1.5 11h-5z"
						fill={`url(#${id}gold)`}
						stroke="#5a3e1b"
						strokeWidth="1.2"
					/>
					<circle
						cx="32"
						cy="17.5"
						r="2.4"
						fill={`url(#${id}gold)`}
						stroke="#5a3e1b"
						strokeWidth="1"
					/>
				</Frame>
			);
		case 'forge':
			return (
				<Frame id={id} from="#1f7a8a" to="#041820">
					<ellipse cx="32" cy="55" rx="20" ry="5" fill="#0a2a30" />
					<path
						d="M24 56l2-38 6-8 6 8 2 38z"
						fill="#4a5470"
						stroke="#141a2a"
						strokeWidth="2"
						strokeLinejoin="round"
					/>
					<path d="M26 56l1.5-36L32 12" stroke="#7a86a8" strokeWidth="1.5" fill="none" />
					<path
						d="M32 24v8m-4-4h8M29 38l6 6m0-6l-6 6"
						stroke="#9ff6ff"
						strokeWidth="2.6"
						strokeLinecap="round"
					/>
					<circle cx="14" cy="22" r="1.8" fill="#bff8ff" />
					<circle cx="50" cy="16" r="1.5" fill="#bff8ff" />
					<circle cx="47" cy="34" r="2" fill="#bff8ff" />
					<circle cx="16" cy="40" r="1.4" fill="#bff8ff" />
					<path
						d="M32 22v12M27 28h10"
						stroke="#fff"
						strokeOpacity="0.6"
						strokeWidth="1"
					/>
				</Frame>
			);
		case 'controls':
			return (
				<Frame id={id} from="#5a6070" to="#14161c">
					<g fill={`url(#${id}gold)`} stroke="#3a2a10" strokeWidth="1.2">
						<rect x="24" y="10" width="16" height="16" rx="3" />
						<rect x="6" y="30" width="16" height="16" rx="3" />
						<rect x="24" y="30" width="16" height="16" rx="3" />
						<rect x="42" y="30" width="16" height="16" rx="3" />
					</g>
					<g
						fill="#2a1a08"
						fontFamily="Georgia, serif"
						fontSize="11"
						fontWeight="700"
						textAnchor="middle"
					>
						<text x="32" y="22">
							W
						</text>
						<text x="14" y="42">
							A
						</text>
						<text x="32" y="42">
							S
						</text>
						<text x="50" y="42">
							D
						</text>
					</g>
					<rect
						x="12"
						y="50"
						width="40"
						height="7"
						rx="3"
						fill="#c8ccd8"
						stroke="#2a2a30"
						strokeWidth="1.2"
					/>
				</Frame>
			);
	}
}

export type MapGlyph = 'max' | 'library' | 'stage' | 'questboard' | 'worldforge';

/** Small round minimap pins. */
export function MapPin({ name }: { name: MapGlyph }) {
	const ring = name === 'max' ? '#db7093' : '#f2c94c';
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<circle cx="12" cy="12" r="10.5" fill="#1a120a" stroke={ring} strokeWidth="2" />
			{name === 'max' ? (
				<>
					<path
						d="M10.2 4.5h3.6l-.8 9h-2z"
						fill="#ffd23a"
						stroke="#5a3e1b"
						strokeWidth="0.8"
					/>
					<circle
						cx="12"
						cy="17.3"
						r="1.9"
						fill="#ffd23a"
						stroke="#5a3e1b"
						strokeWidth="0.8"
					/>
				</>
			) : null}
			{name === 'library' ? (
				<>
					<path
						d="M4.5 16c2.5-1.5 5-1.5 7.5 0 2.5-1.5 5-1.5 7.5 0V8c-2.5-1.5-5-1.5-7.5 0-2.5-1.5-5-1.5-7.5 0z"
						fill="#f6eedc"
						stroke="#5a3e1b"
						strokeWidth="0.9"
					/>
					<path d="M12 8v8" stroke="#5a3e1b" strokeWidth="0.9" />
				</>
			) : null}
			{name === 'stage' ? (
				<path
					d="M12 4.5l2.2 4.8 5.2.5-3.9 3.4 1.2 5.1L12 15.6l-4.7 2.7 1.2-5.1-3.9-3.4 5.2-.5z"
					fill="#f58bb0"
					stroke="#5a1a2e"
					strokeWidth="0.9"
				/>
			) : null}
			{name === 'questboard' ? (
				<>
					<rect
						x="6"
						y="7"
						width="12"
						height="11"
						fill="#f6eedc"
						stroke="#5a3e1b"
						strokeWidth="0.9"
					/>
					<path d="M8.5 10.5h7M8.5 13h7M8.5 15.5h4" stroke="#8a6a4a" strokeWidth="0.9" />
					<circle cx="15.5" cy="16" r="1.6" fill="#a8231c" />
				</>
			) : null}
			{name === 'worldforge' ? (
				<>
					<path
						d="M9.5 19l.7-11L12 5l1.8 3 .7 11z"
						fill="#5a6480"
						stroke="#1a1f30"
						strokeWidth="0.9"
					/>
					<path
						d="M12 9v5M10 11.5h4"
						stroke="#9ff6ff"
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</>
			) : null}
		</svg>
	);
}

export function GossipBubble() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path
				d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4 1-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
				fill="#fffaf0"
				stroke="#3b2414"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			<path
				d="M6 9h12M6 12.5h8"
				stroke="#8a6a4a"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function QuestMark({ done = false }: { done?: boolean }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			{done ? (
				<path
					d="M12 3a4 4 0 0 1 4 4c0 2-2 3-3 4v2h-2v-3c1-1 3-1.6 3-3a2 2 0 0 0-4 0H8a4 4 0 0 1 4-4zM12 16.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z"
					fill="#f2c94c"
					stroke="#5a3e1b"
					strokeWidth="0.9"
				/>
			) : (
				<>
					<path
						d="M10 2.5h4l-.8 12.5h-2.4z"
						fill="#ffd23a"
						stroke="#5a3e1b"
						strokeWidth="1"
					/>
					<circle
						cx="12"
						cy="19"
						r="2.4"
						fill="#ffd23a"
						stroke="#5a3e1b"
						strokeWidth="1"
					/>
				</>
			)}
		</svg>
	);
}

/** A red wax seal: the quest scroll went out. */
export function WaxSeal() {
	return (
		<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
			<path
				d="M20 3c3 0 4 3 7 4s6-1 8 2-1 5 0 8 4 5 2 8-5 2-7 4-3 7-6 7-4-4-7-5-6 2-8-1 1-6 0-9-4-4-2-7 5-2 7-4 3-7 6-7z"
				fill="#a8231c"
				stroke="#4a0a06"
				strokeWidth="1.5"
			/>
			<circle cx="20" cy="20" r="9" fill="none" stroke="#e86a5a" strokeWidth="1.5" />
			<path
				d="M15 21l3.5 3.5L26 16"
				stroke="#ffd9c8"
				strokeWidth="2.6"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function Diamond() {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path d="M10 2l7 8-7 8-7-8z" fill="#f2c94c" stroke="#5a3e1b" strokeWidth="1.2" />
			<path d="M10 4.5l4.5 5.5" stroke="#fff6cc" strokeWidth="1.2" />
		</svg>
	);
}

export function CloseX() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
			<path
				d="M3 3l10 10M13 3L3 13"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function SkyBadge({ time }: { time: 'dawn' | 'day' | 'dusk' | 'night' }) {
	if (time === 'night')
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path
					d="M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z"
					fill="#e8eeff"
					stroke="#8a9ad0"
					strokeWidth="1"
				/>
			</svg>
		);
	const color = time === 'day' ? '#ffd23a' : time === 'dawn' ? '#ffb36a' : '#ff8a4a';
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<g stroke={color} strokeWidth="2" strokeLinecap="round">
				<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
			</g>
			<circle cx="12" cy="12" r="5" fill={color} stroke="#8a5a10" strokeWidth="1" />
		</svg>
	);
}

/** Gilded end cap for the action bar, a nod to the old griffins without copying them. */
export function BarCap({ className }: { className?: string }) {
	const id = useId().replace(/:/g, '');
	return (
		<svg className={className} viewBox="0 0 74 92" aria-hidden="true" focusable="false">
			<defs>
				<linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#fff0b8" />
					<stop offset="0.4" stopColor="#e0b444" />
					<stop offset="1" stopColor="#5a3e1b" />
				</linearGradient>
			</defs>
			<path
				d="M72 90H22C10 90 4 80 6 70c2-9 10-12 14-20C24 40 18 32 10 30 20 22 34 26 38 38c3-12 12-22 24-24-6 8-8 16-4 26 3 8 12 12 14 22z"
				fill={`url(#${id}g)`}
				stroke="#2a1a06"
				strokeWidth="2.2"
				strokeLinejoin="round"
			/>
			<path
				d="M18 74c4-8 14-12 24-10M30 56c6-6 16-6 24 0M44 30c4 6 6 14 4 22"
				stroke="#5a3e1b"
				strokeWidth="2"
				fill="none"
				strokeLinecap="round"
			/>
			<circle cx="22" cy="80" r="4" fill="#db7093" stroke="#2a1a06" strokeWidth="1.5" />
		</svg>
	);
}
