import { expect, test } from '@playwright/test';

// The pages may read Sanity and world state. All model endpoints are intercepted.
test.beforeEach(async ({ page }) => {
	await page.route('**/api/suggestions**', (route) => route.fulfill({
		json: { suggestions: ['What does Max build?', 'How does Max work?', 'Can I hire Max?'] },
	}));
	await page.route('**/api/completion', (route) => route.fulfill({
		contentType: 'text/plain; charset=utf-8', body: 'Max builds web products.',
	}));
	await page.route('**/api/lab/quest/chat', (route) => route.fulfill({ status: 503, json: { message: 'Offline smoke test.' } }));
	await page.route('**/api/lab/quest/contact', (route) => route.fulfill({ status: 503, json: { ok: false, message: 'Offline smoke test.' } }));
	await page.route('**/api/lab/quest/world**', (route) => route.request().method() === 'GET'
		? route.continue()
		: route.fulfill({ status: 503, json: { message: 'Offline smoke test.' } }));
});

test('Quest streams its shell, hydrates the canvas and loads the original GLBs', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const glbs = new Set<string>();
	page.on('response', (response) => {
		if (response.url().includes('/lab/quest/') && response.url().includes('.glb') && response.ok()) glbs.add(new URL(response.url()).pathname);
	});
	await page.goto('/');
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	await expect(page.locator('[aria-label^="A 3D office of"] canvas')).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => glbs.size, { timeout: 60_000 }).toBe(3);
	await expect(page.locator('[class*="veil"][data-ready="true"]')).toBeAttached({ timeout: 60_000 });
	await expect(page.getByRole('img', { name: /^A 3D office of / })).toBeVisible();
	expect(errors).toEqual([]);
});

test('maxOS hydrates its desktop and uses the plain text completion stream', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/os');
	await expect(page.getByRole('menubar', { name: 'maxOS' })).toBeVisible();
	await expect(page.locator('[data-app-icon="terminal"]')).toBeVisible();
	await page.locator('[data-app-icon="terminal"]').dblclick();
	const input = page.getByRole('textbox').first();
	await input.fill('What does Max build?');
	await input.press('Enter');
	await expect(page.getByText('Max builds web products.')).toBeVisible();
	expect(errors).toEqual([]);
});
