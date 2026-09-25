/**
 * Tests for motion.ts - the pure decision logic behind the layout's View Transition guard and
 * the flip-duration helper used by DataTable/DeviceList (see WP9 "motion and filters").
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { prefersReducedMotion, shouldUseViewTransition, flipDuration } from './motion';

function mockMatchMedia(reduced: boolean) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockImplementation((query: string) => ({
			matches: query === '(prefers-reduced-motion: reduce)' ? reduced : false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		}))
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	// @ts-expect-error - test-only cleanup of a property this suite adds to `document`
	delete document.startViewTransition;
});

describe('prefersReducedMotion', () => {
	it('is false when matchMedia is unavailable (SSR/test default)', () => {
		expect(prefersReducedMotion()).toBe(false);
	});

	it('reflects the OS/browser preference', () => {
		mockMatchMedia(true);
		expect(prefersReducedMotion()).toBe(true);

		mockMatchMedia(false);
		expect(prefersReducedMotion()).toBe(false);
	});
});

describe('shouldUseViewTransition', () => {
	it('is false when the browser has no startViewTransition support', () => {
		mockMatchMedia(false);
		expect(shouldUseViewTransition()).toBe(false);
	});

	it('is false when reduced motion is requested, even with browser support', () => {
		mockMatchMedia(true);
		document.startViewTransition = vi.fn();
		expect(shouldUseViewTransition()).toBe(false);
	});

	it('is true when the browser supports it and reduced motion is not requested', () => {
		mockMatchMedia(false);
		document.startViewTransition = vi.fn();
		expect(shouldUseViewTransition()).toBe(true);
	});
});

describe('flipDuration', () => {
	it('returns the requested duration when motion is not reduced', () => {
		mockMatchMedia(false);
		expect(flipDuration(200)).toBe(200);
	});

	it('returns 0 under reduced motion', () => {
		mockMatchMedia(true);
		expect(flipDuration(200)).toBe(0);
	});
});
