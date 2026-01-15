import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
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
