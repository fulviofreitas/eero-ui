/**
 * Tests for the channel-utilisation store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 8).
 *
 * Coverage:
 * - fetch loads the raw dict and records band/eeroId/range
 * - a 409 feature_unavailable is recorded as unavailable, not error
 * - a 5xx is recorded as error
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { channelUtilizationStore } from './channelUtilization';
import { server } from '../../../tests/mocks/server';

describe('channelUtilizationStore', () => {
	beforeEach(() => {
		channelUtilizationStore.clear();
	});

	it('loads the raw dict and records the request params', async () => {
		let seenBand: string | null = null;
		let seenEeroId: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', ({ request }) => {
				const url = new URL(request.url);
				seenBand = url.searchParams.get('band');
				seenEeroId = url.searchParams.get('eero_id');
				return HttpResponse.json({
					band: 'band_2_4GHz',
					series: [{ channel: 1, utilization: 0.1 }]
				});
			})
		);

		await channelUtilizationStore.fetch('network-123', {
			range: '24h',
			band: 'band_2_4GHz',
			eeroId: 42
		});

		expect(seenBand).toBe('band_2_4GHz');
		expect(seenEeroId).toBe('42');
		const state = get(channelUtilizationStore);
		expect(state.data).toEqual({ band: 'band_2_4GHz', series: [{ channel: 1, utilization: 0.1 }] });
		expect(state.range).toBe('24h');
		expect(state.band).toBe('band_2_4GHz');
		expect(state.eeroId).toBe(42);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 409 feature_unavailable as unavailable, not error', async () => {
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ detail: 'not available', type: 'feature_unavailable' }, { status: 409 })
			)
		);

		await channelUtilizationStore.fetch('network-123', { range: '24h' });

		const state = get(channelUtilizationStore);
		expect(state.unavailable).toBe(true);
		expect(state.error).toBeNull();
	});

	it('records a 5xx as error after the client retries twice', async () => {
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await channelUtilizationStore.fetch('network-123', { range: '24h' });

		const state = get(channelUtilizationStore);
		expect(state.error).toBeTruthy();
		expect(state.unavailable).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ series: [] })
			)
		);
		await channelUtilizationStore.fetch('network-123', { range: '24h', band: 'band_6GHz' });
		expect(get(channelUtilizationStore).band).toBe('band_6GHz');

		channelUtilizationStore.clear();

		const state = get(channelUtilizationStore);
		expect(state.data).toBeNull();
		expect(state.band).toBeNull();
		expect(state.range).toBe('24h');
	});
});
