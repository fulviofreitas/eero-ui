/**
 * Tests for the DNS store.
 *
 * Coverage:
 * - fetchDns loads settings
 * - updateDns is PESSIMISTIC: `settings` is untouched until the request
 *   resolves, and only updated when the backend reports `changed: true`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { dnsStore } from './dns';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const initialSettings = {
	ipv4: { mode: 'automatic' as const, servers: [] },
	ipv6: { mode: 'automatic' as const, servers: [] },
	caching: true,
	parent_ips: ['203.0.113.1'],
	providers: []
};

describe('dnsStore', () => {
	beforeEach(() => {
		dnsStore.clear();
	});

	describe('fetchDns', () => {
		it('loads settings from the API', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () => HttpResponse.json(initialSettings))
			);

			await dnsStore.fetchDns('network-123');

			const state = get(dnsStore);
			expect(state.settings).toEqual(initialSettings);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
		});

		it('records an error on failure', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await dnsStore.fetchDns('network-123');

			const state = get(dnsStore);
			expect(state.settings).toBeNull();
			expect(state.error).toBeTruthy();
		});
	});

	describe('updateDns', () => {
		it('does NOT mutate settings before the request resolves (pessimistic)', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () => HttpResponse.json(initialSettings))
			);
			await dnsStore.fetchDns('network-123');

			let sawApplyingWithStaleSettings = false;
			let resolveRequest: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolveRequest = resolve;
			});

			server.use(
				http.put('/api/networks/:networkId/dns', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						changed: true,
						dns: {
							...initialSettings,
							ipv4: { mode: 'custom', servers: ['1.1.1.1'] }
						}
					});
				})
			);

			const updatePromise = dnsStore.updateDns('network-123', {
				ipv4: { mode: 'custom', servers: ['1.1.1.1'] }
			});

			// Mid-flight: applying is true, but settings must still be the
			// pre-write value - no optimistic mutation.
			const midFlightState = get(dnsStore);
			if (midFlightState.applying && midFlightState.settings?.ipv4.mode === 'automatic') {
				sawApplyingWithStaleSettings = true;
			}

			resolveRequest!();
			await updatePromise;

			expect(sawApplyingWithStaleSettings).toBe(true);

			const finalState = get(dnsStore);
			expect(finalState.applying).toBe(false);
			expect(finalState.settings?.ipv4.mode).toBe('custom');
		});

		it('leaves settings untouched when the backend reports changed: false', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () => HttpResponse.json(initialSettings)),
				http.put('/api/networks/:networkId/dns', () =>
					HttpResponse.json({ success: true, changed: false, dns: initialSettings })
				)
			);
			await dnsStore.fetchDns('network-123');

			const result = await dnsStore.updateDns('network-123', { caching: true });

			expect(result.changed).toBe(false);
			const state = get(dnsStore);
			expect(state.settings).toEqual(initialSettings);
		});

		it('re-throws on failure and records the error', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () => HttpResponse.json(initialSettings)),
				http.put('/api/networks/:networkId/dns', () =>
					HttpResponse.json(
						{ detail: { field: 'ipv4', message: 'invalid address' } },
						{ status: 422 }
					)
				)
			);
			await dnsStore.fetchDns('network-123');

			await expect(
				dnsStore.updateDns('network-123', { ipv4: { mode: 'custom', servers: ['bad'] } })
			).rejects.toThrow();

			const state = get(dnsStore);
			expect(state.applying).toBe(false);
			expect(state.settings).toEqual(initialSettings);
		});
	});
});
