/**
 * Minimal stand-in for SvelteKit's `$app/state`, aliased in vitest.config.ts.
 *
 * Unlike the removed `$app/stores`, `page` here is a plain reactive object, not a Svelte store -
 * components read `page.url` / `page.params` directly, with no `$` prefix. The real module only
 * works inside a SvelteKit-run Vite pipeline; component tests run under plain Vitest, so
 * `$app/state` imports need a resolvable module to fall back to. Individual tests can still
 * `vi.mock('$app/state', ...)` to override `page` with a specific URL/params.
 */

export const page = {
	url: new URL('http://localhost/'),
	params: {},
	route: { id: null },
	status: 200,
	error: null,
	data: {},
	form: null
};

export const navigating = null;
export const updated = { current: false };
