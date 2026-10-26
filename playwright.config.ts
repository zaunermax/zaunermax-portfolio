import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
	webServer: {
		command: process.env.PLAYWRIGHT_TEST_PRODUCTION
			? 'pnpm start -p 3100 -H 127.0.0.1'
			: 'pnpm dev -p 3100 -H 127.0.0.1',
		url: 'http://127.0.0.1:3100/query',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
