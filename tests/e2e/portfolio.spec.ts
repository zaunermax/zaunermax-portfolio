import { expect, test } from '@playwright/test';

const suggestions = [
	'What does Max build?',
	'What languages does Max use?',
	'What does Max enjoy?',
];
test.beforeEach(async ({ page }) => {
	await page.route('**/api/suggestions?*', (route) =>
		route.fulfill({ json: { suggestions } }),
	);
});

test('terminal submits one question at a time, renders answers, and keeps history out of requests', async ({
	page,
}) => {
	const requests: Record<string, unknown>[] = [];
	await page.route('**/api/completion', async (route) => {
		requests.push(route.request().postDataJSON());
		await new Promise((resolve) => setTimeout(resolve, 250));
		await route.fulfill({
			contentType: 'text/plain; charset=utf-8',
			body: 'Max builds software.\nHe enjoys TypeScript.',
		});
	});
	await page.goto('/query?q=What%20does%20Max%20build%3F');
	await expect(page.getByText('He enjoys TypeScript.', { exact: false })).toBeVisible();
	const input = page.getByRole('textbox', { name: /Type a question/ });
	await expect(input).toBeEnabled();
	await input.fill('What else does he like?');
	await input.press('Enter');
	await expect.poll(() => requests.length).toBe(2);
	await expect(input).toBeEnabled();
	expect(requests).toEqual([
		{ prompt: 'What does Max build?' },
		{ prompt: 'What else does he like?' },
	]);
	await expect(page.getByText('Max builds software.', { exact: false })).toHaveCount(2);
	await expect(input).toHaveAttribute('autocomplete', 'off');
	await page.getByRole('link', { name: 'talks', exact: true }).click();
	await page.getByRole('link', { name: 'query', exact: true }).click();
	await expect(page.getByText('Max builds software.', { exact: false })).toHaveCount(2);
});

test('terminal displays a service error and accepts the next question', async ({
	page,
}) => {
	let calls = 0;
	await page.route('**/api/completion', (route) => {
		calls++;
		return calls === 1
			? route.fulfill({ status: 503, json: { message: 'Please try again' } })
			: route.fulfill({ contentType: 'text/plain', body: 'Recovered answer' });
	});
	await page.goto('/query');
	const input = page.getByRole('textbox', { name: /Type a question/ });
	await input.fill('What does Max build?');
	await input.press('Enter');
	await expect(page.getByText('Please try again', { exact: true })).toBeVisible();
	await input.fill('What does Max enjoy?');
	await input.press('Enter');
	await expect(page.getByText('Recovered answer', { exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark']) {
	for (const width of [390, 1440, 1920]) {
		test(`terminal and GitHub file views retain geometry: ${theme}, ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 1000 });
			await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
			for (const path of [
				'/query',
				'/wiki/README.md',
				'/talks',
				'/talks/react-compiler',
			]) {
				await page.goto(path);
				await expect(page.locator('html')).toHaveClass(
					theme === 'dark' ? /dark/ : /light/,
				);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
				).toBeLessThanOrEqual(width);
				const surface = page
					.locator(
						path === '/query'
							? '[class*="bg-terminal-body-light"]'
							: '[class*="bg-wiki-body-light"]',
					)
					.first();
				await expect(surface).toBeVisible();
				const appearance = await surface.evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						border: style.borderTopWidth,
						radius: style.borderRadius,
						background: style.backgroundColor,
					};
				});
				// v3 ignored mt-15; v4 interprets it as 60px, which shifts these panels.
				if (path === '/query' || path === '/wiki/README.md' || path === '/talks') {
					expect((await surface.boundingBox())?.y).toBe(width < 768 ? 80 : 112);
				}
				expect(appearance.border).toBe('1px');
				expect(appearance.radius).toBe('8px');
				expect(appearance.background).toBe(
					theme === 'light'
						? 'rgb(255, 255, 255)'
						: path === '/query'
							? 'rgb(30, 30, 30)'
							: 'rgb(13, 17, 23)',
				);
			}
		});
	}
}

test('terminal renders partial text before the stream finishes', async ({ page }) => {
	await page.addInitScript(() => {
		const originalFetch = window.fetch;
		window.fetch = async (input, init) => {
			if (typeof input === 'string' && input === '/api/completion') {
				const encoder = new TextEncoder();
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(encoder.encode('A partial answer'));
							setTimeout(() => {
								controller.enqueue(encoder.encode(' is now complete.'));
								controller.close();
							}, 1500);
						},
					}),
					{ headers: { 'Content-Type': 'text/plain' } },
				);
			}
			return originalFetch(input, init);
		};
	});
	await page.goto('/query');
	const input = page.getByRole('textbox', { name: /Type a question/ });
	await input.fill('What does Max build?');
	await input.press('Enter');
	await expect(page.getByRole('status', { name: 'Answering' })).toContainText(
		'A partial answer',
	);
	await expect(input).toBeDisabled();
	await expect(
		page.getByText('A partial answer is now complete.', { exact: true }),
	).toBeVisible();
	await expect(input).toBeEnabled();
	await expect(input).toBeFocused();
});

test('suggestion failures leave the terminal usable and reload requests fresh examples', async ({
	page,
}) => {
	const methods: string[] = [];
	await page.route('**/api/suggestions?*', (route) => {
		methods.push(route.request().method());
		return route.request().method() === 'GET'
			? route.fulfill({ status: 503, json: { message: 'Offline' } })
			: route.fulfill({ json: { suggestions } });
	});
	await page.goto('/query');
	await expect(
		page.getByText('Examples are unavailable. You can still ask a question.'),
	).toBeVisible();
	await expect(page.getByRole('textbox', { name: /Type a question/ })).toBeEnabled();
	await page.getByRole('button', { name: 'reload them' }).click();
	await expect(page.getByText('What does Max enjoy?', { exact: true })).toBeVisible();
	expect(methods).toContain('GET');
	expect(methods.at(-1)).toBe('POST');
});
