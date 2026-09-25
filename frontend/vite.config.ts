import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		// Inject version at build time
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	server: {
		proxy: {
			// Proxy API requests to FastAPI backend during development
			'/api': {
				target: 'http://localhost:8000',
				changeOrigin: true
			}
		}
	},
	build: {
		rollupOptions: {
			output: {
				// WP9 perf (plan § 6.2 Tier 4): give Chart.js + its date adapter their own named
				// chunk so pages with no charts never download it. Verified by inspecting the
				// build output: this chunk is only statically imported by the chart-consuming
				// route nodes, never by the root layout - no eager-loading regression.
				//
				// Deliberately NOT doing the same for @xyflow/svelte here. SvelteKit's automatic
				// per-route chunking already isolates it completely: without any manualChunks
				// entry, @xyflow/svelte's ~183 KB compiles straight into the /topology route's
				// own chunk and is never referenced by any other route. Forcing it into a named
				// manual chunk (tried and measured) instead pulls ~48 KB of shared Svelte runtime
				// in alongside it and makes the *root layout* statically import the resulting
				// 231 KB chunk on every single route - a regression, not an optimization. If
				// @xyflow/svelte ever gets a second consumer route, revisit this with the same
				// before/after chunk-graph check (grep the built nodes/*.js for the chunk id).
				manualChunks(id) {
					if (
						id.includes('node_modules/chart.js') ||
						id.includes('node_modules/chartjs-adapter-date-fns') ||
						id.includes('node_modules/date-fns')
					) {
						return 'charts';
					}
				}
			}
		}
	}
});
