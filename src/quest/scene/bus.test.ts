import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameBus } from './bus';

afterEach(() => vi.restoreAllMocks());

describe('GameBus speech', () => {
	it('keeps one bubble while someone keeps talking, and a fresh one after a pause', () => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		const bus = new GameBus();
		bus.say('a', 'Hello.', 1000);
		const first = bus.getSpeech().get('a')!.run;
		now = 500;
		bus.say('a', 'And another thing.', 1000);
		expect(bus.getSpeech().get('a')).toMatchObject({ text: 'And another thing.', run: first });
		now = 3000;
		bus.say('a', 'Me again.', 1000);
		expect(bus.getSpeech().get('a')!.run).not.toBe(first);
	});

	it('holds a line that is still showing, never one that has ended', () => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		const bus = new GameBus();
		bus.say('a', 'Hello.', 1000);
		bus.holdSpeech('a', 5000);
		expect(bus.getSpeech().get('a')!.until).toBe(5000);
		now = 6000;
		bus.holdSpeech('a', 9000);
		expect(bus.getSpeech().get('a')!.until).toBe(5000);
	});
});

describe('GameBus goal', () => {
	it('tells the HUD when the walk target changes, not on every frame that repeats it', () => {
		const bus = new GameBus();
		const heard = vi.fn();
		bus.subscribeGoal(heard);
		const goal = { kind: 'landmark', id: 'library' } as const;
		bus.setGoal(goal);
		bus.setGoal(goal);
		expect(heard).toHaveBeenCalledTimes(1);
		expect(bus.getGoal()).toBe(goal);
		bus.setGoal(null);
		expect(heard).toHaveBeenCalledTimes(2);
	});
});
