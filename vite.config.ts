import { paraglideVitePlugin } from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';
// import { searchForWorkspaceRoot } from 'vite';

// pdf.js serves its worker through an unqueryable URL and Vite transforms it.
// pdf.worker.min.mjs contains a non-literal dynamic import, so import analysis
// prepends `/@vite/client` to the worker. Svelte's inspector hook then runs inside
// the worker and crashes on `document` (Vite issue #23925). Serve the worker raw
// in dev so no HMR client is injected; production already emits it as an asset.
function pdfWorkerRaw(): Plugin {
	const require = createRequire(import.meta.url);
	const source = readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'));

	return {
		name: 'pdf-worker-raw',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const [pathname, query] = (req.url ?? '').split('?');
				if (!pathname.endsWith('/pdf.worker.min.mjs') || query) return next();
				res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
				res.end(source);
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		pdfWorkerRaw(),
		devtoolsJson(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
	],
	server: {
		allowedHosts: ['asta-dev.dra.my.id']
	},
	optimizeDeps: {
		exclude: [
			'@docx-editor.dev/core',
			'@docx-editor.dev/docx-to-markdown',
			'@docx-editor.dev/fonts'
		]
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	},
	build: {
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 1000 // in kB, e.g., 1000 kB
	}
});
