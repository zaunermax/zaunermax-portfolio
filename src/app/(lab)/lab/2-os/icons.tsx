import type { SVGProps } from 'react';

// Hand-drawn 48px icons: 2px ink outlines, flat fills, one hard offset shadow.
const INK = '#1D1A22';
const PINK = '#DB7093';
const ROSE = '#9E3D5E';
const PLATINUM = '#DDDDDD';
const LIGHT = '#F6F6F6';
const CREAM = '#FFF3B8';

type IconProps = SVGProps<SVGSVGElement>;

function Frame({ children, ...props }: IconProps) {
	return (
		<svg
			viewBox="0 0 48 48"
			width={48}
			height={48}
			fill="none"
			stroke={INK}
			strokeWidth={2}
			strokeLinejoin="round"
			strokeLinecap="round"
			aria-hidden
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	);
}

export function TerminalIcon(props: IconProps) {
	return (
		<Frame {...props}>
			<rect x="7" y="9" width="36" height="30" rx="2" fill={INK} stroke="none" />
			<rect x="5" y="7" width="36" height="30" rx="2" fill="#24202A" />
			<path d="M5 13h36" stroke={PLATINUM} strokeWidth={1.5} />
			<path d="M11 20l5 4-5 4" stroke={PINK} strokeWidth={2.5} />
			<path d="M19 29h9" stroke="#F3E9EE" strokeWidth={2.5} />
			<path d="M16 37v4h14v-4" fill={PLATINUM} />
		</Frame>
	);
}

export function WikiIcon(props: IconProps) {
	return (
		<Frame {...props}>
			<path d="M7 14h34v26H7z" fill={INK} stroke="none" transform="translate(2 2)" />
			<path d="M5 12V9a2 2 0 0 1 2-2h11l4 5" fill={PINK} />
			<rect x="5" y="12" width="36" height="26" rx="1.5" fill={PLATINUM} />
			<path d="M5 16h36" stroke={LIGHT} strokeWidth={1.5} />
			{/* a little git branch on the folder */}
			<circle cx="18" cy="21" r="2.5" fill={LIGHT} />
			<circle cx="18" cy="32" r="2.5" fill={LIGHT} />
			<circle cx="29" cy="23" r="2.5" fill={PINK} />
			<path d="M18 23.5v6M29 25.5c0 4-6 3-10 5" />
		</Frame>
	);
}

export function TalksIcon(props: IconProps) {
	return (
		<Frame {...props}>
			{/* light beam */}
			<path d="M33 27l12-10v20z" fill={CREAM} stroke="none" opacity={0.95} />
			{/* carousel */}
			<ellipse cx="20" cy="16" rx="12" ry="5" fill={PINK} />
			<ellipse cx="20" cy="16" rx="3" ry="1.2" fill={INK} stroke="none" />
			<path d="M10 14l3 2M30 14l-3 2M20 11v2" stroke={ROSE} strokeWidth={1.5} />
			{/* body */}
			<rect x="7" y="21" width="30" height="15" rx="2" fill={INK} stroke="none" />
			<rect x="5" y="19" width="30" height="15" rx="2" fill={PLATINUM} />
			<circle cx="31" cy="27" r="4.5" fill={LIGHT} />
			<circle cx="31" cy="27" r="1.8" fill={INK} stroke="none" />
			<path d="M10 24h10M10 28h7" stroke="#8A8A8A" strokeWidth={1.5} />
			<path d="M10 34v4M30 34v4" />
		</Frame>
	);
}

export function MailIcon(props: IconProps) {
	return (
		<Frame {...props}>
			<rect x="7" y="13" width="38" height="26" rx="1.5" fill={INK} stroke="none" />
			<rect x="4" y="10" width="38" height="26" rx="1.5" fill={LIGHT} />
			<path d="M4 11l19 14 19-14" />
			<rect x="31" y="14" width="8" height="9" fill={PINK} strokeWidth={1.5} />
			<path d="M33 17h4M33 20h3" stroke={LIGHT} strokeWidth={1.2} />
		</Frame>
	);
}

export function FactsIcon(props: IconProps) {
	return (
		<Frame {...props}>
			<path d="M12 6h18l8 8v28H12z" fill={INK} stroke="none" transform="translate(2 2)" />
			<path d="M10 4h18l8 8v28H10z" fill={CREAM} />
			<path d="M28 4v8h8" fill="#F1DE86" />
			<path d="M15 18h16M15 23h16M15 28h11M15 33h14" stroke="#8A6D1A" strokeWidth={1.5} />
		</Frame>
	);
}

export function AboutIcon(props: IconProps) {
	return (
		<Frame {...props}>
			<rect x="8" y="8" width="36" height="36" rx="3" fill={INK} stroke="none" />
			<rect x="5" y="5" width="36" height="36" rx="3" fill={PINK} />
			<path
				d="M13 31V20c0-3 7-3 7 0v11M20 22c0-4 7-4 7 0v9M27 23c0-4 6-4 6 0v8"
				stroke={INK}
				strokeWidth={2.5}
			/>
		</Frame>
	);
}

/** Small mark for the menubar and the boot screen. */
export function MaxOSMark({ size = 18, ...props }: IconProps & { size?: number }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width={size}
			height={size}
			aria-hidden
			focusable="false"
			{...props}
		>
			<rect
				x="1.5"
				y="1.5"
				width="21"
				height="21"
				rx="2"
				fill={PINK}
				stroke={INK}
				strokeWidth={2}
			/>
			<path
				d="M6.5 17v-6c0-2 3.5-2 3.5 0v6M10 12c0-2.6 3.5-2.6 3.5 0v5M13.5 12c0-2.6 4-2.6 4 0v5"
				fill="none"
				stroke={INK}
				strokeWidth={1.8}
				strokeLinecap="round"
			/>
		</svg>
	);
}
