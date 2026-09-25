/**
 * Minimal stand-in for SvelteKit's `$app/stores`, aliased in vitest.config.ts.
 *
 * The real module only works inside a SvelteKit-run Vite pipeline; component tests run under
 * plain Vitest, so `$app/*` imports need a resolvable module to fall back to. Individual tests
 * can still `vi.mock('$app/stores', ...)` to override `page` with a specific URL.
 */

import { readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost/'),
	params: {},
	route: { id: null },
	status: 200,
	error: null,
	data: {},
	form: null
});

export const navigating = readable(null);
export const updated = readable(false);
