import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	// Mirrors vite.config.ts: +layout.svelte reads this build-time constant directly.
	define: {
		__APP_VERSION__: JSON.stringify('test')
	},
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
			$components: resolve('./src/lib/components'),
			// SvelteKit's real $app/* modules only resolve inside a SvelteKit-run Vite pipeline.
			// These stubs let route/layout components that import them load under plain Vitest;
			// individual tests can still vi.mock() either path to assert on calls.
			'$app/navigation': resolve('./tests/mocks/app-navigation.ts'),
			'$app/stores': resolve('./tests/mocks/app-stores.ts')
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['tests/**', '**/*.test.ts', '**/*.spec.ts', 'src/routes/**']
		}
	}
});
