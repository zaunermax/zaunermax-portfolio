import type { Brief, Chatter } from './schema';

/**
 * The hand-written office shown until a visitor redeploys one. Its seed was picked by eye for
 * a floorplan where every zone gets a good room.
 */
export const DEFAULT_SEED = 850;

export const defaultBrief: Brief = {
	company: 'Byte & Biscuit',
	tagline: 'Disrupting the snack-to-commit pipeline since lunchtime.',
	vibe: 'cozy',
	timeOfDay: 'day',
	outside: 'clear',
	opening: 'Walls click into place around a sunny, slightly over-caffeinated floor.',
	zones: [
		{ kind: 'reception', name: 'The Welcome Mat', story: 'A reception desk appears, already smiling.' },
		{ kind: 'desks', name: 'The Commit Floor', story: 'Desk pods snap together, monitors blinking awake.' },
		{ kind: 'meetup', name: 'The Snug', story: 'A tiny stage rolls in, the projector warming up.' },
		{ kind: 'library', name: 'The README Room', story: 'Bookshelves fill up with docs nobody has read yet.' },
		{ kind: 'server', name: 'The Cloud (Local)', story: 'Racks hum to life; a small black box glows red.' },
		{ kind: 'coffee', name: 'The Bean Counter', story: 'The espresso machine hisses its first hello.' },
		{ kind: 'games', name: 'Merge Conflict Arena', story: 'Ping-pong paddles land on a fresh green table.' },
		{ kind: 'lounge', name: 'The Standby Lounge', story: 'Beanbags flop down in a sunny corner.' },
		{ kind: 'kitchen', name: 'Snack Overflow', story: 'The fridge fills with labelled, contested yoghurts.' },
		{ kind: 'meeting', name: 'Sync Room', story: 'A glass box appears for meetings that could be emails.' },
		{ kind: 'phone', name: 'The Quiet Cubes', story: 'Phone booths pop up for calls and hiding from calls.' },
	],
	landmarks: {
		max: "Max's Desk",
		library: 'The Wiki Shelf',
		stage: 'The Talk Stage',
		questboard: 'The Ticket Board',
		worldforge: 'The Main Rack',
	},
	event: {
		kind: 'meetup',
		title: 'Lightning Talks: Tabs vs Spaces, Round 7',
		story: 'Folding chairs fill up: the lightning talks are about to start.',
	},
	cast: [
		{
			name: 'Priya',
			character: 'barista',
			zone: 'coffee',
			activity: 'serving',
			line: 'Oat, soy or the mystery carton? I recommend the mystery carton.',
			look: { face: 'smile', hair: 'high_bun', hairColor: 'soft_black', headwear: 'headband', top: 'apron_tee', topColor: 'sage', bottom: 'trousers', bottomColor: 'navy', accentColor: 'coral', accessories: ['earrings'] },
		},
		{
			name: 'Gus',
			character: 'dev_glasses',
			zone: 'desks',
			activity: 'typing',
			line: 'Have you tried turning it off and on again? I have. Twice.',
			look: { face: 'bright', hair: 'side_part', hairColor: 'espresso', headwear: 'none', top: 'sweater_vest', topColor: 'mustard', bottom: 'trousers', bottomColor: 'navy', accentColor: 'teal_dark', accessories: ['square_glasses'] },
		},
		{
			name: 'Rhea',
			character: 'designer',
			zone: 'desks',
			activity: 'typing',
			line: 'I moved that button two pixels left. You are welcome.',
			look: { face: 'wink', hair: 'afro', hairColor: 'soft_black', headwear: 'none', top: 'cardigan', topColor: 'lilac', bottom: 'skirt_leggings', bottomColor: 'navy', accentColor: 'mustard', accessories: ['earrings'] },
		},
		{
			name: 'Dez',
			character: 'dev_slacker',
			zone: 'server',
			activity: 'fixing',
			line: 'Do not touch the little black box. That is the whole internet.',
			look: { face: 'sleepy', hair: 'long_straight', hairColor: 'chestnut', headwear: 'headphones', top: 'tee', topColor: 'navy', bottom: 'wide_trousers', bottomColor: 'metal', accentColor: 'coral', accessories: ['lanyard'] },
		},
		{
			name: 'Linus',
			character: 'manager',
			zone: 'meetup',
			activity: 'presenting',
			line: 'Next slide please. No, the other next slide.',
			look: { face: 'smile_lines', hair: 'buzz', hairColor: 'silver', headwear: 'none', top: 'shirt_tie', topColor: 'cream', bottom: 'trousers', bottomColor: 'navy', accentColor: 'coral_dark', accessories: ['beard'] },
		},
		{
			name: 'Ola',
			character: 'intern',
			zone: 'meetup',
			activity: 'attending',
			line: 'I am taking notes on everything. Even the snacks.',
			look: { face: 'bright', hair: 'braids', hairColor: 'espresso', headwear: 'none', top: 'hoodie', topColor: 'coral', bottom: 'trousers', bottomColor: 'teal_dark', accentColor: 'mustard', accessories: ['lanyard', 'backpack'] },
		},
		{
			name: 'Sam',
			character: 'dev_hoodie',
			zone: 'games',
			activity: 'gaming',
			line: 'Just one more round, then I will fix the build. Probably.',
			look: { face: 'freckled', hair: 'side_part', hairColor: 'copper', headwear: 'cap', top: 'hoodie', topColor: 'teal', bottom: 'shorts', bottomColor: 'navy', accentColor: 'mustard', accessories: ['freckles'] },
		},
		{
			name: 'Noor',
			character: 'designer',
			zone: 'lounge',
			activity: 'lounging',
			line: 'This beanbag is where all my best ideas go to nap.',
			look: { face: 'smile', hair: 'long_straight', hairColor: 'soft_black', headwear: 'headwrap', top: 'blazer', topColor: 'coral', bottom: 'wide_trousers', bottomColor: 'cream', accentColor: 'teal', accessories: ['round_glasses'] },
		},
		{
			name: 'Kip',
			character: 'dev_hoodie',
			zone: 'kitchen',
			activity: 'chatting',
			line: 'Whoever keeps labelling the yoghurt "prod" is a hero.',
			look: { face: 'bright', hair: 'locs', hairColor: 'walnut', headwear: 'none', top: 'overalls', topColor: 'teal_light', bottom: 'trousers', bottomColor: 'teal_dark', accentColor: 'coral', accessories: ['moustache'] },
		},
		{
			name: 'Bea',
			character: 'intern',
			zone: 'kitchen',
			activity: 'chatting',
			line: 'The fridge has a changelog now. I wrote it.',
			look: { face: 'smile', hair: 'bob', hairColor: 'rose', headwear: 'none', top: 'blazer', topColor: 'sage', bottom: 'skirt_leggings', bottomColor: 'cream', accentColor: 'lilac', accessories: [] },
		},
		{
			name: 'Waffles',
			character: 'office_dog',
			zone: 'lounge',
			activity: 'wandering',
			line: '*sniff sniff* Woof! *drops a squeaky rubber duck at your feet*',
			look: null,
		},
		{
			name: 'Mo',
			character: 'office_cat',
			zone: 'library',
			activity: 'napping',
			line: '*stretches across the keyboard* Mrrp.',
			look: null,
		},
	],
	closing: 'The coffee is hot, the build is green, and the office is open. Come on in!',
};

/**
 * What the staff say about Max in offices without chatter of their own (the offline offices and
 * those deployed before chatter existed). Picked from generated chatter and checked against the
 * CMS notes it was written from; keep it to facts that are still true.
 */
export const DEFAULT_CHATTER: Chatter = {
	remarks: [
		'Max runs a one-person software business. The org chart must be wonderfully short.',
		"Max owns an ErgoDox EZ. I still can't tell which half to say hello to.",
		"Max wrote his master's thesis on React and D3. Even the charts had homework.",
		'Max loves Interrail and avoids flying where he can. A timetable he actually likes.',
		"Max is building a free software suite for his community's events. The scope has scope.",
		'Max once taught kids Python, git and circuits at a coding camp. Some summer job.',
		'Max spent two and a half months in Sweden. He can small-talk in Swedish now.',
		'Max runs local models for privacy-critical work. Some things stay on the machine.',
	],
	talks: [
		[
			'Max would rather take longer than ship something sloppy.',
			'Even with a deadline?',
			'Especially then. Software is a craft to him.',
			'So no half-baked releases. Noted.',
		],
		[
			'Max sees AI as a tool, not a magic wand.',
			"So it won't fix our meeting schedule?",
			"He uses it a lot, but it isn't free. Think of the electricity.",
			'There goes my entire prompt.',
		],
		[
			'Max always pushed for workshops to teach the juniors.',
			'Teaching good engineering, not just syntax?',
			'Exactly. He loves learning new things and passing them on.',
			"Finally, a workshop that isn't just about the biscuits.",
		],
	],
};
