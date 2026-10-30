import { expect, test, type Page } from '@playwright/test';

// Two separate browser contexts (two visitors) join the live room and see each other.
// All model endpoints are intercepted; the room itself is the real local Durable Object.

async function intercept(page: Page) {
	await page.route('**/api/suggestions**', (route) =>
		route.fulfill({ json: { suggestions: ['What does Max build?'] } }),
	);
	await page.route('**/api/lab/quest/chat', (route) =>
		route.fulfill({ status: 503, json: { message: 'Offline smoke test.' } }),
	);
	await page.route('**/api/lab/quest/world**', (route) =>
		route.request().method() === 'GET'
			? route.continue()
			: route.fulfill({ status: 503, json: { message: 'Offline smoke test.' } }),
	);
}

type BusHandle = {
	warpTo(target: { kind: 'cell'; x: number; y: number }): void;
	visitors: Map<string, { x: number; y: number }>;
};

test('two visitors see each other walk around the office', async ({ browser }) => {
	test.setTimeout(180_000);
	const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
	const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
	const errors: string[] = [];
	for (const page of [a, b]) {
		page.on('pageerror', (error) => errors.push(error.message));
		await intercept(page);
	}
	await Promise.all([a.goto('/'), b.goto('/')]);
	for (const page of [a, b]) {
		await expect(page.locator('[class*="veil"][data-ready="true"]')).toBeAttached({
			timeout: 90_000,
		});
		await expect(page.locator('[data-presence="live"]')).toHaveAttribute(
			'data-count',
			'2',
			{
				timeout: 30_000,
			},
		);
		await expect(page.getByText('2 visitors here')).toBeVisible();
	}

	// The dev-only bus handle lets the test move a visitor deterministically.
	if (!process.env.PLAYWRIGHT_TEST_PRODUCTION) {
		const spot = await a.evaluate(() => {
			const bus = (window as unknown as { __questBus: BusHandle }).__questBus;
			bus.warpTo({ kind: 'cell', x: 3, y: 3 });
			return { x: 3.5, y: 3.5 };
		});
		await expect
			.poll(
				() =>
					b.evaluate(({ x, y }) => {
						const bus = (window as unknown as { __questBus: BusHandle }).__questBus;
						return [...bus.visitors.values()].some(
							(v) => Math.hypot(v.x - x, v.y - y) < 0.5,
						);
					}, spot),
				{ timeout: 20_000 },
			)
			.toBe(true);
	}

	// A wave goes out without errors; then A leaves and B is alone again.
	await a.getByRole('button', { name: 'Wave' }).click();
	await contexts[0].close();
	await expect(b.locator('[data-presence="live"]')).toHaveAttribute('data-count', '1', {
		timeout: 30_000,
	});
	await expect(b.getByText('Just you here')).toBeVisible();
	expect(errors).toEqual([]);
	await contexts[1].close();
});
