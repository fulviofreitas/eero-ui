/**
 * Theme resolution
 *
 * Pure decision logic shared by two call sites that cannot share a runtime import:
 *  - the inline bootstrap `<script>` in app.html (duplicates the same few lines by hand, since it
 *    runs before any module graph exists, to set `data-theme` before first paint)
 *  - the runtime `ui` store (`stores/ui.ts`), which imports this module directly
 *
 * Keeping the decision in one tested function means the inline script and the store can never
 * silently drift from each other.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'eero-ui-theme';

/**
 * Decide which theme to render, given:
 *  - `stored`: whatever was read from localStorage (or null/invalid)
 *  - `prefersDark`: the result of `matchMedia('(prefers-color-scheme: dark)').matches`
 *
 * A stored, valid preference always wins. Otherwise fall back to the OS preference, and finally
 * to dark (this app's default aesthetic, see svelte-dashboard.md).
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
	if (stored === 'light' || stored === 'dark') {
		return stored;
	}
	return prefersDark ? 'dark' : 'light';
}

/** True when the user has never made an explicit choice, i.e. the OS preference should drive it. */
export function hasStoredThemePreference(stored: string | null): boolean {
	return stored === 'light' || stored === 'dark';
}
