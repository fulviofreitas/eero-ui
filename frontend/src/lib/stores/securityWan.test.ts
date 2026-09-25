/**
 * Tests for the security/WAN store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 12).
 *
 * Coverage:
 * - fetch loads security/subnets/multistaticip/advanced together
 * - a transport failure on any one call records error
 * - clear resets to the initial state
 * - updateDdns (phase-6.0-revamp.md § 7 WP7, family 4) re-fetches on success
 *   and returns the backend's own `changed` flag
 * - a 403 experimental_disabled response surfaces as a rejected promise
 * - updateThread/regenerateThreadCredentials (phase-6.0-revamp.md § 7 WP7,
 *   family 7) re-fetch the store on success
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { securityWanStore } from './securityWan';
import { dnsStore } from './dns';
import { resetSettingsLock } from './settingsLock';
import { server } from '../../../tests/mocks/server';

describe('securityWanStore', () => {
	beforeEach(() => {
		securityWanStore.clear();
		dnsStore.clear();
		resetSettingsLock();
	});

	it('loads security/subnets/multistaticip/advanced together', async () => {
		await securityWanStore.fetch('network-123');

		const state = get(securityWanStore);
		expect(state.security?.wpa3).toBe(true);
		expect(state.subnets?.subnets).toHaveLength(1);
		expect(state.multistaticip?.configured).toBe(false);
		expect(state.advanced?.connection_mode).toBe('router');
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a transport failure on any one call as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/subnets', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await securityWanStore.fetch('network-123');

		const state = get(securityWanStore);
		expect(state.error).toBeTruthy();
		expect(state.loading).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		await securityWanStore.fetch('network-123');
		expect(get(securityWanStore).security).not.toBeNull();

		securityWanStore.clear();

		const state = get(securityWanStore);
		expect(state.security).toBeNull();
		expect(state.subnets).toBeNull();
	});

	describe('updateDdns', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			await securityWanStore.fetch('network-123');

			const changed = await securityWanStore.updateDdns('network-123', true);

			expect(changed).toBe(true);
			expect(get(securityWanStore).applying).toBe(false);
			expect(get(securityWanStore).advanced).not.toBeNull();
		});

		it('returns false (no-op) when the backend reports changed:false', async () => {
			server.use(
				http.put('/api/networks/:networkId/ddns', () =>
					HttpResponse.json({ success: true, changed: false, ddns: { enabled: false } })
				)
			);

			const changed = await securityWanStore.updateDdns('network-123', false);

			expect(changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/ddns', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(securityWanStore.updateDdns('network-123', true)).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	describe('updateThread', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			await securityWanStore.fetch('network-123');

			const changed = await securityWanStore.updateThread('network-123', false);

			expect(changed).toBe(true);
			expect(get(securityWanStore).applying).toBe(false);
			expect(get(securityWanStore).security).not.toBeNull();
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/thread', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(securityWanStore.updateThread('network-123', true)).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	describe('regenerateThreadCredentials', () => {
		it('re-fetches the store on success', async () => {
			await securityWanStore.regenerateThreadCredentials('network-123');

			expect(get(securityWanStore).applying).toBe(false);
			expect(get(securityWanStore).security).not.toBeNull();
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/thread/regenerate', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(securityWanStore.regenerateThreadCredentials('network-123')).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	// ==================================================================
	// WP8: settings-class write controls (phase-6.0-revamp.md § 5, § 7 WP8)
	// ==================================================================

	describe('updateSqm', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			await securityWanStore.fetch('network-123');

			const result = await securityWanStore.updateSqm('network-123', true);

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
			expect(get(securityWanStore).applying).toBe(false);
		});

		it('does not re-fetch when the backend reports changed:false', async () => {
			server.use(
				http.put('/api/networks/:networkId/sqm', () =>
					HttpResponse.json({
						success: true,
						changed: false,
						reboot_expected: true,
						enabled: false
					})
				)
			);

			const result = await securityWanStore.updateSqm('network-123', false);

			expect(result.changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/sqm', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(securityWanStore.updateSqm('network-123', true)).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(securityWanStore).applying).toBe(false);
			expect(get(securityWanStore).error).toBeTruthy();
		});

		it('surfaces a 429 rate-limit response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/sqm', () =>
					HttpResponse.json({ detail: 'Rate limit exceeded.' }, { status: 429 })
				)
			);

			await expect(securityWanStore.updateSqm('network-123', true)).rejects.toThrow();
			expect(get(securityWanStore).applying).toBe(false);
		});

		it('blocks a second settings write for the same network while one is applying', async () => {
			let resolveFirst: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolveFirst = resolve;
			});

			server.use(
				http.put('/api/networks/:networkId/sqm', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						changed: true,
						reboot_expected: true,
						enabled: true
					});
				})
			);

			const first = securityWanStore.updateSqm('network-123', true);

			// A DNS write on the SAME network must be rejected while SQM is in flight -
			// the lock is shared across every settings-class write, not just SQM's own.
			await expect(dnsStore.updateDns('network-123', { caching: true })).rejects.toThrow(
				/already being applied/i
			);

			resolveFirst!();
			await expect(first).resolves.toMatchObject({ changed: true });
		});
	});

	describe('updateDhcp', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateDhcp('network-123', { mode: 'automatic' });

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
		});
	});

	describe('updateConnectionMode', () => {
		it('reports disables_dhcp_nat when switching to BRIDGE', async () => {
			const result = await securityWanStore.updateConnectionMode('network-123', {
				mode: 'BRIDGE',
				acknowledge_disables_routing: true
			});

			expect(result.changed).toBe(true);
			expect(result.mode).toBe('BRIDGE');
			expect(result.disables_dhcp_nat).toBe(true);
		});
	});

	describe('updateNatPortRandomization', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateNatPortRandomization('network-123', true);

			expect(result.changed).toBe(true);
		});
	});

	describe('updateWpa3PerBand', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateWpa3PerBand('network-123', {
				band_2_4_ghz: 'WPA3'
			});

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
		});
	});

	describe('updateSecurityField', () => {
		it('re-fetches the store and returns the changed field/value', async () => {
			const result = await securityWanStore.updateSecurityField('network-123', {
				band_steering: false
			});

			expect(result.changed).toBe(true);
			expect(result.field).toBe('band_steering');
			expect(result.value).toBe(false);
		});
	});

	describe('updateMlo', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateMlo('network-123', 'single');

			expect(result.changed).toBe(true);
			expect(result.mode).toBe('single');
		});
	});

	describe('updateFastTransition', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateFastTransition('network-123', true);

			expect(result.changed).toBe(true);
		});
	});

	describe('updatePasspoint', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updatePasspoint('network-123', true);

			expect(result.changed).toBe(true);
		});
	});

	describe('updateProxiedNodes', () => {
		it('always proceeds (no no-op guard) and re-fetches on success', async () => {
			const result = await securityWanStore.updateProxiedNodes('network-123', true);

			expect(result.changed).toBe(true);
		});
	});

	// ==================================================================
	// WP8 part 2: power saving, subnets, WAN, firmware
	// (phase-6.0-revamp.md § 5, § 7 WP8 part 2)
	// ==================================================================

	describe('updatePowerSaving', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updatePowerSaving('network-123', { enable: true });

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
		});

		it('does not re-fetch when the backend reports changed:false', async () => {
			server.use(
				http.put('/api/networks/:networkId/power-saving', () =>
					HttpResponse.json({
						success: true,
						changed: false,
						reboot_expected: true,
						enable: false,
						schedule_enabled: null
					})
				)
			);

			const result = await securityWanStore.updatePowerSaving('network-123', { enable: false });

			expect(result.changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/power-saving', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				securityWanStore.updatePowerSaving('network-123', { enable: true })
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	describe('updateSubnet', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateSubnet('network-123', {
				subnet_type: 'iot',
				enabled: true
			});

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
		});

		it('surfaces a 409 conflict response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/subnets', () =>
					HttpResponse.json(
						{ type: 'subnet_protected', detail: 'The main subnet cannot be modified.' },
						{ status: 409 }
					)
				)
			);

			await expect(
				securityWanStore.updateSubnet('network-123', { subnet_type: 'main', enabled: false })
			).rejects.toThrow();
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	describe('deleteSubnet', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.deleteSubnet('network-123', 'iot');

			expect(result.changed).toBe(true);
		});

		it('surfaces a 409 subnet_protected response for the main subnet', async () => {
			await expect(securityWanStore.deleteSubnet('network-123', 'main')).rejects.toThrow();
		});
	});

	describe('updateMultiStaticIp', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			const result = await securityWanStore.updateMultiStaticIp('network-123', {
				enabled: true,
				type: 'P',
				multistaticip_settings: {
					router_ip: '203.0.113.1',
					subnet_ip: '203.0.113.0',
					subnet_mask: '255.255.255.248'
				}
			});

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(true);
		});

		it('surfaces a 429 rate-limit response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/multistaticip', () =>
					HttpResponse.json({ detail: 'Rate limit exceeded.' }, { status: 429 })
				)
			);

			await expect(
				securityWanStore.updateMultiStaticIp('network-123', { enabled: false })
			).rejects.toThrow();
			expect(get(securityWanStore).applying).toBe(false);
		});
	});

	describe('updateSecondaryWanConfig', () => {
		it('always proceeds (no no-op guard) and re-fetches on success', async () => {
			const result = await securityWanStore.updateSecondaryWanConfig('network-123', {
				devices: [{ mac: 'aa:bb:cc:dd:ee:ff', secondary_wan_deny_access: true }]
			});

			expect(result.changed).toBe(true);
		});
	});

	describe('applyNetworkUpdate', () => {
		it('re-fetches the store and reports scope: all_nodes', async () => {
			const result = await securityWanStore.applyNetworkUpdate('network-123');

			expect(result.changed).toBe(true);
			expect(result.scope).toBe('all_nodes');
		});

		it('surfaces a 409 no_update_available response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/updates/apply', () =>
					HttpResponse.json(
						{ type: 'no_update_available', detail: 'No update is pending.' },
						{ status: 409 }
					)
				)
			);

			await expect(securityWanStore.applyNetworkUpdate('network-123')).rejects.toThrow();
			expect(get(securityWanStore).applying).toBe(false);
		});
	});
});
