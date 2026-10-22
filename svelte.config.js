import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import * as child_process from 'node:child_process';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  kit: { // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    experimental: {
      remoteFunctions: true
    },
    adapter: adapter(),
    csrf: {
      trustedOrigins: ['*'],
    },

    version: {
      name: child_process.execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
      // Poll the server for a new release so an open tab can tell the user
      // that a reload will pick up the latest deploy.
      pollInterval: 60_000
    }
  },
  compilerOptions: {
    experimental: {
      async: true,
    }
  },
  vitePlugin: {
    inspector: {
      toggleKeyCombo: 'alt-x',
    }
  },
};

export default config;
