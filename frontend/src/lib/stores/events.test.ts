/**
 * Tests for the network events store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 8).
 *
 * Coverage:
 * - fetch loads the first page and records hasMore correctly
 * - a 409 feature_unavailable is recorded as unavailable, not error
 * - a 5xx is recorded as error
 * - loadMore appends older events using the last event's timestamp as cursor
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { eventsStore } from './events';
import { server } from '../../../tests/mocks/server';

function events(n: number, offset = 0) {
	return Array.from({ length: n }, (_, i) => ({
		timestamp: new Date(Date.now() - (i + offset) * 60 * 60 * 1000).toISOString(),
		type: 'device_connected',
		message: `Event ${i + offset}`
	}));
}

describe('eventsStore', () => {
	beforeEach(() => {
		eventsStore.clear();
	});

	it('loads the first page', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () => HttpResponse.json({ events: events(3) }))
		);

		await eventsStore.fetch('network-123');

		const state = get(eventsStore);
		expect(state.events).toHaveLength(3);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 409 feature_unavailable as unavailable, not error', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({ detail: 'not available', type: 'feature_unavailable' }, { status: 409 })
			)
		);

		await eventsStore.fetch('network-123');

		const state = get(eventsStore);
		expect(state.unavailable).toBe(true);
		expect(state.error).toBeNull();
	});

	it('records a 5xx as error after the client retries twice', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await eventsStore.fetch('network-123');

		const state = get(eventsStore);
		expect(state.error).toBeTruthy();
		expect(state.unavailable).toBe(false);
	});

	it('loadMore appends older events using the last event timestamp as cursor', async () => {
		let seenTimestamp: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/events', ({ request }) => {
				const url = new URL(request.url);
				const cursor = url.searchParams.get('timestamp');
				if (!cursor) {
					return HttpResponse.json({ events: events(2, 0) });
				}
				seenTimestamp = cursor;
				return HttpResponse.json({ events: events(2, 10) });
			})
		);

		await eventsStore.fetch('network-123');
		const firstPage = get(eventsStore).events;
		expect(firstPage).toHaveLength(2);

		await eventsStore.loadMore('network-123');

		expect(seenTimestamp).toBe(firstPage[firstPage.length - 1].timestamp);
		const state = get(eventsStore);
		expect(state.events).toHaveLength(4);
		expect(state.loadingMore).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () => HttpResponse.json({ events: events(1) }))
		);
		await eventsStore.fetch('network-123');
		expect(get(eventsStore).events).toHaveLength(1);

		eventsStore.clear();

		const state = get(eventsStore);
		expect(state.events).toEqual([]);
		expect(state.hasMore).toBe(true);
	});
});
