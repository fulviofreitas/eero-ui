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
import { server } from '../../../tests/mocks/server';

describe('securityWanStore', () => {
	beforeEach(() => {
		securityWanStore.clear();
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
});
