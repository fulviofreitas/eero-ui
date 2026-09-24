/**
 * Tests for the backup-internet store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 11).
 *
 * Coverage:
 * - fetch loads status and access points together
 * - a 402 is recorded as premiumRequired rather than error
 * - a 5xx is recorded as error
 * - clear resets to the initial state
 * - updateEnabled (phase-6.0-revamp.md § 7 WP7, family 11) re-fetches on
 *   success and returns the backend's own `changed` flag
 * - a 403 experimental_disabled response surfaces as a rejected promise
 * - addAccessPoint/updateAccessPoint/deleteAccessPoint/reorderAccessPoints
 *   (phase-6.0-revamp.md § 7 WP7, family 5) re-fetch the access-point list
 *   on success
 * - discover/check store their own result rather than re-fetching the list
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { backupInternetStore } from './backupInternet';
import { server } from '../../../tests/mocks/server';

describe('backupInternetStore', () => {
	beforeEach(() => {
		backupInternetStore.clear();
	});

	it('loads status and access points together', async () => {
		await backupInternetStore.fetch('network-123');

		const state = get(backupInternetStore);
		expect(state.status?.enabled).toBe(true);
		expect(state.accessPoints).toHaveLength(1);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 402 as premiumRequired rather than error', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		await backupInternetStore.fetch('network-123');

		const state = get(backupInternetStore);
		expect(state.premiumRequired).toBe(true);
		expect(state.error).toBeNull();
		expect(state.status).toBeNull();
	});

	it('records a 5xx as error after the client retries twice', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await backupInternetStore.fetch('network-123');

		const state = get(backupInternetStore);
		expect(state.error).toBeTruthy();
		expect(state.premiumRequired).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		await backupInternetStore.fetch('network-123');
		expect(get(backupInternetStore).accessPoints).toHaveLength(1);

		backupInternetStore.clear();

		const state = get(backupInternetStore);
		expect(state.accessPoints).toEqual([]);
		expect(state.status).toBeNull();
	});

	describe('updateEnabled', () => {
		it('re-fetches the store and returns the backend changed flag', async () => {
			await backupInternetStore.fetch('network-123');

			const changed = await backupInternetStore.updateEnabled('network-123', false);

			expect(changed).toBe(true);
			expect(get(backupInternetStore).applying).toBe(false);
			expect(get(backupInternetStore).status).not.toBeNull();
		});

		it('returns false (no-op) when the backend reports changed:false', async () => {
			server.use(
				http.put('/api/networks/:networkId/backup-internet', () =>
					HttpResponse.json({ success: true, changed: false, enabled: true })
				)
			);

			const changed = await backupInternetStore.updateEnabled('network-123', true);

			expect(changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/backup-internet', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(backupInternetStore.updateEnabled('network-123', true)).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(backupInternetStore).applying).toBe(false);
		});
	});

	describe('addAccessPoint', () => {
		it('re-fetches the access-point list on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/backup-access-points', () =>
					HttpResponse.json({
						access_points: [
							{
								id: 'ap-new',
								ssid: 'New AP',
								uuid: null,
								priority: 2,
								enabled: true,
								status: null,
								connectivity: null
							}
						]
					})
				)
			);

			await backupInternetStore.addAccessPoint('network-123', {
				ssid: 'New AP',
				password: 'correct-horse-battery'
			});

			const state = get(backupInternetStore);
			expect(state.applying).toBe(false);
			expect(state.accessPoints).toHaveLength(1);
			expect(state.accessPoints[0].ssid).toBe('New AP');
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/backup-access-points', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				backupInternetStore.addAccessPoint('network-123', {
					ssid: 'New AP',
					password: 'correct-horse-battery'
				})
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(backupInternetStore).applying).toBe(false);
		});
	});

	describe('updateAccessPoint', () => {
		it('re-fetches the access-point list on success', async () => {
			await backupInternetStore.updateAccessPoint('network-123', 'ap-1', { enabled: false });

			expect(get(backupInternetStore).applying).toBe(false);
			expect(get(backupInternetStore).accessPoints).toHaveLength(1);
		});
	});

	describe('deleteAccessPoint', () => {
		it('re-fetches the (now empty) access-point list on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/backup-access-points', () =>
					HttpResponse.json({ access_points: [] })
				)
			);

			await backupInternetStore.deleteAccessPoint('network-123', 'ap-1');

			expect(get(backupInternetStore).accessPoints).toEqual([]);
		});
	});

	describe('reorderAccessPoints', () => {
		it('re-fetches the access-point list on success', async () => {
			await backupInternetStore.reorderAccessPoints('network-123', ['ap-2', 'ap-1']);

			expect(get(backupInternetStore).applying).toBe(false);
			expect(get(backupInternetStore).accessPoints).toHaveLength(1);
		});
	});

	describe('discover', () => {
		it('stores the discovered SSIDs without re-fetching the access-point list', async () => {
			await backupInternetStore.discover('network-123');

			const state = get(backupInternetStore);
			expect(state.applying).toBe(false);
			expect(state.discovered).toHaveLength(1);
			expect(state.discovered?.[0].ssid).toBe('Discovered-5G');
		});
	});

	describe('check', () => {
		it('stores the connectivity-check result without re-fetching the access-point list', async () => {
			await backupInternetStore.check('network-123');

			const state = get(backupInternetStore);
			expect(state.applying).toBe(false);
			expect(state.checkResult?.ssid).toBe('Backup-5G');
		});
	});
});
