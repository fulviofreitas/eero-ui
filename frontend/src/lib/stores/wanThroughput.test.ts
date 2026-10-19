/**
 * Tests for the WAN throughput store (eero-ui#458).
 *
 * Coverage: populates from the transformed response, forwards query params,
 * drops an older response, clears on network change but keeps stale data on a
 * same-network range change, error handling, clear().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { wanThroughputStore, WAN_RANGE_OPTIONS } from './wanThroughput';
import { wanFixture, wanVmResult } from '../../../tests/mocks/handlers';
import { server } from '../../../tests/mocks/server';

describe('wanThroughputStore', () => {
	beforeEach(() => {
		wanThroughputStore.clear();
	});

	it('has the expected initial state and range options', () => {
		expect(get(wanThroughputStore)).toEqual({
			data: null,
			enabled: null,
			range: '24h',
			networkId: null,
			loading: false,
			error: null,
			lastUpdated: null
		});
		expect(WAN_RANGE_OPTIONS.map((o) => o.value)).toEqual(['1h', '6h', '24h', '7d']);
	});

	it('populates data and forwards network_id/start/end/step', async () => {
		let params: URLSearchParams | null = null;
		server.use(
			http.get('/api/metrics/network/wan', ({ request }) => {
				params = new URL(request.url).searchParams;
				return HttpResponse.json(wanFixture());
			})
		);

		await wanThroughputStore.fetch('network-123');

		expect(params!.get('network_id')).toBe('network-123');
		expect(params!.get('step')).toBe('15m');
		expect(Number(params!.get('end')) - Number(params!.get('start'))).toBe(86400);
		const state = get(wanThroughputStore);
		expect(state.enabled).toBe(true);
		expect(state.data?.download).toHaveLength(3);
		expect(state.data?.download[2].y).toBe(87.3);
		expect(state.loading).toBe(false);
		expect(state.lastUpdated).toBeInstanceOf(Date);
	});

	it('treats a disabled response as enabled=false with empty series', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ enabled: false, download: null, upload: null })
			)
		);
		await wanThroughputStore.fetch('network-123');
		const state = get(wanThroughputStore);
		expect(state.enabled).toBe(false);
		expect(state.data).toEqual({ download: [], upload: [] });
	});

	it('maps an absent series (result: []) to an empty array', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({
					enabled: true,
					download: wanVmResult([[30, 5]]),
					upload: wanVmResult([])
				})
			)
		);
		await wanThroughputStore.fetch('network-123');
		expect(get(wanThroughputStore).data?.upload).toEqual([]);
		expect(get(wanThroughputStore).data?.download).toHaveLength(1);
	});

	it('does not let an older, slower response overwrite a newer one', async () => {
		let releaseFirst: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		server.use(
			http.get('/api/metrics/network/wan', async ({ request }) => {
				if (new URL(request.url).searchParams.get('step') === '1m') {
					await gate;
					return HttpResponse.json({ ...wanFixture(), download: wanVmResult([[30, 1]]) });
				}
				return HttpResponse.json({ ...wanFixture(), download: wanVmResult([[30, 7]]) });
			})
		);

		const first = wanThroughputStore.fetch('network-123', { range: '1h' });
		await wanThroughputStore.fetch('network-123', { range: '7d' });
		releaseFirst!();
		await first;

		expect(get(wanThroughputStore).data?.download[0].y).toBe(7);
		expect(get(wanThroughputStore).range).toBe('7d');
	});

	it('clears data on a network change but keeps it on a same-network range change', async () => {
		await wanThroughputStore.fetch('network-123');
		expect(get(wanThroughputStore).data).not.toBeNull();

		let release: (() => void) | undefined;
		server.use(
			http.get('/api/metrics/network/wan', async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return HttpResponse.json(wanFixture());
			})
		);

		const sameNetwork = wanThroughputStore.fetch('network-123', { range: '6h' });
		expect(get(wanThroughputStore).data).not.toBeNull();
		expect(get(wanThroughputStore).loading).toBe(true);
		await vi.waitFor(() => expect(release).toBeDefined());
		release!();
		await sameNetwork;

		release = undefined;
		const otherNetwork = wanThroughputStore.fetch('network-456');
		expect(get(wanThroughputStore).data).toBeNull();
		expect(get(wanThroughputStore).enabled).toBeNull();
		await vi.waitFor(() => expect(release).toBeDefined());
		release!();
		await otherNetwork;
		expect(get(wanThroughputStore).data).not.toBeNull();
	});

	it('setRange refetches for the current network; before any fetch it only records the range', async () => {
		await wanThroughputStore.setRange('6h');
		expect(get(wanThroughputStore).networkId).toBeNull();
		expect(get(wanThroughputStore).range).toBe('6h');

		const steps: string[] = [];
		server.use(
			http.get('/api/metrics/network/wan', ({ request }) => {
				steps.push(new URL(request.url).searchParams.get('step') ?? '');
				return HttpResponse.json(wanFixture());
			})
		);
		await wanThroughputStore.fetch('network-123', { range: '1h' });
		await wanThroughputStore.setRange('7d');
		expect(steps).toEqual(['1m', '1h']);
	});

	it('sets error (and leaves data null) on a failure; 503 maps to a fixed message', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ detail: 'VM down' }, { status: 503 })
			)
		);
		await wanThroughputStore.fetch('network-123');
		const state = get(wanThroughputStore);
		expect(state.error).toBe('Metrics are unavailable.');
		expect(state.data).toBeNull();
		expect(state.loading).toBe(false);
	}, 15000);

	it('keeps the backend detail on a 400', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ detail: 'Invalid network id' }, { status: 400 })
			)
		);
		await wanThroughputStore.fetch('bad id');
		expect(get(wanThroughputStore).error).toBe('Invalid network id');
	});

	it('clear resets to the initial state', async () => {
		await wanThroughputStore.fetch('network-123');
		wanThroughputStore.clear();
		expect(get(wanThroughputStore).data).toBeNull();
		expect(get(wanThroughputStore).networkId).toBeNull();
	});
});
