import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
	parseBody: vi.fn(),
	revalidateTag: vi.fn(),
	revalidatePath: vi.fn(),
}));
vi.mock('next-sanity/webhook', () => ({ parseBody: mocks.parseBody }));
vi.mock('next/cache', () => ({
	revalidateTag: mocks.revalidateTag,
	revalidatePath: mocks.revalidatePath,
}));
import { POST } from './route';

const request = () =>
	new NextRequest('http://localhost/api/revalidate', { method: 'POST' });
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('SANITY_REVALIDATE_SECRET', 'test-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('Sanity cache invalidation', () => {
	it('requires a configured secret', async () => {
		vi.stubEnv('SANITY_REVALIDATE_SECRET', '');
		expect((await POST(request())).status).toBe(503);
		expect(mocks.parseBody).not.toHaveBeenCalled();
	});
	it('rejects invalid signatures without invalidating data', async () => {
		mocks.parseBody.mockResolvedValue({
			isValidSignature: false,
			body: { _type: 'wiki-page' },
		});
		expect((await POST(request())).status).toBe(401);
		expect(mocks.revalidateTag).not.toHaveBeenCalled();
	});
	it('rejects missing document types', async () => {
		mocks.parseBody.mockResolvedValue({ isValidSignature: true, body: {} });
		expect((await POST(request())).status).toBe(400);
		expect(mocks.revalidateTag).not.toHaveBeenCalled();
	});
	it('immediately expires CMS tags and the matching dynamic page', async () => {
		mocks.parseBody.mockResolvedValue({
			isValidSignature: true,
			body: { _type: 'wiki-page' },
		});
		expect((await POST(request())).status).toBe(200);
		expect(mocks.revalidateTag).toHaveBeenCalledWith('wiki-page', { expire: 0 });
		expect(mocks.revalidatePath).toHaveBeenCalledWith('/wiki/[slug]', 'page');
	});
});
