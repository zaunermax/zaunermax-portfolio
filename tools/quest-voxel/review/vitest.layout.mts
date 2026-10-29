import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
	test: { include: ['tools/quest-voxel/review/layout.report.ts'], environment: 'node', root: fileURLToPath(new URL('../../..', import.meta.url)) },
});
