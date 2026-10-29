import { defaultBrief, DEFAULT_SEED } from './default-world';
import { hashString } from './random';
import type { Brief, CastCharacter, Activity, ZoneKind } from './schema';

/*
 * Offline variety: hand-written briefs for offices laid out without the model.
 *
 * Contract: the canonical office (Byte & Biscuit on DEFAULT_SEED) is what a first visit sees
 * until someone redeploys, and what ?world=default always shows. A bare ?seed=N lays out
 * another floorplan and picks its company, event and cast from this pool by the seed, so
 * previewing seeds (or any other offline fallback) does not make every office the same
 * startup. DEFAULT_SEED keeps the canonical brief.
 */

const zone = (kind: ZoneKind, name: string, story: string) => ({ kind, name, story });
const cast = (name: string, character: CastCharacter, zone: ZoneKind, activity: Activity, line: string) => ({
	name,
	character,
	zone,
	activity,
	line,
	look: null,
});

export const offlineBriefs: Brief[] = [
	defaultBrief,
	{
		company: 'Tabula Rasa Labs',
		tagline: 'Rewriting it in Rust since last Tuesday.',
		vibe: 'startup',
		timeOfDay: 'dusk',
		outside: 'rain',
		opening: 'Rain taps on the windows while the walls of a very ambitious startup snap together.',
		zones: [
			zone('reception', 'Front Door Merge', 'A reception desk rolls in, already asking for your GitHub.'),
			zone('desks', 'The Borrow Checker', 'Desks line up, every monitor showing the same compiler error.'),
			zone('meetup', 'The Pitch Pit', 'A tiny stage appears, the projector stuck on slide one.'),
			zone('library', 'The Crate Shelf', 'Shelves fill up with books about lifetimes nobody finished.'),
			zone('server', 'The Ferris Wheel', 'Racks blink on; the little black box hums a little too loudly.'),
			zone('games', 'Retro Arena', 'A ping-pong table unfolds, paddles labelled "prod" and "staging".'),
			zone('coffee', 'Unsafe Block Café', 'The espresso machine compiles its first shot. Warnings only.'),
			zone('lounge', 'Idle Thread', 'Beanbags flop down beside a lamp nobody can switch off.'),
			zone('meeting', 'The Async Room', 'A glass room appears for meetings that should have been a PR comment.'),
		],
		landmarks: {
			max: "Max's Desk",
			library: 'The Docs Crate',
			stage: 'The Pitch Pit Stage',
			questboard: 'The Issue Tracker',
			worldforge: 'The Build Box',
		},
		event: {
			kind: 'pingpong',
			title: 'The Great Ping-Pong Retro',
			story: 'A ping-pong final instead of a retro. Everyone agrees it is more productive.',
		},
		cast: [
			cast('Ines', 'barista', 'coffee', 'serving', 'Flat white, oat, borrowed not moved.'),
			cast('Tomasz', 'dev_glasses', 'desks', 'typing', 'It compiles. I do not trust it, but it compiles.'),
			cast('Ada', 'designer', 'desks', 'typing', 'I gave the error messages a nicer font. They are still errors.'),
			cast('Kofi', 'dev_hoodie', 'games', 'gaming', 'Best of five. Then best of seven. Then I will review your PR.'),
			cast('Lena', 'manager', 'meeting', 'meeting', 'Let us take this offline. We are already offline.'),
			cast('Jun', 'intern', 'games', 'attending', 'I bet my lunch on Kofi. I am going to be hungry.'),
			cast('Rafa', 'dev_slacker', 'server', 'fixing', 'The build box needs a hug and a reboot. In that order.'),
			cast('Pip', 'office_cat', 'lounge', 'napping', '*opens one eye* Mrrp. *closes it again*'),
		],
		closing: 'The rain keeps going, the build stays green, and the paddles are out. Come on in!',
	},
	{
		company: 'Cache Me Outside',
		tagline: 'Fast responses, slow mornings.',
		vibe: 'cozy',
		timeOfDay: 'day',
		outside: 'snow',
		opening: 'Snow drifts past the windows as a warm little office clicks into place.',
		zones: [
			zone('reception', 'The Warm Welcome', 'A reception desk appears with a bowl of slightly melted chocolates.'),
			zone('desks', 'The Hot Path', 'Desks slide together, each with a mug already on it.'),
			zone('meetup', 'Fireside Stage', 'A small stage rolls in with a rug that looks suspiciously cosy.'),
			zone('library', 'The Cold Storage', 'Shelves fill up with docs that are, for once, up to date.'),
			zone('server', 'The Warm Cache', 'Racks hum on; it is the warmest room in the building.'),
			zone('kitchen', 'Snack Invalidation', 'The fridge fills up. The cake has a "do not touch" sticky note.'),
			zone('lounge', 'The TTL Lounge', 'Sofas arrive with blankets for anyone with a long compile.'),
			zone('garden', 'The Greenhouse', 'Planters sprout, and a fish tank bubbles in the corner.'),
			zone('phone', 'The Snow Globes', 'Glass booths pop up for calls and quiet hot chocolate.'),
		],
		landmarks: {
			max: "Max's Desk",
			library: 'The Readme Shelf',
			stage: 'The Fireside Stage',
			questboard: 'The Wishlist Board',
			worldforge: 'The Warm Rack',
		},
		event: {
			kind: 'birthday',
			title: 'Happy 5th Birthday, Production Server',
			story: 'Cake in the kitchen: the oldest server in the building turns five.',
		},
		cast: [
			cast('Maren', 'barista', 'kitchen', 'serving', 'Cake is cached. Plates are not. Grab one quickly.'),
			cast('Yusuf', 'dev_glasses', 'desks', 'typing', 'Cache hit rate is 99%. The other 1% is me, asking for coffee.'),
			cast('Sol', 'designer', 'lounge', 'lounging', 'This blanket is part of the design system now.'),
			cast('Bo', 'dev_hoodie', 'kitchen', 'chatting', 'I wrote the birthday card in YAML. It did not parse.'),
			cast('Greta', 'manager', 'desks', 'calling', 'Yes, the server is five. No, we cannot turn it off.'),
			cast('Nia', 'intern', 'kitchen', 'chatting', 'Is it normal to throw a party for a server? I love it here.'),
			cast('Ollie', 'dev_slacker', 'server', 'fixing', 'Happy birthday, old friend. Please do not crash during the song.'),
			cast('Biscotti', 'office_dog', 'lounge', 'wandering', '*sniffs your pocket for cake crumbs* Woof!'),
		],
		closing: 'Snow outside, cake inside, and every cache is warm. Come on in!',
	},
	{
		company: 'Merge Goose Collective',
		tagline: 'Honking at bad commits since the first standup.',
		vibe: 'eco',
		timeOfDay: 'dawn',
		outside: 'clear',
		opening: 'The sun comes up over a leafy co-op office as the walls fold up around it.',
		zones: [
			zone('reception', 'The Pond', 'A reception desk floats in, guarded by a ceramic goose.'),
			zone('desks', 'The Commons', 'Shared desks snap together; plants claim every second one.'),
			zone('meetup', 'The Gaggle Stage', 'A stage appears, honk-proof microphone included.'),
			zone('library', 'The Field Guide', 'Shelves fill up with books on gardening and garbage collection.'),
			zone('server', 'The Nest', 'Racks wake up, solar-powered and slightly smug about it.'),
			zone('garden', 'The Compost Heap', 'Planters sprout ferns and a ficus with its own Slack account.'),
			zone('coffee', 'The Fair Trade Bar', 'The espresso machine steams awake with ethically sourced hisses.'),
			zone('print', 'The Paper Trail', 'The printer arrives, already jammed, already loved.'),
			zone('games', 'The Playground', 'Foosball, chess and a ping-pong table roll into the sun.'),
		],
		landmarks: {
			max: "Max's Desk",
			library: 'The Field Guide Shelf',
			stage: 'The Gaggle Stage',
			questboard: 'The Honk Board',
			worldforge: 'The Solar Rack',
		},
		event: {
			kind: 'hackathon',
			title: 'Hack Night: Ship It Before Breakfast',
			story: 'An all-nighter is winding down: pizza boxes everywhere, one last commit.',
		},
		cast: [
			cast('Clem', 'barista', 'coffee', 'serving', 'Last coffee before sunrise. After that it is just vibes.'),
			cast('Ravi', 'dev_hoodie', 'desks', 'typing', 'One more commit and I sleep. I have said this six times.'),
			cast('Hedda', 'dev_glasses', 'desks', 'typing', 'The goose reviewed my PR. Approved, with a honk.'),
			cast('Ama', 'designer', 'garden', 'reading', 'The ficus asked for a dark mode. I am working on it.'),
			cast('Moss', 'dev_slacker', 'print', 'printing', 'The printer and I have an understanding. It is mostly crying.'),
			cast('Tove', 'manager', 'desks', 'chatting', 'Breakfast demo in ten minutes. Who has a working build?'),
			cast('Kai', 'intern', 'games', 'gaming', 'I am hacking on the high score. It counts as a project.'),
			cast('Honk', 'office_cat', 'garden', 'wandering', '*sits on the warmest laptop* Mrrrp.'),
		],
		closing: 'The sun is up, the build is shipped, and the coffee is fair trade. Come on in!',
	},
	{
		company: 'Off-By-One Studios',
		tagline: 'Our second product is our first. We count from zero.',
		vibe: 'retro',
		timeOfDay: 'night',
		outside: 'cloudy',
		opening: 'The lights flicker on in a late-night studio as the walls snap into place.',
		zones: [
			zone('reception', 'Index Zero', 'A reception desk appears, one tile to the left of where you expected.'),
			zone('desks', 'The Fencepost', 'Desks line up; there is always one more than you counted.'),
			zone('meetup', 'The Demo Scene', 'A stage rolls in, the projector showing a spinning cube.'),
			zone('library', 'The Manual', 'Shelves fill up with manuals for machines that no longer exist.'),
			zone('server', 'The Mainframe', 'Racks power up with a very satisfying clunk.'),
			zone('games', 'The Arcade', 'Arcade cabinets glow on, high scores set by the founders.'),
			zone('kitchen', 'The Stack', 'The fridge hums; the pizza from last night is still there.'),
			zone('lounge', 'The Bean Bag Buffer', 'Beanbags overflow into the corridor. As designed.'),
			zone('meeting', 'War Room', 'A glass room appears with a whiteboard full of arrows.'),
		],
		landmarks: {
			max: "Max's Desk",
			library: 'The Manual Shelf',
			stage: 'The Demo Stage',
			questboard: 'The Bug Board',
			worldforge: 'The Mainframe Rack',
		},
		event: {
			kind: 'deploy',
			title: 'Friday Night Deploy (Against All Advice)',
			story: 'Deploy night: red lights in the server room, everyone huddled at the racks.',
		},
		cast: [
			cast('Dot', 'barista', 'kitchen', 'serving', 'Coffee number nine. Or ten. Off by one, probably.'),
			cast('Ezra', 'dev_slacker', 'server', 'fixing', 'It worked in staging. Staging is a different planet.'),
			cast('Mina', 'dev_glasses', 'server', 'fixing', 'Rolling back. Rolling forward. Rolling my eyes.'),
			cast('Luca', 'dev_hoodie', 'games', 'gaming', 'I am not hiding from the deploy. I am load-testing the arcade.'),
			cast('Priyanka', 'manager', 'meeting', 'presenting', 'Arrow one is the plan. Arrow two is the backup plan. Arrow three is pizza.'),
			cast('Theo', 'designer', 'lounge', 'lounging', 'I designed the error page. It is the most visited page tonight.'),
			cast('Wren', 'intern', 'desks', 'typing', 'I fixed the bug! I may have also made two new ones.'),
			cast('Byte', 'office_dog', 'lounge', 'wandering', '*brings you a squeaky floppy disk* Woof!'),
		],
		closing: 'Late night, red lights and a deploy in progress. Come on in, quietly!',
	},
	{
		company: 'Soft Launch & Co.',
		tagline: 'Launching quietly, celebrating loudly.',
		vibe: 'neon',
		timeOfDay: 'day',
		outside: 'cloudy',
		opening: 'Neon signs buzz awake as a bright little office assembles itself.',
		zones: [
			zone('reception', 'The Waitlist', 'A reception desk appears; you are number 4,012 in line.'),
			zone('desks', 'The Launchpad', 'Desk pods click together, each with a sticker-covered laptop.'),
			zone('meetup', 'Product Hunt Corner', 'A stage rolls in, confetti cannon on standby.'),
			zone('library', 'The Roadmap', 'Shelves fill with roadmaps, each one more optimistic.'),
			zone('server', 'The Scale Room', 'Racks blink on, ready for traffic that may or may not come.'),
			zone('coffee', 'The Beta Bar', 'The espresso machine starts in early access.'),
			zone('phone', 'The Investor Booths', 'Phone booths pop up for very confident calls.'),
			zone('lounge', 'The Growth Lounge', 'Sofas arrive, arranged in a hockey-stick curve.'),
			zone('print', 'The Swag Room', 'The printer appears, buried in stickers and tote bags.'),
		],
		landmarks: {
			max: "Max's Desk",
			library: 'The Roadmap Shelf',
			stage: 'The Launch Stage',
			questboard: 'The Feature Requests',
			worldforge: 'The Scale Rack',
		},
		// An ordinary, pleasantly busy launch week: no event.
		event: { kind: 'none', title: '', story: '' },
		cast: [
			cast('Romy', 'barista', 'coffee', 'serving', 'This latte is in public beta. Feedback welcome.'),
			cast('Femi', 'dev_hoodie', 'desks', 'typing', 'The launch button works. I have pressed it in staging forty times.'),
			cast('Ilse', 'designer', 'desks', 'typing', 'I made the logo pulse. Now it pulses in the dark too.'),
			cast('Arjun', 'manager', 'phone', 'calling', 'Yes, we are pre-revenue. Very enthusiastically pre-revenue.'),
			cast('Zoe', 'dev_glasses', 'server', 'fixing', 'Ready for a million users. Currently serving twelve, and my mum.'),
			cast('Leo', 'intern', 'print', 'printing', 'I printed 500 stickers. The printer has opinions about that.'),
			cast('Kim', 'dev_slacker', 'lounge', 'lounging', 'Launching is mostly waiting. I am very good at waiting.'),
			cast('Sprocket', 'office_dog', 'reception', 'wandering', '*wags at the waitlist* Woof! You are next!'),
		],
		closing: 'The signs are glowing and the waitlist is growing. Come on in!',
	},
];

/** The brief for an office laid out offline on `seed` (see the contract above). */
export function briefForSeed(seed: number): Brief {
	if (seed === DEFAULT_SEED) return defaultBrief;
	return offlineBriefs[hashString(`offline-${seed}`) % offlineBriefs.length];
}
