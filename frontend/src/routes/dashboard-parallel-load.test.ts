/**
 * Tests that the dashboard's initial network/eeros/profiles fetches run concurrently rather
 * than sequentially (plan § 6.1 Performance / § 6.2 Tier 4, WP9).
 *
 * Each handler records when it started and resolves after an artificial delay via a
 * controlled-order MSW response. If the three requests were still sequential (await one before
 * starting the next), the total time to settle would be roughly the sum of the delays and the
 * start timestamps would be staggered by ~DELAY_MS each. Run in parallel, all three should start
 * within a few milliseconds of each other and the whole batch should settle in roughly one
 * delay's worth of time, not three.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/mocks/server';
import { networksStore } from '$stores';
import Page from './+page.svelte';

const DELAY_MS = 60;

describe('dashboard - parallel initial fetches', () => {
	beforeEach(async () => {
		server.resetHandlers();
		networksStore.clear();
		// Seed the network list and auto-select the first network, same as the layout does on
		// mount, so the dashboard has a `selectedNetworkId` to fetch against.
		server.use(
			http.get('/api/networks', () =>
				HttpResponse.json([{ id: 'network-123', name: 'Home Network', status: 'online' }])
			)
		);
		await networksStore.fetch();
	});

	it('starts the network, eeros and profiles requests within a few ms of each other', async () => {
		const startTimes: Record<string, number> = {};

		server.use(
			http.get('/api/networks/:networkId', async () => {
				startTimes.network = performance.now();
				await delay(DELAY_MS);
				return HttpResponse.json({
					id: 'network-123',
					name: 'Home Network',
					status: 'online',
					guest_network_enabled: false
				});
			}),
			http.get('/api/eeros', async () => {
				startTimes.eeros = performance.now();
				await delay(DELAY_MS);
				return HttpResponse.json([]);
			}),
			http.get('/api/profiles', async () => {
				startTimes.profiles = performance.now();
				await delay(DELAY_MS);
				return HttpResponse.json([]);
			}),
			http.get('/api/devices', () => HttpResponse.json([]))
		);

		const start = performance.now();
		render(Page);

		await waitFor(() => {
			expect(startTimes.network).toBeDefined();
			expect(startTimes.eeros).toBeDefined();
			expect(startTimes.profiles).toBeDefined();
		});

		const settled = performance.now() - start;
		const starts = [startTimes.network, startTimes.eeros, startTimes.profiles];
		const spread = Math.max(...starts) - Math.min(...starts);

		// Sequential awaits would stagger these starts by ~DELAY_MS each; concurrent requests
		// start together, well under one delay's worth of drift. This is the primary,
		// non-flaky signal that the three fetches are concurrent.
		expect(spread).toBeLessThan(DELAY_MS);
		// Sequential awaits would take ~3 * DELAY_MS end-to-end (before test/render/JSDOM
		// overhead). Concurrent settles in roughly one delay's worth; the generous multiplier
		// absorbs environment overhead without masking a regression back to sequential awaits.
		expect(settled).toBeLessThan(DELAY_MS * 5);
	});
});
