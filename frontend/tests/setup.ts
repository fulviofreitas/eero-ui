/**
 * Vitest test setup file.
 *
 * Configures the test environment with:
 * - jest-dom matchers for DOM assertions
 * - MSW server for API mocking
 * - Browser API mocks
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';
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
