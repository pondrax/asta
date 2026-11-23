import { paraglideVitePlugin } from '@inlang/paraglide-js';
import autoAdapter from '@sveltejs/adapter-auto';
import bunAdapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';

// Third-party build noise that is safe to ignore: docx-editor's Node-only dynamic
// imports, lottie-web's eval, and the oversized docx chunk.
const IGNORED_BUILD_WARNINGS = [
	'has been externalized for browser compatibility',
	'Use of direct `eval`',
	'Some chunks are larger than'
];

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
		sveltekit({
			preprocess: vitePreprocess(),
			// adapter-auto has no Bun detection; local Bun builds must ask for it explicitly.
			adapter: process.versions.bun && !process.env.VERCEL ? bunAdapter() : autoAdapter(),
			experimental: { remoteFunctions: true },
			compilerOptions: { experimental: { async: true } },
			csrf: { trustedOrigins: ['*'] },
			version: {
				name: execFileSync('git', ['rev-parse', 'HEAD'], { env: { ...process.env, PATH: '/usr/bin:/bin' } }).toString().trim(),
				pollInterval: 60_000
			},
			inspector: { toggleKeyCombo: 'alt-x' }
		}),
		pdfWorkerRaw(),
		devtoolsJson(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
	],
	server: {
		allowedHosts: ['asta-dev.dra.my.id', 'asta.dra.my.id']
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
		chunkSizeWarningLimit: 1000, // in kB, e.g., 1000 kB
		rolldownOptions: {
			onLog(level, log, defaultHandler) {
				if (level === 'warn' && IGNORED_BUILD_WARNINGS.some((text) => log.message.includes(text))) return;
				defaultHandler(level, log);
			}
		}
	}
});
