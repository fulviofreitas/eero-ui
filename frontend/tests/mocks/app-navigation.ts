/**
 * Minimal stand-in for SvelteKit's `$app/navigation`, aliased in vitest.config.ts.
 * See app-stores.ts for why this exists. Individual tests can `vi.mock('$app/navigation', ...)`
 * to assert on calls.
 */

export async function goto(): Promise<void> {}
export function afterNavigate(): void {}
export function beforeNavigate(): void {}
export function invalidate(): Promise<void> {
	return Promise.resolve();
}
export function invalidateAll(): Promise<void> {
	return Promise.resolve();
}
