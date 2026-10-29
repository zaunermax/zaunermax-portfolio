/**
 * Hand-pixelled icons in the voxel kit's palette. Each icon is a little bitmap: one character per
 * pixel, `.` is transparent. Rows are merged into runs once at module load, so a 16×16 icon is a
 * few dozen rects. All decorative (aria-hidden); the buttons around them carry the names.
 */

const INK = '#2b2433';

const PAL: Record<string, string> = {
	k: INK,
	K: '#5a4f66', // soft ink
	w: '#fffaf2', // paper white
	e: '#e6dccb', // paper shade
	h: '#ffffff',
	c: '#e8836b', // coral
	C: '#b95c4a',
	p: '#f6b3a4', // coral light
	y: '#f2b84b', // mustard
	Y: '#c98f2c',
	o: '#ffe39a', // mustard light
	t: '#5fa59c', // teal
	T: '#3e7d76',
	a: '#a8dcd4', // teal light
	l: '#a493d8', // lilac
	L: '#6f5fae',
	m: '#d9d0f2', // lilac light
	s: '#93ad6a', // sage
	S: '#6a8448',
	n: '#253050', // screen navy
	N: '#3c4c7e',
	b: '#8fd0e8', // screen blue
	g: '#b9c0cf', // metal
	G: '#7c869a',
	r: '#e2574c', // pin red
};

type Bitmap = { w: number; h: number; runs: [number, number, number, string][] };

function bitmap(rows: string[]): Bitmap {
	const runs: Bitmap['runs'] = [];
	rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const ch = row[x];
			let end = x + 1;
			while (end < row.length && row[end] === ch) end++;
			if (ch !== '.') runs.push([x, y, end - x, PAL[ch] ?? INK]);
			x = end;
		}
	});
	return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, runs };
}

function Pixels({ art, className }: { art: Bitmap; className?: string }) {
	return (
		<svg
			className={className}
			viewBox={`0 0 ${art.w} ${art.h}`}
			shapeRendering="crispEdges"
			aria-hidden="true"
			focusable="false"
		>
			{art.runs.map(([x, y, w, fill]) => (
				<rect key={`${x}.${y}`} x={x} y={y} width={w} height={1} fill={fill} />
			))}
		</svg>
	);
}

// ---------------------------------------------------------------------------
// App icons for the dock (16×16).

const TALK = bitmap([
	'................',
	'..kkkkkkkkkkkk..',
	'.kwwwwwwwwwwwwk.',
	'kwhwwwwwwwwwwwwk',
	'kwwwwwwwwwwwwwwk',
	'kwwkkwwccwwkkwwk',
	'kwwkkwwccwwkkwwk',
	'kwwwwwwwwwwwwwwk',
	'kweeeeeeeeeeeewk',
	'.keeeeeeeeeeeek.',
	'..kkkeekkkkkkk..',
	'...keek.........',
	'...kek..........',
	'...kk...........',
	'................',
	'................',
]);

const BOOK = bitmap([
	'................',
	'..kkkkkkkkkkkkk.',
	'.kTttttttttttttk',
	'.kTtaaaaaaaaattk',
	'.kTtakkkkkkkattk',
	'.kTtaaaaaaaaattk',
	'.kTtakkkkkaaattk',
	'.kTtaaaaaaaaattk',
	'.kTttttttttttttk',
	'.kTttttttttttttk',
	'.kTkkkkkkkkykkkk',
	'.kTwwwwwwwwywwwk',
	'.kTeeeeeeeeyeeek',
	'..kkkkkkkkkykkk.',
	'..........kYk...',
	'...........k....',
]);

const MIC = bitmap([
	'.....kkkkkk.....',
	'....kgGgGghk....',
	'...kgGgGgGghk...',
	'...kGgGgGgGgk...',
	'...kgGgGgGgGk...',
	'...kGgGgGgGgk...',
	'...kkkkkkkkkk...',
	'...kcccccccCk...',
	'....kcccccCk....',
	'.....kkCCkk.....',
	'......kGGk......',
	'......kggk......',
	'......kGGk......',
	'....kkkggkkk....',
	'...kGGGGGGGGk...',
	'....kkkkkkkk....',
]);

const TICKET = bitmap([
	'.......kk.......',
	'......krrk......',
	'.kkkkkkrrkkkkkk.',
	'.kyyyyykkyyyyyk.',
	'.kyoyyyyyyyyyyk.',
	'.kyyyyyyyyyyyyk.',
	'.kykkkkkkkkkyyk.',
	'.kyyyyyyyyyyyyk.',
	'.kykkkkkkkyyyyk.',
	'.kyyyyyyyyyyyyk.',
	'.kykkkkkyyyyyyk.',
	'.kyyyyyyyyyyyyk.',
	'.kyyyyyyyyyYYYk.',
	'.kYYYYYYYYYYkk..',
	'..kkkkkkkkkkk...',
	'................',
]);

const ROCKET = bitmap([
	'.......kk.......',
	'......kcck......',
	'.....kccCck.....',
	'.....kwwwwk.....',
	'....kwwhwwek....',
	'....kwkkkwek....',
	'....kwkbbkek....',
	'....kwkkkwek....',
	'...kkwwwwweekk..',
	'..kcckwwwwekcck.',
	'..kcCkwwwwekCck.',
	'..kkkkkkkkkkkkk.',
	'.....kyoyyok....',
	'......kyoyk.....',
	'.......kyk......',
	'........k.......',
]);

const KEYBOARD = bitmap([
	'................',
	'................',
	'................',
	'kkkkkkkkkkkkkkkk',
	'kgggggggggggggGk',
	'kgwkwkokwkwkwkGk',
	'kgkkkkkkkkkkkkGk',
	'kgwkokokokwkwkGk',
	'kgkkkkkkkkkkkkGk',
	'kgwkwkwkwkwkwkGk',
	'kgkkkkkkkkkkkkGk',
	'kgwkkwwwwwwkwkGk',
	'kGGGGGGGGGGGGGGk',
	'kkkkkkkkkkkkkkkk',
	'................',
	'................',
]);

export type AbilityIcon = 'talk' | 'library' | 'stage' | 'quest' | 'forge' | 'controls';

const ABILITY: Record<AbilityIcon, Bitmap> = {
	talk: TALK,
	library: BOOK,
	stage: MIC,
	quest: TICKET,
	forge: ROCKET,
	controls: KEYBOARD,
};

export function Ability({ name, className }: { name: AbilityIcon; className?: string }) {
	return <Pixels art={ABILITY[name]} className={className} />;
}

// ---------------------------------------------------------------------------
// Floor-plan pins reuse the app icons, so a place and its app look the same.

export type MapGlyph = 'max' | 'library' | 'stage' | 'questboard' | 'worldforge';

const PIN: Record<MapGlyph, Bitmap> = {
	max: TALK,
	library: BOOK,
	stage: MIC,
	questboard: TICKET,
	worldforge: ROCKET,
};

export function MapPin({ name }: { name: MapGlyph }) {
	return <Pixels art={PIN[name]} />;
}

// ---------------------------------------------------------------------------
// Small glyphs.

const SPARKLE = bitmap([
	'...k...',
	'...k...',
	'..kok..',
	'kkoyokk',
	'..kok..',
	'...k...',
	'...k...',
]);

/** A four-point sparkle: list bullets and decoration. */
export function Sparkle({ className }: { className?: string }) {
	return <Pixels art={SPARKLE} className={className} />;
}

const BUBBLE = bitmap([
	'.kkkkkkk.',
	'kwwwwwwwk',
	'kwkwkwkwk',
	'kwwwwwwwk',
	'.kkwkkkk.',
	'..kk.....',
]);

export function GossipBubble() {
	return <Pixels art={BUBBLE} />;
}

const STAR = bitmap([
	'....k....',
	'...kyk...',
	'...kyk...',
	'kkkkoykkk',
	'kyoyyyyyk',
	'.kyyyyyk.',
	'..kyyYk..',
	'.kyYkkYk.',
	'.kYk..kk.',
	'.kk......',
]);

/** A gold star: talks Max has given. */
export function QuestMark() {
	return <Pixels art={STAR} />;
}

const ENVELOPE = bitmap([
	'kkkkkkkkkkkkkk',
	'kwkeeeeeeeekwk',
	'kwwkeeeeeekwwk',
	'kwwwkeeeekwwwk',
	'kwwwwkccckwwwk',
	'kwwwkcpccckwwk',
	'kwwkwkcccckwwk',
	'kwkwwwkcckwkwk',
	'kkwwwwwkkwwwkk',
	'kkkkkkkkkkkkkk',
]);

/** An envelope with a heart seal: a ticket that went out. */
export function WaxSeal() {
	return <Pixels art={ENVELOPE} />;
}

/** List bullet. */
export function Diamond() {
	return <Sparkle />;
}

const X = bitmap([
	'kk....kk',
	'kkk..kkk',
	'.kkkkkk.',
	'..kkkk..',
	'..kkkk..',
	'.kkkkkk.',
	'kkk..kkk',
	'kk....kk',
]);

export function CloseX() {
	return <Pixels art={X} />;
}

const SKY: Record<'dawn' | 'day' | 'dusk' | 'night', Bitmap> = {
	day: bitmap([
		'.....k.....',
		'..k..k..k..',
		'...kkkkk...',
		'..kyoooyk..',
		'.kyoyyyyyk.',
		'kkyyyyyyYkk',
		'.kyyyyyyYk.',
		'..kyyyYYk..',
		'...kkkkk...',
		'..k..k..k..',
		'.....k.....',
	]),
	dawn: bitmap([
		'...........',
		'.k...y...k.',
		'..k.....k..',
		'....kkk....',
		'...kyooyk..',
		'..kyoyyyyk.',
		'.kyyyyyyyYk',
		'kkkkkkkkkkk',
		'.ppppppppp.',
		'...ppppp...',
		'...........',
	]),
	dusk: bitmap([
		'...........',
		'...........',
		'....kkkk...',
		'...kcpppk..',
		'..kcpcccck.',
		'.kcccccccck',
		'.kCCCCCCCCk',
		'kkkkkkkkkkk',
		'.lllllllll.',
		'...lllll...',
		'...........',
	]),
	night: bitmap([
		'...kkkk....',
		'..kmmmk..k.',
		'.kmmmk..kok',
		'.kmmk....k.',
		'kmmmk......',
		'kmmmk......',
		'kmmmmk.....',
		'.kmmmmkkkk.',
		'.kmmmmmmmk.',
		'..kkmmmkk..',
		'....kkk....',
	]),
};

export function SkyBadge({ time }: { time: 'dawn' | 'day' | 'dusk' | 'night' }) {
	return <Pixels art={SKY[time]} />;
}
