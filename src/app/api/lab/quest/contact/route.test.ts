import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	moderate: vi.fn(),
	rateLimit: vi.fn(),
	realRateLimit:
		undefined as unknown as typeof import('@/app/(lab)/lab/1-quest/server/rate-limit').rateLimit,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-only/openai-client', () => ({
	openai: { moderations: { create: mocks.moderate } },
}));
vi.mock('@/lib/sanity-client', () => ({ sanityFetch: vi.fn() }));
vi.mock('@/app/(lab)/lab/1-quest/server/rate-limit', async (original) => {
	const actual =
		await original<typeof import('@/app/(lab)/lab/1-quest/server/rate-limit')>();
	mocks.realRateLimit = actual.rateLimit;
	return { ...actual, rateLimit: mocks.rateLimit };
});

import { POST } from './route';

let ipCounter = 0;
let ip = '';
let outboxRoot = '';
const fetchMock = vi.fn();

const valid = () => ({
	title: 'Shop rebuild',
	name: 'Ada Lovelace',
	email: 'ada@example.com',
	company: 'Analytical Engines',
	summary: 'We want to rebuild our online shop with Next.js and add search.',
	timeline: 'Q1 2027',
	budget: '20k',
	website: '',
	elapsedMs: 45_000,
});

function request(body: unknown, contentType = 'application/json') {
	return new Request('http://localhost/api/lab/quest/contact', {
		method: 'POST',
		headers: { 'content-type': contentType, 'x-forwarded-for': ip },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

async function outboxFiles() {
	const dir = path.join(outboxRoot, '.data', 'quest', 'outbox');
	return readdir(dir).catch(() => [] as string[]);
}

function useResend() {
	vi.stubEnv('RESEND_API_KEY', 're_test_key');
	vi.stubEnv('CONTACT_FROM_EMAIL', 'Quest board <quest@zaunermax.at>');
	vi.stubEnv('CONTACT_TO_EMAIL', 'inbox@zaunermax.at');
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }),
	);
}

function sentEmail() {
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0];
	return { url, init, body: JSON.parse(init.body as string) };
}

beforeEach(async () => {
	vi.clearAllMocks();
	ip = `10.1.0.${++ipCounter}`;
	outboxRoot = await mkdtemp(path.join(tmpdir(), 'quest-outbox-'));
	vi.spyOn(process, 'cwd').mockReturnValue(outboxRoot);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.stubGlobal('fetch', fetchMock);
	vi.stubEnv('RESEND_API_KEY', '');
	vi.stubEnv('CONTACT_FROM_EMAIL', '');
	vi.stubEnv('CONTACT_TO_EMAIL', '');
	vi.stubEnv('NODE_ENV', 'production');
	mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
	mocks.rateLimit.mockImplementation(mocks.realRateLimit);
});
afterEach(async () => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await rm(outboxRoot, { recursive: true, force: true });
});

describe('quest contact API: spam guards and validation', () => {
	it('rejects a filled honeypot without sending', async () => {
		useResend();
		const response = await POST(request({ ...valid(), website: 'https://spam.example' }));
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body).toEqual({ ok: false, message: expect.stringMatching(/spam guard/) });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mocks.rateLimit).not.toHaveBeenCalled();
	});

	it('rejects scrolls sent faster than a person can read them', async () => {
		useResend();
		const response = await POST(request({ ...valid(), elapsedMs: 800 }));
		expect(response.status).toBe(400);
		expect((await response.json()).message).toMatch(/quick/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('tells the visitor which fields to fix', async () => {
		const response = await POST(
			request({ ...valid(), email: 'not-an-email', summary: 'too short' }),
		);
		expect(response.status).toBe(400);
		const { message } = await response.json();
		expect(message).toContain('valid email address');
		expect(message).toContain('20 to 1500 characters');
		expect(message).not.toContain('title');
	});

	it.each([
		['header injection in the email', 'ada@example.com\r\nBcc: victim@example.com'],
		['a display name', 'Ada <ada@example.com>'],
		['two addresses', 'ada@example.com,eve@example.com'],
	])('rejects %s', async (_, email) => {
		useResend();
		const response = await POST(request({ ...valid(), email }));
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects malformed JSON, missing fields and non-JSON bodies', async () => {
		expect((await POST(request('{'))).status).toBe(400);
		expect((await POST(request({ title: 'Hi' }))).status).toBe(400);
		expect((await POST(request(valid(), 'text/plain'))).status).toBe(400);
	});
});

describe('quest contact API: sending', () => {
	it('sends a plain-text email through Resend to the fixed recipient', async () => {
		useResend();
		const response = await POST(request(valid()));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		const { url, init, body } = sentEmail();
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test_key' });
		expect(Object.keys(body).sort()).toEqual([
			'from',
			'reply_to',
			'subject',
			'text',
			'to',
		]);
		expect(body).toMatchObject({
			from: 'Quest board <quest@zaunermax.at>',
			to: ['inbox@zaunermax.at'],
			reply_to: 'ada@example.com',
			subject: 'Quest: Shop rebuild',
		});
		for (const value of [
			'Ada Lovelace',
			'Analytical Engines',
			'Q1 2027',
			'20k',
			'add search',
		]) {
			expect(body.text).toContain(value);
		}
	});

	it('falls back to the business email as recipient', async () => {
		useResend();
		vi.stubEnv('CONTACT_TO_EMAIL', '');
		await POST(request(valid()));
		expect(sentEmail().body.to).toEqual(['hello@zaunermax.at']);
	});

	it('strips CR/LF and control characters from the subject and single-line fields', async () => {
		useResend();
		const response = await POST(
			request({
				...valid(),
				title: 'Hi\r\nBcc: victim@example.com',
				name: 'Ada\nTo: victim@example.com\u0007',
			}),
		);
		expect(response.status).toBe(200);
		const { body } = sentEmail();
		expect(body.subject).toBe('Quest: Hi Bcc: victim@example.com');
		expect(body.subject).not.toMatch(/[\r\n]/);
		expect(body.to).toEqual(['inbox@zaunermax.at']);
		expect(body).not.toHaveProperty('bcc');
		expect(body.text).toContain('Name:     Ada To: victim@example.com\n');
		expect(body.text).not.toContain('\u0007');
	});

	it('rejects flagged content and still sends when moderation is down', async () => {
		useResend();
		mocks.moderate.mockResolvedValueOnce({ results: [{ flagged: true }] });
		expect((await POST(request(valid()))).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();

		mocks.moderate.mockRejectedValueOnce(new Error('offline'));
		expect((await POST(request(valid()))).status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports a Resend failure without claiming success', async () => {
		useResend();
		fetchMock.mockResolvedValue(
			new Response('{"message":"domain not verified"}', { status: 403 }),
		);
		const response = await POST(request(valid()));
		expect(response.status).toBe(503);
		expect((await response.json()).message).toMatch(/hello@zaunermax\.at/);
	});

	it('writes to the dev outbox when no API key is set in development', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const response = await POST(request(valid()));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(fetchMock).not.toHaveBeenCalled();
		const files = await outboxFiles();
		expect(files).toHaveLength(1);
		const email = JSON.parse(
			await readFile(path.join(outboxRoot, '.data', 'quest', 'outbox', files[0]), 'utf8'),
		);
		expect(email).toMatchObject({
			to: ['hello@zaunermax.at'],
			reply_to: 'ada@example.com',
			subject: 'Quest: Shop rebuild',
		});
	});

	it('refuses with 503 in production when sending is not configured', async () => {
		const response = await POST(request(valid()));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			ok: false,
			message: 'Sending is not set up yet. Email Max directly at hello@zaunermax.at.',
		});
		expect(await outboxFiles()).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('quest contact API: rate limits', () => {
	it('allows three scrolls per IP per day', async () => {
		useResend();
		for (let index = 0; index < 3; index++) {
			expect((await POST(request(valid()))).status).toBe(200);
		}
		const response = await POST(request(valid()));
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBeTruthy();
		expect((await response.json()).message).toMatch(/limit/);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('enforces the global daily cap', async () => {
		useResend();
		mocks.rateLimit.mockImplementation((key: string) =>
			key === 'quest-contact:global'
				? { ok: false, retryAfterSeconds: 60 }
				: { ok: true },
		);
		const response = await POST(request(valid()));
		expect(response.status).toBe(429);
		expect((await response.json()).message).toMatch(/email Max directly/);
		expect(mocks.rateLimit).toHaveBeenCalledWith(
			'quest-contact:global',
			40,
			24 * 60 * 60_000,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
