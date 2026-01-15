import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		alias: {
			$lib: resolve('./src/lib'),
			$api: resolve('./src/lib/api')
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['tests/**', '**/*.test.ts', '**/*.spec.ts', 'src/routes/**']
		}
	}
});
