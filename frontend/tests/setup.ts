/**
 * Vitest test setup file.
 *
 * Configures the test environment with:
 * - jest-dom matchers for DOM assertions
 * - MSW server for API mocking
 * - Browser API mocks
 */

import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock browser APIs not available in jsdom
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

// Mock CustomEvent for auth events
class MockCustomEvent extends Event {
	detail: unknown;
	constructor(type: string, options?: CustomEventInit) {
		super(type, options);
		this.detail = options?.detail;
	}
}

Object.defineProperty(window, 'CustomEvent', {
	writable: true,
	value: MockCustomEvent
});

// jsdom has no Web Animations API. Svelte 5's `fade`/`scale` transitions
// (ConfirmDialog, Toast) call `element.animate()` directly - both to play the
// transition AND, on an outro, to know when it's safe to remove the element -
// rather than falling back to a CSS-only path. Without this polyfill, mounting
// throws `TypeError: element.animate is not a function`; with a polyfill that
// never fires 'finish' (e.g. a bare stub), outro transitions hang forever
// instead, since Svelte awaits that event before detaching the element - so
// this fires 'finish' on a real EventTarget, on the next microtask, exactly
// once.
// jsdom also has no `Element.prototype.getAnimations` - Svelte 5's `animate:flip` (DataTable's
// device/eero/profile rows, WP9 § 6.2 Tier 3 "motion polish") calls it unconditionally on every
// `each` block update to check for/cancel in-flight animations, regardless of whether this
// particular update actually triggers a flip. An empty array (no animations ever "in flight" in
// jsdom) is the correct/safe stub - it just means every update is treated as "safe to move".
if (!Element.prototype.getAnimations) {
	Element.prototype.getAnimations = function () {
		return [];
	};
}

if (!Element.prototype.animate) {
	Element.prototype.animate = function () {
		const target = new EventTarget();
		const finished = Promise.resolve().then(() => {
			target.dispatchEvent(new Event('finish'));
		});
		return Object.assign(target, {
			finished,
			effect: null,
			currentTime: 0,
			playbackRate: 1,
			playState: 'finished',
			cancel: () => {},
			finish: () => {},
			pause: () => {},
			play: () => {},
			reverse: () => {},
			updatePlaybackRate: () => {},
			commitStyles: () => {},
			persist: () => {},
			oncancel: null,
			onfinish: null,
			onremove: null
		}) as unknown as Animation;
	};
}
