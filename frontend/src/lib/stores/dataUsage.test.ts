/**
 * Tests for the data-usage store (phase-6.0-revamp.md § 7 WP6, deliverable 7).
 *
 * Coverage:
 * - fetchNetwork loads totals/values at the requested range
 * - a 402 is recorded as premiumRequired rather than error
 * - a 5xx is recorded as error
 * - per-entity slots (device/eero/profile) are tracked independently
 * - clear/clearAll reset state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { dataUsageStore, dataUsageFor } from './dataUsage';
import { server } from '../../../tests/mocks/server';

describe('dataUsageStore', () => {
	beforeEach(() => {
		dataUsageStore.clearAll();
	});

	it('loads network totals/values at the requested range', async () => {
		let seenCadence: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/data-usage', ({ request }) => {
				seenCadence = new URL(request.url).searchParams.get('cadence');
				return HttpResponse.json({
					download_bytes: 1000,
					upload_bytes: 200,
					values: [{ time: '2026-01-01T00:00:00Z', download: 1000, upload: 200 }],
					raw: {}
				});
			})
		);

		await dataUsageStore.fetchNetwork('network-123', '24h');

		expect(seenCadence).toBe('hourly');
		const state = get(dataUsageFor('network'));
		expect(state.data?.download_bytes).toBe(1000);
		expect(state.range).toBe('24h');
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 402 as premiumRequired rather than error', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		await dataUsageStore.fetchNetwork('network-123', '7d');

		const state = get(dataUsageFor('network'));
		expect(state.premiumRequired).toBe(true);
		expect(state.error).toBeNull();
		expect(state.data).toBeNull();
	});

	it('records a 5xx as error after the client retries twice', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await dataUsageStore.fetchNetwork('network-123', '7d');

		const state = get(dataUsageFor('network'));
		expect(state.error).toBeTruthy();
		expect(state.premiumRequired).toBe(false);
	});

	it('tracks device/eero/profile slots independently', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage/devices/:mac', () =>
				HttpResponse.json({ download_bytes: 1, upload_bytes: 1, values: [], raw: {} })
			),
			http.get('/api/networks/:networkId/data-usage/eeros/:eeroId', () =>
				HttpResponse.json({ download_bytes: 2, upload_bytes: 2, values: [], raw: {} })
			),
			http.get('/api/networks/:networkId/data-usage/profiles/:profileId', () =>
				HttpResponse.json({ download_bytes: 3, upload_bytes: 3, values: [], raw: {} })
			)
		);

		await dataUsageStore.fetchDevice('network-123', 'aa:bb:cc:dd:ee:01', '7d');
		await dataUsageStore.fetchEero('network-123', 'eero-1', '7d');
		await dataUsageStore.fetchProfile('network-123', 'profile-1', '7d');

		expect(get(dataUsageFor('device:aa:bb:cc:dd:ee:01')).data?.download_bytes).toBe(1);
		expect(get(dataUsageFor('eero:eero-1')).data?.download_bytes).toBe(2);
		expect(get(dataUsageFor('profile:profile-1')).data?.download_bytes).toBe(3);
	});

	it('clear resets one slot; clearAll resets every tracked slot', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json({ download_bytes: 1, upload_bytes: 1, values: [], raw: {} })
			)
		);
		await dataUsageStore.fetchNetwork('network-123', '7d');
		expect(get(dataUsageFor('network')).data).not.toBeNull();

		dataUsageStore.clear('network');
		expect(get(dataUsageFor('network')).data).toBeNull();

		await dataUsageStore.fetchNetwork('network-123', '7d');
		dataUsageStore.clearAll();
		expect(get(dataUsageFor('network')).data).toBeNull();
	});
});
