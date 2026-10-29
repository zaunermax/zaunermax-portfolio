import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL,
		trace: 'retain-on-failure',
		launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
	},
	webServer: {
		command: process.env.PLAYWRIGHT_TEST_PRODUCTION
			? 'pnpm preview --host 127.0.0.1 --port 3100'
			: 'pnpm dev --host 127.0.0.1 --port 3100',
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
