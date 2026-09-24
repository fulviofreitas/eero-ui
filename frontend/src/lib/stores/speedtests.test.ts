/**
 * Tests for the speed-test history store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 1).
 *
 * Coverage:
 * - fetch loads results and records the requested limit
 * - fetch records an error on failure, keeping results empty
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { speedTestHistoryStore } from './speedtests';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

describe('speedTestHistoryStore', () => {
	beforeEach(() => {
		speedTestHistoryStore.clear();
	});

	it('loads results from the API at the requested limit', async () => {
		let requestedLimit: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/speedtests', ({ request }) => {
				requestedLimit = new URL(request.url).searchParams.get('limit');
				return HttpResponse.json([
					{
						download_mbps: 100,
						upload_mbps: 20,
						latency_ms: 10,
						timestamp: '2026-01-01T00:00:00Z'
					},
					{ download_mbps: 90, upload_mbps: 18, latency_ms: 12, timestamp: '2025-12-31T00:00:00Z' }
				]);
			})
		);

		await speedTestHistoryStore.fetch('network-123', 25);

		expect(requestedLimit).toBe('25');
		const state = get(speedTestHistoryStore);
		expect(state.results).toHaveLength(2);
		expect(state.limit).toBe(25);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records an error on failure and leaves results empty', async () => {
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await speedTestHistoryStore.fetch('network-123', 10);

		const state = get(speedTestHistoryStore);
		expect(state.results).toEqual([]);
		expect(state.error).toBeTruthy();
		expect(state.loading).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json([
					{ download_mbps: 100, upload_mbps: 20, latency_ms: 10, timestamp: '2026-01-01T00:00:00Z' }
				])
			)
		);
		await speedTestHistoryStore.fetch('network-123', 10);
		expect(get(speedTestHistoryStore).results).toHaveLength(1);

		speedTestHistoryStore.clear();

		const state = get(speedTestHistoryStore);
		expect(state.results).toEqual([]);
		expect(state.limit).toBe(10);
	});
});
