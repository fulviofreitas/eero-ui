/**
 * Tests for the insights store (phase-6.0-revamp.md § 7 WP6, deliverable 6).
 *
 * Coverage:
 * - fetch loads series for a scope+id at the requested range/type
 * - a 402 is recorded as premiumRequired, not error
 * - a 5xx (after both GET retries) is recorded as error
 * - clear/clearAll reset state
 * - two scope+id pairs are tracked independently
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { insightsStore, insightsFor } from './insights';
import { server } from '../../../tests/mocks/server';

describe('insightsStore', () => {
	beforeEach(() => {
		insightsStore.clearAll();
	});

	it('loads series for a scope+id at the requested range/type', async () => {
		let seenInsightType: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/insights', ({ request }) => {
				seenInsightType = new URL(request.url).searchParams.get('insight_type');
				return HttpResponse.json({
					series: [
						{
							insight_type: 'adblock',
							sum: 12,
							values: [{ time: '2026-01-01T00:00:00Z', value: 12 }]
						}
					]
				});
			})
		);

		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'adblock' });

		expect(seenInsightType).toBe('adblock');
		const state = get(insightsFor('network', 'network-123'));
		expect(state.series).toHaveLength(1);
		expect(state.series[0].sum).toBe(12);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
		expect(state.premiumRequired).toBe(false);
	});

	it('records a 402 as premiumRequired rather than error', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'blocked' });

		const state = get(insightsFor('network', 'network-123'));
		expect(state.premiumRequired).toBe(true);
		expect(state.error).toBeNull();
		expect(state.loading).toBe(false);
	});

	it('records a 5xx as error after the client retries twice', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'blocked' });

		const state = get(insightsFor('network', 'network-123'));
		expect(state.error).toBeTruthy();
		expect(state.premiumRequired).toBe(false);
	});

	it('tracks device and network scopes independently', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 1, values: [] }] })
			),
			http.get('/api/devices/:deviceId/insights', () =>
				HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 2, values: [] }] })
			)
		);

		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'blocked' });
		await insightsStore.fetch('device', 'dev-1', { range: '7d', insightType: 'blocked' });

		expect(get(insightsFor('network', 'network-123')).series[0].sum).toBe(1);
		expect(get(insightsFor('device', 'dev-1')).series[0].sum).toBe(2);
	});

	it('clear resets one scope+id; clearAll resets every tracked scope+id', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 1, values: [] }] })
			)
		);
		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'blocked' });
		expect(get(insightsFor('network', 'network-123')).series).toHaveLength(1);

		insightsStore.clear('network', 'network-123');
		expect(get(insightsFor('network', 'network-123')).series).toEqual([]);

		await insightsStore.fetch('network', 'network-123', { range: '7d', insightType: 'blocked' });
		insightsStore.clearAll();
		expect(get(insightsFor('network', 'network-123')).series).toEqual([]);
	});
});
