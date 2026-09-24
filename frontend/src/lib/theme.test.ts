/**
 * Tests for theme resolution logic (see theme.ts).
 *
 * This is the pure function shared by app.html's inline bootstrap script (duplicated by hand
 * there, since it runs before any module graph exists) and the runtime `ui` store. Covering it
 * here is what guards the two call sites from silently drifting apart.
 */

import { describe, it, expect } from 'vitest';
import { resolveInitialTheme, hasStoredThemePreference, THEME_STORAGE_KEY } from './theme';

describe('resolveInitialTheme', () => {
	it('prefers a stored "dark" preference over the OS setting', () => {
		expect(resolveInitialTheme('dark', false)).toBe('dark');
	});

	it('prefers a stored "light" preference over the OS setting', () => {
		expect(resolveInitialTheme('light', true)).toBe('light');
	});

	it('falls back to the OS preference (dark) when nothing is stored', () => {
		expect(resolveInitialTheme(null, true)).toBe('dark');
	});

	it('falls back to the OS preference (light) when nothing is stored', () => {
		expect(resolveInitialTheme(null, false)).toBe('light');
	});

	it('ignores an invalid stored value and falls back to the OS preference', () => {
		expect(resolveInitialTheme('sepia', true)).toBe('dark');
		expect(resolveInitialTheme('sepia', false)).toBe('light');
	});
});

describe('hasStoredThemePreference', () => {
	it('is true only for a valid stored theme', () => {
		expect(hasStoredThemePreference('dark')).toBe(true);
		expect(hasStoredThemePreference('light')).toBe(true);
	});

	it('is false for null or an invalid value', () => {
		expect(hasStoredThemePreference(null)).toBe(false);
		expect(hasStoredThemePreference('sepia')).toBe(false);
	});
});

describe('THEME_STORAGE_KEY', () => {
	it('matches the key the store has always used, so existing preferences are not lost', () => {
		expect(THEME_STORAGE_KEY).toBe('eero-ui-theme');
	});
});
