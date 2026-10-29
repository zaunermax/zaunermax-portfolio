import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default [
	{ ignores: ['.next/**', '.data/**', 'tools/quest-voxel/out/**', 'dist/**', '.wrangler/**', '.migration-research/**', 'node_modules/**', 'src/routeTree.gen.ts', 'worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	hooks.configs.flat.recommended,
	a11y.flatConfigs.recommended,
	// Retained app containers manage window focus; their children own keyboard actions.
	{ files: ['src/maxos/talks-app.tsx', 'src/maxos/terminal-app.tsx'], rules: {
		'jsx-a11y/no-static-element-interactions': 'off',
		'jsx-a11y/click-events-have-key-events': 'off',
	} },
	{ files: ['src/maxos/window-frame.tsx'], rules: { 'jsx-a11y/no-noninteractive-element-interactions': 'off' } },
	{ files: ['src/quest/ui/chat-log.tsx'], rules: { 'jsx-a11y/no-noninteractive-tabindex': 'off' } },
	// Removing control characters is the sanitizer's explicit job.
	{ files: ['src/quest/chat/sanitize.server.ts'], rules: { 'no-control-regex': 'off' } },
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{ files: ['**/*.mjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];
