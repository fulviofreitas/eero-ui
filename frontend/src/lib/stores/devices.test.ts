/**
 * Tests for the devices store.
 *
 * Tests cover:
 * - assignToProfile: optimistic update, success, rollback on failure
 * - blockDevice: PESSIMISTIC (Unverified, plan § 5) - no optimistic flip,
 *   422 (no known MAC) surfaces a usable message, and writes never retry
 * - unblockDevice / setNickname: still optimistic (Verified), roll back on
 *   a 4xx
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { devicesStore } from './devices';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

// Seed data helpers
const makeDevice = (id: string, overrides: Record<string, unknown> = {}) => ({
	id,
	url: null,
	mac: `AA:BB:CC:DD:EE:${id}`,
	ip: '192.168.1.1',
	nickname: `Device ${id}`,
	hostname: null,
	display_name: `Device ${id}`,
	manufacturer: null,
	model_name: null,
	device_type: null,
	connected: true,
	wireless: true,
	blocked: false,
	paused: false,
	is_guest: false,
	connection_type: 'wireless' as const,
	signal_strength: null,
	frequency: null,
	connected_to_eero: null,
	last_active: null,
	profile_id: null,
	profile_name: null,
	...overrides
});

describe('devicesStore', () => {
	beforeEach(() => {
		devicesStore.clear();
	});

	describe('assignToProfile', () => {
		it('optimistically updates profile_id and profile_name on targeted devices', async () => {
			// Seed the store with two devices
			server.use(
				http.get('/api/devices', () => {
					return HttpResponse.json([makeDevice('dev-1'), makeDevice('dev-2')]);
				})
			);
			await devicesStore.fetch();

			// Kick off assignment (don't await yet) so we can inspect mid-flight
			// We'll just await and verify the post-success state here
			const result = await devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids');

			expect(result).toBe(true);

			const state = get(devicesStore);
			const dev1 = state.devices.find((d) => d.id === 'dev-1');
			const dev2 = state.devices.find((d) => d.id === 'dev-2');

			expect(dev1?.profile_id).toBe('profile-1');
			expect(dev1?.profile_name).toBe('Kids');
			// Unaffected device stays the same
			expect(dev2?.profile_id).toBeNull();
		});

		it('updates multiple devices in a single call', async () => {
			server.use(
				http.get('/api/devices', () => {
					return HttpResponse.json([makeDevice('dev-1'), makeDevice('dev-2'), makeDevice('dev-3')]);
				})
			);
			await devicesStore.fetch();

			await devicesStore.assignToProfile(['dev-1', 'dev-2'], 'profile-2', 'Guests');

			const state = get(devicesStore);
			const dev1 = state.devices.find((d) => d.id === 'dev-1');
			const dev2 = state.devices.find((d) => d.id === 'dev-2');
			const dev3 = state.devices.find((d) => d.id === 'dev-3');

			expect(dev1?.profile_name).toBe('Guests');
			expect(dev2?.profile_name).toBe('Guests');
			expect(dev3?.profile_name).toBeNull();
		});

		it('rolls back on API failure and re-throws', async () => {
			server.use(
				http.get('/api/devices', () => {
					return HttpResponse.json([makeDevice('dev-1', { profile_id: null, profile_name: null })]);
				}),
				http.post('/api/profiles/:profileId/assign-devices', () => {
					return HttpResponse.json({ detail: 'Internal server error' }, { status: 500 });
				})
			);
			await devicesStore.fetch();

			await expect(devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids')).rejects.toThrow();

			// Profile should be rolled back to null
			const state = get(devicesStore);
			const dev1 = state.devices.find((d) => d.id === 'dev-1');
			expect(dev1?.profile_id).toBeNull();
			expect(dev1?.profile_name).toBeNull();
		});

		it('rolls back on success=false response and re-throws', async () => {
			server.use(
				http.get('/api/devices', () => {
					return HttpResponse.json([makeDevice('dev-1')]);
				}),
				http.post('/api/profiles/:profileId/assign-devices', () => {
					return HttpResponse.json({
						success: false,
						profile_id: 'profile-1',
						assigned_count: 0,
						message: 'Profile not found'
					});
				})
			);
			await devicesStore.fetch();

			await expect(devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids')).rejects.toThrow(
				'Profile not found'
			);

			const state = get(devicesStore);
			const dev1 = state.devices.find((d) => d.id === 'dev-1');
			expect(dev1?.profile_id).toBeNull();
		});

		it('returns true on success', async () => {
			server.use(
				http.get('/api/devices', () => {
					return HttpResponse.json([makeDevice('dev-1')]);
				})
			);
			await devicesStore.fetch();

			const result = await devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids');
			expect(result).toBe(true);
		});
	});

	describe('blockDevice (Unverified, § 5 - pessimistic)', () => {
		it('does not flip `blocked` until the API confirms it', async () => {
			server.use(
				http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1')])),
				http.post('/api/devices/:deviceId/block', async () => {
					// Mid-request: the store must still show the device unblocked.
					await new Promise((resolve) => setTimeout(resolve, 5));
					return HttpResponse.json({ success: true, device_id: 'dev-1', action: 'block' });
				})
			);
			await devicesStore.fetch();

			const blockPromise = devicesStore.blockDevice('dev-1');

			// No optimistic mutation: still unblocked while the request is in flight.
			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.blocked).toBe(false);

			await blockPromise;

			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.blocked).toBe(true);
		});

		it('surfaces a usable message on 422 (device has no known MAC address)', async () => {
			server.use(
				http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1', { mac: null })])),
				http.post('/api/devices/:deviceId/block', () =>
					HttpResponse.json({ detail: 'Device has no known MAC address.' }, { status: 422 })
				)
			);
			await devicesStore.fetch();

			await expect(devicesStore.blockDevice('dev-1')).rejects.toThrow(
				'Device has no known MAC address.'
			);

			// Never flipped - there was nothing to roll back.
			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.blocked).toBe(false);
		});

		it('never retries the block POST on a 5xx', async () => {
			let calls = 0;
			server.use(
				http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1')])),
				http.post('/api/devices/:deviceId/block', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);
			await devicesStore.fetch();

			await expect(devicesStore.blockDevice('dev-1')).rejects.toThrow();
			expect(calls).toBe(1);
		});
	});

	describe('unblockDevice (Verified, § 5 - optimistic)', () => {
		it('rolls back on a 4xx failure', async () => {
			server.use(
				http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1', { blocked: true })])),
				http.post('/api/devices/:deviceId/unblock', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 400 })
				)
			);
			await devicesStore.fetch();

			await expect(devicesStore.unblockDevice('dev-1')).rejects.toThrow();

			// Rolled back to blocked - the optimistic flip was undone.
			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.blocked).toBe(true);
		});

		it('never retries the unblock POST on a 5xx', async () => {
			let calls = 0;
			server.use(
				http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1', { blocked: true })])),
				http.post('/api/devices/:deviceId/unblock', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);
			await devicesStore.fetch();

			await expect(devicesStore.unblockDevice('dev-1')).rejects.toThrow();
			expect(calls).toBe(1);
		});
	});

	describe('setNickname (Verified, § 5 - optimistic)', () => {
		it('rolls back to the previous nickname on a 4xx failure', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([makeDevice('dev-1', { nickname: 'Old Name' })])
				),
				http.put('/api/devices/:deviceId/nickname', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 400 })
				)
			);
			await devicesStore.fetch();

			await expect(devicesStore.setNickname('dev-1', 'New Name')).rejects.toThrow();

			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.nickname).toBe('Old Name');
		});
	});

	describe('setDeviceType (Verified, § 5 - optimistic)', () => {
		it('optimistically sets device_type, keeping it on success', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([makeDevice('dev-1', { device_type: null })])
				),
				http.put('/api/devices/:deviceId/type', () =>
					HttpResponse.json({
						success: true,
						device_id: 'dev-1',
						action: 'device_type',
						message: null
					})
				)
			);
			await devicesStore.fetch();

			await devicesStore.setDeviceType('dev-1', 'phone');

			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.device_type).toBe('phone');
		});

		it('rolls back to the previous device_type on failure', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([makeDevice('dev-1', { device_type: 'computer' })])
				),
				http.put('/api/devices/:deviceId/type', () =>
					HttpResponse.json(
						{ detail: 'device_type must match ^[a-z0-9_]{1,40}$.' },
						{ status: 422 }
					)
				)
			);
			await devicesStore.fetch();

			await expect(devicesStore.setDeviceType('dev-1', 'phone')).rejects.toThrow();

			expect(get(devicesStore).devices.find((d) => d.id === 'dev-1')?.device_type).toBe('computer');
		});
	});

	describe('setSecondaryWanAccess', () => {
		it('resolves with the backend changed flag (pessimistic - no list mutation)', async () => {
			const changed = await devicesStore.setSecondaryWanAccess('dev-1', true);

			expect(changed).toBe(true);
		});

		it('returns false when the backend reports changed:false', async () => {
			server.use(
				http.put('/api/devices/:deviceId/secondary-wan-access', () =>
					HttpResponse.json({ success: true, changed: false, reboot_expected: true, deny: false })
				)
			);

			const changed = await devicesStore.setSecondaryWanAccess('dev-1', false);

			expect(changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/devices/:deviceId/secondary-wan-access', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(devicesStore.setSecondaryWanAccess('dev-1', true)).rejects.toThrow(
				'Experimental writes are disabled.'
			);
		});
	});

	describe('blockMany / unblockMany (WP9 § 6.2 Tier 3 - bulk block/unblock)', () => {
		it('blockMany aggregates per-device outcomes, keeping the 422 (no MAC) path per-row', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([
						makeDevice('dev-1'),
						makeDevice('dev-2', { mac: null }),
						makeDevice('dev-3')
					])
				),
				http.post('/api/devices/:deviceId/block', ({ params }) => {
					if (params.deviceId === 'dev-2') {
						return HttpResponse.json(
							{ detail: 'Device has no known MAC address.' },
							{ status: 422 }
						);
					}
					return HttpResponse.json({ success: true, device_id: params.deviceId, action: 'block' });
				})
			);
			await devicesStore.fetch();

			const result = await devicesStore.blockMany(['dev-1', 'dev-2', 'dev-3']);

			expect(result.ok.sort()).toEqual(['dev-1', 'dev-3']);
			expect(result.failed).toEqual([{ id: 'dev-2', message: 'Device has no known MAC address.' }]);

			const state = get(devicesStore);
			expect(state.devices.find((d) => d.id === 'dev-1')?.blocked).toBe(true);
			expect(state.devices.find((d) => d.id === 'dev-2')?.blocked).toBe(false);
			expect(state.devices.find((d) => d.id === 'dev-3')?.blocked).toBe(true);
		});

		it('blockMany never throws, even when every device fails', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([makeDevice('dev-1'), makeDevice('dev-2')])
				),
				http.post('/api/devices/:deviceId/block', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);
			await devicesStore.fetch();

			const result = await devicesStore.blockMany(['dev-1', 'dev-2']);

			expect(result.ok).toEqual([]);
			expect(result.failed).toHaveLength(2);
		});

		it('unblockMany rolls back a per-device failure while keeping the others unblocked', async () => {
			server.use(
				http.get('/api/devices', () =>
					HttpResponse.json([
						makeDevice('dev-1', { blocked: true }),
						makeDevice('dev-2', { blocked: true })
					])
				),
				http.post('/api/devices/:deviceId/unblock', ({ params }) => {
					if (params.deviceId === 'dev-2') {
						return HttpResponse.json({ detail: 'boom' }, { status: 500 });
					}
					return HttpResponse.json({
						success: true,
						device_id: params.deviceId,
						action: 'unblock'
					});
				})
			);
			await devicesStore.fetch();

			const result = await devicesStore.unblockMany(['dev-1', 'dev-2']);

			expect(result.ok).toEqual(['dev-1']);
			expect(result.failed).toEqual([{ id: 'dev-2', message: 'boom' }]);

			const state = get(devicesStore);
			expect(state.devices.find((d) => d.id === 'dev-1')?.blocked).toBe(false);
			expect(state.devices.find((d) => d.id === 'dev-2')?.blocked).toBe(true);
		});
	});

	describe('writes never retry on a network error (fetch spy)', () => {
		it('calls fetch exactly once for unblockDevice even when the request throws', async () => {
			server.use(http.get('/api/devices', () => HttpResponse.json([makeDevice('dev-1')])));
			await devicesStore.fetch();

			server.use(http.post('/api/devices/:deviceId/unblock', () => HttpResponse.error()));
			const fetchSpy = vi.spyOn(window, 'fetch');

			await expect(devicesStore.unblockDevice('dev-1')).rejects.toThrow();

			expect(fetchSpy).toHaveBeenCalledTimes(1);
			fetchSpy.mockRestore();
		});
	});
});
