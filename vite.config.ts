import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
	server: {
		host: '0.0.0.0',
		port: 3000,
		allowedHosts: ['.preview.oekoho.me'],
		watch: { ignored: ['**/.wrangler/**'] },
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflare({
			viteEnvironment: { name: 'ssr' },
			config(config) {
				// Load every local .dev.vars key; production still requires OPENAI_API_KEY.
				if (command === 'serve') delete config.secrets;
			},
		}),
		tanstackStart({ server: { entry: './start-server' } }),
		react(),
		babel({ presets: [reactCompilerPreset({ target: '19' })] }),
		tailwindcss(),
	],
}));
