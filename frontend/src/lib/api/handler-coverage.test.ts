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
			() => api.networks.getEntitlements('network-123'),
			() => api.networks.getGuestNetwork('network-123'),
			() => api.networks.setGuestPassword('network-123', 'correct-horse-battery'),
			() => api.networks.clearGuestPassword('network-123'),
			() => api.networks.getScan('network-123'),
			() =>
				api.networks.getInsights('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					insightType: 'blocked'
				}),
			() =>
				api.networks.getDataUsage('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					cadence: 'daily'
				}),
			() =>
				api.networks.getDataUsageBreakdown('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z'
				}),
			() =>
				api.networks.getDevicesDataUsage('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z'
				}),
			() =>
				api.networks.getDeviceDataUsage('network-123', 'aa:bb:cc:dd:ee:01', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					cadence: 'daily'
				}),
			() =>
				api.networks.getEerosDataUsageSummary('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					cadence: 'daily'
				}),
			() =>
				api.networks.getEeroDataUsage('network-123', 'eero-1', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					cadence: 'daily'
				}),
			() =>
				api.networks.getProfileDataUsage('network-123', 'profile-1', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					cadence: 'daily'
				}),
			() => api.networks.getEvents('network-123'),
			() =>
				api.networks.getChannelUtilization('network-123', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z'
				}),
			() => api.networks.getPermissions('network-123'),
			() => api.networks.getMembers('network-123'),
			() => api.networks.getInvites('network-123'),
			() => api.networks.getBackupInternet('network-123'),
			() => api.networks.getBackupAccessPoints('network-123'),
			() => api.networks.getSecurity('network-123'),
			() => api.networks.getSubnets('network-123'),
			() => api.networks.getMultiStaticIp('network-123'),
			() => api.networks.getAdvanced('network-123'),
			() => api.networks.getNotifications('network-123'),
			() => api.networks.getNotificationHistory('network-123'),
			() => api.networks.updateNotificationSettings('network-123', { device_connected: true }),
			() => api.networks.markNotificationsRead('network-123'),
			() => api.networks.updateDdns('network-123', true),
			() => api.networks.updateBackupInternet('network-123', true),
			() => api.networks.createInvite('network-123', 'admin'),
			() => api.networks.updateInvite('network-123', 'invite-1', 'New nickname'),
			() => api.networks.deleteInvite('network-123', 'invite-1'),
			() => api.networks.cancelPendingAdmin('network-123'),
			() =>
				api.networks.addBackupAccessPoint('network-123', {
					ssid: 'Backup-5G',
					password: 'correct-horse-battery'
				}),
			() =>
				api.networks.updateBackupAccessPoint('network-123', 'ap-1', {
					ssid: 'Backup-5G'
				}),
			() => api.networks.deleteBackupAccessPoint('network-123', 'ap-1'),
			() => api.networks.reorderBackupAccessPoints('network-123', ['ap-1']),
			() => api.networks.discoverBackupSsids('network-123'),
			() => api.networks.backupConnectivityCheck('network-123'),
			() => api.networks.updateThread('network-123', true),
			() => api.networks.regenerateThreadCredentials('network-123'),
			() => api.networks.getForwards('network-123'),
			() =>
				api.networks.createForward('network-123', {
					client_port: 8080,
					gateway_port: 80,
					ip: '192.168.1.50',
					protocol: 'tcp'
				}),
			() => api.networks.updateForward('network-123', 'forward-1', { enabled: false }),
			() => api.networks.deleteForward('network-123', 'forward-1'),
			() => api.networks.getReservations('network-123'),
			() =>
				api.networks.createReservation('network-123', {
					ip: '192.168.1.60',
					mac: 'aa:bb:cc:dd:ee:ff'
				}),
			() => api.networks.updateReservation('network-123', 'reservation-1', { description: 'x' }),
			() => api.networks.deleteReservation('network-123', 'reservation-1', true),
			() => api.devices.list(),
			() => api.devices.get('dev-1'),
			() => api.devices.block('dev-1'),
			() => api.devices.unblock('dev-1'),
			() => api.devices.setNickname('dev-1', 'New Name'),
			() => api.devices.setType('dev-1', 'phone'),
			() => api.eeros.list(),
			() => api.eeros.get('eero-1'),
			() => api.eeros.reboot('eero-1'),
			() => api.eeros.setLed('eero-1', true),
			() => api.eeros.setLedBrightness('eero-1', 80),
			() => api.eeros.getConnections('eero-1'),
			() => api.eeros.setLocation('eero-1', 'Living Room'),
			() => api.eeros.nodeAction('eero-1', 'POWER_CYCLE_ALL_PORTS'),
			() => api.eeros.portAction('eero-1', 'eth1', 'ENABLE_DATA'),
			() =>
				api.devices.getInsights('dev-1', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					insightType: 'blocked'
				}),
			() => api.profiles.list(),
			() => api.profiles.get('profile-1'),
			() => api.profiles.pause('profile-1'),
			() => api.profiles.unpause('profile-1'),
			() => api.profiles.create('New Profile'),
			() => api.profiles.rename('profile-1', 'Renamed'),
			() => api.profiles.delete('profile-1'),
			() => api.profiles.assignDevices('profile-1', ['dev-1']),
			() =>
				api.profiles.getInsights('profile-1', {
					start: '2026-01-01T00:00:00Z',
					end: '2026-01-02T00:00:00Z',
					insightType: 'blocked'
				}),
			() => api.profiles.getSchedules('profile-1'),
			() =>
				api.profiles.createSchedule('profile-1', {
					name: 'School nights',
					days: ['monday'],
					start: '20:00',
					end: '07:00'
				}),
			() => api.profiles.updateSchedule('profile-1', 'schedule-1', { enabled: false }),
			() => api.profiles.deleteSchedule('profile-1', 'schedule-1'),
			() => api.profiles.clearSchedules('profile-1'),
			() =>
				api.profiles.createBedtime('profile-1', {
					start_time: '22:00',
					end_time: '07:00'
				})
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
		expect(countLeafMethods(api)).toBe(95);
	});
});
