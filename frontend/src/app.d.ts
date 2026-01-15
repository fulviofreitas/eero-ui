// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/**
	 * App version injected at build time from package.json
	 * @see vite.config.ts
	 */
	const __APP_VERSION__: string;
}

export {};
