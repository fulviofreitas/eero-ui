/**
 * Tests for the backup-internet store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 11).
 *
 * Coverage:
 * - fetch loads status and access points together
 * - a 402 is recorded as premiumRequired rather than error
 * - a 5xx is recorded as error
 * - clear resets to the initial state
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
});
