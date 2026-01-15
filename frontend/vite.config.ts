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
	}
});
