import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (original) => ({
	...(await original<typeof import('ai')>()),
	generateText: mocks.generateText,
}));
vi.mock('./openai-client.server', () => ({ getLanguageModel: () => 'fake-model' }));
vi.mock('./llm-context-utils.server', () => ({
	getLlmContext: async () => [{ text: 'Public portfolio context', order: 1 }],
}));
import { generateSuggestions } from './generate-suggestions.server';

const entries = new Map<string, Response>();
beforeEach(() => {
	entries.clear();
	mocks.generateText
		.mockReset()
		.mockResolvedValue({ output: { questions: ['One?', 'Two?', 'Three?'] } });
	vi.stubGlobal('caches', {
		default: {
			match: async (request: Request) => entries.get(request.url)?.clone(),
			put: async (request: Request, response: Response) => {
				entries.set(request.url, response);
			},
		},
	});
});
afterEach(() => vi.unstubAllGlobals());

it('caches each mode for 300 seconds and POST refresh replaces the cached result', async () => {
	expect(await generateSuggestions('short')).toEqual(['One?', 'Two?', 'Three?']);
	await generateSuggestions('short');
	expect(mocks.generateText).toHaveBeenCalledTimes(1);
	expect([...entries.values()][0].headers.get('Cache-Control')).toBe(
		'public, max-age=300',
	);
	await generateSuggestions('long');
	expect(mocks.generateText).toHaveBeenCalledTimes(2);
	mocks.generateText.mockResolvedValue({
		output: { questions: ['Fresh?', 'New?', 'Next?'] },
	});
	await generateSuggestions('short', true);
	expect(await generateSuggestions('short')).toEqual(['Fresh?', 'New?', 'Next?']);
	expect(mocks.generateText).toHaveBeenCalledTimes(3);
});
