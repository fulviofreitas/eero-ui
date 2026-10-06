/**
 * Tests for the roaming events store (eero-ui#431).
 *
 * Coverage:
 * - initial state
 * - fetch loads data and passes network_id/range/device_id in the query
 * - setRange refetches with the new range against the current network/device
 * - an older, slower response does not overwrite a newer one (out-of-order
 *   guard)
 * - a 422 keeps the backend's own detail message
 * - a 503 maps to a fixed "unavailable" message
 * - a 401 surfaces like any other store (generic message, no special-casing)
 * - a scope change (new networkId or deviceId) clears `data` synchronously,
 *   before the new response resolves, so the UI never shows another
 *   network's/device's events while the new scope loads
 * - a same-scope refetch (range change) keeps the stale `data` in place
 *   while loading, to avoid a flicker
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { roamingStore, ROAMING_RANGE_OPTIONS } from './roaming';
import { roamingFixture } from '../../../tests/mocks/handlers';
import { server } from '../../../tests/mocks/server';

describe('roamingStore', () => {
	beforeEach(() => {
		roamingStore.clear();
	});

	it('has the expected initial state', () => {
		const state = get(roamingStore);
		expect(state).toEqual({
			data: null,
			range: '24h',
			deviceId: null,
			networkId: null,
			loading: false,
			error: null,
			lastUpdated: null
		});
	});

	it('exposes the four range options for TimeRangeSelector', () => {
		expect(ROAMING_RANGE_OPTIONS).toEqual([
			{ value: '1h', label: '1h' },
			{ value: '6h', label: '6h' },
			{ value: '24h', label: '24h' },
			{ value: '7d', label: '7d' }
		]);
	});

	it('loads data and sends network_id/range/device_id in the query', async () => {
		let seenNetworkId: string | null = null;
		let seenRange: string | null = null;
		let seenDeviceId: string | null = null;
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const url = new URL(request.url);
				seenNetworkId = url.searchParams.get('network_id');
				seenRange = url.searchParams.get('range');
				seenDeviceId = url.searchParams.get('device_id');
				return HttpResponse.json(roamingFixture);
			})
		);

		await roamingStore.fetch('network-123', { range: '6h', deviceId: 'd1' });

		expect(seenNetworkId).toBe('network-123');
		expect(seenRange).toBe('6h');
		expect(seenDeviceId).toBe('d1');

		const state = get(roamingStore);
		expect(state.data).toEqual(roamingFixture);
		expect(state.range).toBe('6h');
		expect(state.deviceId).toBe('d1');
		expect(state.networkId).toBe('network-123');
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
		expect(state.lastUpdated).toBeInstanceOf(Date);
	});

	it('defaults to range 24h and no device filter on first fetch', async () => {
		let seenRange: string | null = null;
		let seenDeviceId: string | null = null;
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const url = new URL(request.url);
				seenRange = url.searchParams.get('range');
				seenDeviceId = url.searchParams.get('device_id');
				return HttpResponse.json(roamingFixture);
			})
		);

		await roamingStore.fetch('network-123');

		expect(seenRange).toBe('24h');
		expect(seenDeviceId).toBeNull();
	});

	it('setRange refetches with the new range, keeping the current network/device', async () => {
		const seenRanges: string[] = [];
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const url = new URL(request.url);
				seenRanges.push(url.searchParams.get('range') ?? '');
				return HttpResponse.json({
					...roamingFixture,
					range: url.searchParams.get('range') ?? '24h'
				});
			})
		);

		await roamingStore.fetch('network-123', { range: '1h', deviceId: 'd1' });
		await roamingStore.setRange('7d');

		expect(seenRanges).toEqual(['1h', '7d']);
		const state = get(roamingStore);
		expect(state.range).toBe('7d');
		expect(state.networkId).toBe('network-123');
		expect(state.deviceId).toBe('d1');
	});

	it('setRange before any fetch just records the range (no network to query yet)', async () => {
		await roamingStore.setRange('6h');
		const state = get(roamingStore);
		expect(state.range).toBe('6h');
		expect(state.networkId).toBeNull();
	});

	it('does not let an older, slower response overwrite a newer one', async () => {
		let resolveFirst: (() => void) | null = null;
		const firstGate = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		server.use(
			http.get('/api/metrics/roaming', async ({ request }) => {
				const url = new URL(request.url);
				const range = url.searchParams.get('range');
				if (range === '1h') {
					// Slow first request - gated until the second has resolved.
					await firstGate;
					return HttpResponse.json({ ...roamingFixture, range: '1h' });
				}
				// Fast second request.
				return HttpResponse.json({ ...roamingFixture, range: '7d' });
			})
		);

		const firstFetch = roamingStore.fetch('network-123', { range: '1h' });
		await roamingStore.fetch('network-123', { range: '7d' });

		// Second (newer) request has already landed.
		expect(get(roamingStore).data?.range).toBe('7d');

		// Release the first, older request - it must not clobber the result.
		resolveFirst!();
		await firstFetch;

		expect(get(roamingStore).data?.range).toBe('7d');
		expect(get(roamingStore).range).toBe('7d');
	});

	it('keeps the backend detail message on a 422 (too many series)', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ detail: 'narrow the range or filter a device' }, { status: 422 })
			)
		);

		await roamingStore.fetch('network-123');

		const state = get(roamingStore);
		expect(state.error).toBe('narrow the range or filter a device');
		expect(state.loading).toBe(false);
		expect(state.data).toBeNull();
	});

	it('maps a 503 to a fixed "unavailable" message', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ detail: 'VictoriaMetrics unreachable' }, { status: 503 })
			)
		);

		await roamingStore.fetch('network-123');

		expect(get(roamingStore).error).toBe('Metrics are unavailable.');
	});

	it('surfaces a 401 like any other store (generic message)', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
			)
		);

		await roamingStore.fetch('network-123');

		const state = get(roamingStore);
		expect(state.error).toBe('Not authenticated');
		expect(state.loading).toBe(false);
	});

	it('clears data synchronously on a networkId scope change, before the response resolves', async () => {
		server.use(http.get('/api/metrics/roaming', () => HttpResponse.json(roamingFixture)));
		await roamingStore.fetch('network-123');
		expect(get(roamingStore).data).not.toBeNull();

		let release: (() => void) | undefined;
		server.use(
			http.get('/api/metrics/roaming', async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return HttpResponse.json({ ...roamingFixture, network_id: 'network-456' });
			})
		);

		const fetchPromise = roamingStore.fetch('network-456');
		// Cleared immediately - the synchronous part of `fetch` runs before the
		// first `await`, so this holds even without waiting for anything.
		expect(get(roamingStore).data).toBeNull();
		expect(get(roamingStore).error).toBeNull();
		expect(get(roamingStore).loading).toBe(true);

		await vi.waitFor(() => expect(release).toBeDefined());
		release!();
		await fetchPromise;

		expect(get(roamingStore).data?.network_id).toBe('network-456');
	});

	it('clears data synchronously on a deviceId scope change', async () => {
		server.use(http.get('/api/metrics/roaming', () => HttpResponse.json(roamingFixture)));
		await roamingStore.fetch('network-123', { deviceId: 'd1' });
		expect(get(roamingStore).data).not.toBeNull();

		let release: (() => void) | undefined;
		server.use(
			http.get('/api/metrics/roaming', async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return HttpResponse.json(roamingFixture);
			})
		);

		const fetchPromise = roamingStore.fetch('network-123', { deviceId: 'd2' });
		expect(get(roamingStore).data).toBeNull();
		expect(get(roamingStore).loading).toBe(true);

		await vi.waitFor(() => expect(release).toBeDefined());
		release!();
		await fetchPromise;
	});

	it('keeps stale data in place while loading on a same-scope range change', async () => {
		server.use(http.get('/api/metrics/roaming', () => HttpResponse.json(roamingFixture)));
		await roamingStore.fetch('network-123', { range: '24h' });
		expect(get(roamingStore).data).not.toBeNull();

		let release: (() => void) | undefined;
		server.use(
			http.get('/api/metrics/roaming', async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return HttpResponse.json({ ...roamingFixture, range: '7d' });
			})
		);

		const fetchPromise = roamingStore.fetch('network-123', { range: '7d' });
		// Same scope (networkId/deviceId unchanged) - the previous data is kept
		// visible while the new range loads, rather than flashing empty/skeleton.
		expect(get(roamingStore).data).not.toBeNull();
		expect(get(roamingStore).loading).toBe(true);

		await vi.waitFor(() => expect(release).toBeDefined());
		release!();
		await fetchPromise;

		expect(get(roamingStore).data?.range).toBe('7d');
	});

	it('clear resets to the initial state', async () => {
		server.use(http.get('/api/metrics/roaming', () => HttpResponse.json(roamingFixture)));

		await roamingStore.fetch('network-123', { range: '6h', deviceId: 'd1' });
		expect(get(roamingStore).data).not.toBeNull();

		roamingStore.clear();

		expect(get(roamingStore)).toEqual({
			data: null,
			range: '24h',
			deviceId: null,
			networkId: null,
			loading: false,
			error: null,
			lastUpdated: null
		});
	});
});
