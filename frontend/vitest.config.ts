import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	// Svelte 5 ships separate client/server builds selected via package.json
	// "exports" conditions; without forcing "browser" here, component tests
	// resolve the SSR build and `mount()` throws lifecycle_function_unavailable.
	resolve: {
		conditions: ['browser']
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		alias: {
			$lib: resolve('./src/lib'),
			$api: resolve('./src/lib/api'),
			$stores: resolve('./src/lib/stores'),
			$components: resolve('./src/lib/components')
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['tests/**', '**/*.test.ts', '**/*.spec.ts', 'src/routes/**']
		}
	}
});
