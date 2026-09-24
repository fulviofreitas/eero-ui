/**
 * Motion helpers (WP9 "motion and filters")
 *
 * Pure decision logic shared by the root layout's `onNavigate` handler (View Transitions on
 * route changes) and any component that wants to gate a Svelte transition/animation behind
 * `prefers-reduced-motion`. Kept here - not inline at each call site - so every call site agrees
 * with the same rule, mirroring the theme.ts precedent for resolveInitialTheme.
 */

/** True when the user's OS/browser preference asks for reduced motion. Safe to call during SSR/tests (no `window`). */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * True when the View Transition API should be used for a route change: the browser supports
 * `document.startViewTransition` AND the user has not asked for reduced motion.
 */
export function shouldUseViewTransition(): boolean {
	if (typeof document === 'undefined') return false;
	if (!('startViewTransition' in document)) return false;
	return !prefersReducedMotion();
}

/**
 * True when the environment can actually run a Web Animations-backed transition/animation.
 * jsdom (the test environment) has no `Element.prototype.getAnimations`, which Svelte's
 * `animate:flip` calls unconditionally - without this guard, any test that re-sorts/re-filters
 * a `animate:flip` list throws `element.getAnimations is not a function` regardless of duration.
 */
export function canAnimate(): boolean {
	return typeof Element !== 'undefined' && typeof Element.prototype.getAnimations === 'function';
}

/** Duration (ms) for a `flip`/list-reorder transition - 0 disables it under reduced motion or where Web Animations isn't available (e.g. jsdom). */
export function flipDuration(normalMs: number): number {
	if (!canAnimate()) return 0;
	return prefersReducedMotion() ? 0 : normalMs;
}
