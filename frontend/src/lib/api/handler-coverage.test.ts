/**
 * Handler-coverage guard (plan § 8.2): asserts every request the `api` client
 * in `client.ts` can issue is served by a handler in `tests/mocks/handlers.ts`.
 *
 * Approach: call every leaf method on `api` (the same client every store/
 * component uses) against the default MSW handlers and fail if MSW reports an
 * *unhandled* request - the "warn" mode configured in `tests/setup.ts` logs
 * that condition to `console.warn` rather than throwing, so this test spies on
 * `console.warn` and asserts the specific MSW message never appears. A method
 * can still fail for an unrelated reason (a malformed mock body, a network
 * hiccup) without tripping this guard - it only proves *some* handler
 * intercepted the request, which is the property this test is chartered with.
 *
 * The explicit call list below is intentionally exhaustive and mirrors
 * `client.ts`'s public surface 1:1 (deliberate choice over parsing the module
 * with a bundler-level AST walk, which would be brittle and opaque to change
 * - see plan § 8.2 "parse the api object or maintain an explicit list — say
 * which"). Adding a method to `client.ts` without adding it here is caught by
 * `coverage.test.ts`'s companion assertion at the bottom: the call count must
 * match the number of leaf functions found by walking the `api` object.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './client';

const UNHANDLED_REQUEST_MARKER = 'intercepted a request without a matching request handler';

function countLeafMethods(value: unknown): number {
	if (typeof value === 'function') return 1;
	if (value && typeof value === 'object') {
		return Object.values(value).reduce((sum: number, v) => sum + countLeafMethods(v), 0);
	}
	return 0;
}

describe('api client handler coverage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('every api.* method is served by a mock handler (no MSW "unhandled request" warning)', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const calls: Array<() => Promise<unknown>> = [
			() => api.health(),
			() => api.auth.status(),
			() => api.auth.login('user@example.com'),
			() => api.auth.verify('123456'),
			() => api.auth.logout(),
			() => api.networks.list(),
			() => api.networks.get('network-123'),
			() => api.networks.setPreferred('network-123'),
			() => api.networks.speedTest('network-123'),
			() => api.networks.speedTestHistory('network-123'),
			() => api.networks.toggleGuestNetwork('network-123', true),
			() => api.networks.setName('network-123', 'New Name'),
			() => api.networks.getDns('network-123'),
			() =>
				api.networks.setDns('network-123', {
					ipv4: { mode: 'automatic', servers: [] }
				}),
			() => api.devices.list(),
			() => api.devices.get('dev-1'),
			() => api.devices.block('dev-1'),
			() => api.devices.unblock('dev-1'),
			() => api.devices.setNickname('dev-1', 'New Name'),
			() => api.eeros.list(),
			() => api.eeros.get('eero-1'),
			() => api.eeros.reboot('eero-1'),
			() => api.eeros.setLed('eero-1', true),
			() => api.eeros.setLedBrightness('eero-1', 80),
			() => api.profiles.list(),
			() => api.profiles.get('profile-1'),
			() => api.profiles.pause('profile-1'),
			() => api.profiles.unpause('profile-1'),
			() => api.profiles.create('New Profile'),
			() => api.profiles.rename('profile-1', 'Renamed'),
			() => api.profiles.delete('profile-1'),
			() => api.profiles.assignDevices('profile-1', ['dev-1'])
		];

		// Every call is allowed to reject (e.g. a fixture returns a shape a
		// method's caller wouldn't like) - only the console.warn spy matters.
		await Promise.all(calls.map((call) => call().catch(() => undefined)));

		const unhandled = warnSpy.mock.calls.filter(([message]) =>
			typeof message === 'string' ? message.includes(UNHANDLED_REQUEST_MARKER) : false
		);

		expect(unhandled).toEqual([]);
	});

	it('the call list above covers every leaf method exposed by the api client', () => {
		// Guards the guard: if client.ts grows a new method, this fails until
		// the call list above is updated too, instead of silently covering
		// only a subset forever.
		expect(countLeafMethods(api)).toBe(32);
	});
});
