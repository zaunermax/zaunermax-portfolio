export const MENUBAR_HEIGHT = 30;
const DOCK_HEIGHT = 48;
const ICON_COLUMN = 128;

export const APP_IDS = ['terminal', 'facts', 'mail', 'wiki', 'talks', 'about'] as const;
export type AppId = (typeof APP_IDS)[number];

export type Win = {
	open: boolean;
	minimized: boolean;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
};

export type Wins = Record<AppId, Win>;

export const APP_TITLES: Record<AppId, string> = {
	terminal: 'Terminal',
	facts: 'facts.txt',
	mail: 'Hire Max',
	wiki: 'Wiki',
	talks: 'Talks',
	about: 'About maxOS',
};

/**
 * First-boot arrangement: the greeting owns the left, the facts note sticks next to "Hello",
 * Terminal sits beside "Max", and Mail peeks up from the bottom edge under the greeting.
 * Hero metrics mirror the clamp() sizes in os.module.css.
 */
export function initialLayout(vw: number, vh: number): Wins {
	const usableW = vw - ICON_COLUMN;
	const heroLeft = Math.min(Math.max(20, vw * 0.05), 72);
	const maxSize = Math.min(Math.max(132, Math.min(vw * 0.19, vh * 0.33)), 300);
	const helloSize = Math.min(Math.max(56, Math.min(vw * 0.084, vh * 0.15)), 132);
	const helloRight = heroLeft + helloSize * 4.4;
	const slabRight = heroLeft + maxSize * 2.25;
	const heroBottom =
		MENUBAR_HEIGHT + Math.max(20, vh * 0.05) + helloSize * 0.9 + maxSize * 0.98 + 80;

	const portrait = vh > vw * 1.1;
	let factsW: number, factsX: number, factsY: number;
	let termW: number, termX: number, termY: number;
	const factsH = Math.min(300, vh * 0.34);

	if (portrait) {
		// Tall screens: the windows stack under the greeting instead of beside it.
		factsW = Math.min(300, Math.max(240, usableW - slabRight - 24));
		factsX = usableW - factsW - 8;
		factsY = MENUBAR_HEIGHT + Math.max(20, vh * 0.05) + helloSize * 0.9;
		termW = Math.min(580, usableW - heroLeft - 24);
		termX = heroLeft;
		termY = Math.max(heroBottom + 8, factsY + factsH + 16);
	} else {
		factsW = Math.min(310, Math.max(240, usableW - helloRight - 48));
		factsX = Math.min(Math.max(helloRight + 32, usableW * 0.55), usableW - factsW - 16);
		factsY = MENUBAR_HEIGHT + Math.max(24, vh * 0.05);
		termY = Math.max(factsY + factsH + 28, MENUBAR_HEIGHT + vh * 0.3);
		termW = Math.min(600, Math.max(420, usableW - slabRight - 56));
		termX = Math.min(Math.max(slabRight + 40, 16), usableW - termW - 8);
	}
	const termH = Math.min(440, vh - termY - DOCK_HEIGHT - 20);

	const mailW = Math.min(
		500,
		Math.max(360, portrait ? usableW * 0.6 : termX - heroLeft - 48),
	);
	const mailPeek = Math.max(120, vh - heroBottom - 24);

	const wikiW = Math.min(880, usableW - 48);
	const wikiH = Math.min(580, vh - MENUBAR_HEIGHT - DOCK_HEIGHT - 40);
	const talksW = Math.min(660, usableW - 48);
	const talksH = Math.min(480, vh - MENUBAR_HEIGHT - DOCK_HEIGHT - 60);
	const aboutW = Math.min(440, vw - 32);

	return {
		terminal: {
			open: true,
			minimized: false,
			w: termW,
			h: termH,
			x: termX,
			y: termY,
			z: 3,
		},
		facts: {
			open: true,
			minimized: false,
			w: factsW,
			h: factsH,
			x: factsX,
			y: factsY,
			z: 2,
		},
		mail: {
			open: true,
			minimized: false,
			w: mailW,
			h: Math.min(600, vh - MENUBAR_HEIGHT - 40),
			x: heroLeft + 24,
			y: vh - DOCK_HEIGHT - Math.min(mailPeek, 128),
			z: 1,
		},
		wiki: {
			open: false,
			minimized: false,
			w: wikiW,
			h: wikiH,
			x: (usableW - wikiW) / 2,
			y: MENUBAR_HEIGHT + 24,
			z: 0,
		},
		talks: {
			open: false,
			minimized: false,
			w: talksW,
			h: talksH,
			x: (usableW - talksW) / 2 + 40,
			y: MENUBAR_HEIGHT + 56,
			z: 0,
		},
		about: {
			open: false,
			minimized: false,
			w: aboutW,
			h: Math.min(440, vh - MENUBAR_HEIGHT - 40),
			x: (vw - aboutW) / 2,
			y: MENUBAR_HEIGHT + 48,
			z: 0,
		},
	};
}

/** Moves a window just enough that all of it is on screen. */
export function revealed(win: Win, vw: number, vh: number): Win {
	const w = Math.min(win.w, vw - 16);
	const h = Math.min(win.h, vh - MENUBAR_HEIGHT - 16);
	const x = Math.min(Math.max(win.x, 8), vw - w - 8);
	const y = Math.min(Math.max(win.y, MENUBAR_HEIGHT + 8), vh - h - 8);
	return { ...win, w, h, x, y };
}

export function isOffscreen(win: Win, vw: number, vh: number) {
	return win.x < 0 || win.y + win.h > vh || win.x + win.w > vw;
}
