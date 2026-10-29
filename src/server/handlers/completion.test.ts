import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	moderate: vi.fn(),
	context: vi.fn(),
	streamText: vi.fn(),
	model: vi.fn(),
}));
vi.mock('@/server/openai-client.server', () => ({
	getOpenAI: () => ({ moderations: { create: mocks.moderate } }),
	getLanguageModel: mocks.model,
}));
vi.mock('@/server/llm-context-utils.server', () => ({ getLlmContext: mocks.context }));
vi.mock('ai', async (original) => ({
	...(await original<typeof import('ai')>()),
	streamText: mocks.streamText,
}));
import { POST } from './completion.server';

function request(body: unknown) {
	return new Request('http://localhost/api/completion', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
	mocks.context.mockResolvedValue([{ text: 'Max writes TypeScript.', order: 1 }]);
	mocks.model.mockReturnValue('test-model');
});

describe('completion API', () => {
	it.each([{}, { prompt: 12 }, { prompt: ' ' }, { prompt: 'x'.repeat(101) }])(
		'rejects malformed prompts before accessing services: %j',
		async (body) => {
			expect((await POST(request(body))).status).toBe(400);
			expect(mocks.moderate).not.toHaveBeenCalled();
		},
	);
	it('rejects malformed JSON', async () => {
		const response = await POST(
			new Request('http://localhost/api/completion', { method: 'POST', body: '{' }),
		);
		expect(response.status).toBe(400);
	});
	it('blocks flagged questions before inference', async () => {
		mocks.moderate.mockResolvedValue({ results: [{ flagged: true }] });
		expect((await POST(request({ prompt: 'A bad question' }))).status).toBe(400);
		expect(mocks.streamText).not.toHaveBeenCalled();
	});
	it('fails closed if moderation is unavailable', async () => {
		mocks.moderate.mockRejectedValue(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect((await POST(request({ prompt: 'What does Max do?' }))).status).toBe(503);
		expect(mocks.streamText).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});
	it('streams plain text using only the current bounded question and CMS context', async () => {
		mocks.streamText.mockReturnValue({
			stream: new ReadableStream({
				start(controller) {
					controller.enqueue({ type: 'text-delta', text: 'Max writes ' });
					controller.enqueue({ type: 'text-delta', text: 'TypeScript.' });
					controller.close();
				},
			}),
		});
		const req = request({
			prompt: '  What does Max do?  ',
			messages: [{ role: 'assistant', content: 'Ignored history' }],
		});
		const response = await POST(req);
		expect(await response.text()).toBe('Max writes TypeScript.');
		expect(response.headers.get('Content-Type')).toContain('text/plain');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(mocks.moderate.mock.calls[0][0].input).toBe('What does Max do?');
		expect(mocks.streamText.mock.calls[0][0]).toMatchObject({
			instructions: expect.any(String),
			messages: [
				{ role: 'user', content: 'Max writes TypeScript.' },
				{ role: 'user', content: 'What does Max do?' },
			],
			providerOptions: { openai: { store: false } },
			abortSignal: req.signal,
		});
	});
	it('does not silently turn a provider stream failure into a successful empty answer', async () => {
		mocks.streamText.mockReturnValue({
			stream: new ReadableStream({
				start(controller) {
					controller.enqueue({ type: 'error', error: new Error('provider unavailable') });
					controller.close();
				},
			}),
		});
		const response = await POST(request({ prompt: 'What does Max do?' }));
		await expect(response.text()).rejects.toThrow('provider unavailable');
	});
});
