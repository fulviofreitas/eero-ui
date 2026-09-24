/**
 * Network Events Store
 *
 * The network's app events, most recent first (phase-6.0-revamp.md § 7 WP6,
 * deliverable 8: `GET /networks/{id}/events?page_size&timestamp`). A single
 * per-network store (not keyed - only ever one network's Diagnostics tab is
 * mounted at a time), supporting "load older" pagination via the last
 * event's `timestamp` as the cursor, per the backend contract.
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';

interface EventsState {
	events: Record<string, unknown>[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	unavailable: boolean;
	/** `false` once a page comes back with no timestamp to page further on. */
	hasMore: boolean;
}

const initialState: EventsState = {
	events: [],
	loading: false,
	loadingMore: false,
	error: null,
	unavailable: false,
	hasMore: true
};

const PAGE_SIZE = 50;

/** Best-effort extraction of an event's own timestamp field for pagination. */
function timestampOf(event: Record<string, unknown>): string | null {
	const value = event.timestamp ?? event.time ?? event.created_at;
	return typeof value === 'string' ? value : null;
}

function createEventsStore() {
	const { subscribe, set, update } = writable<EventsState>(initialState);

	return {
		subscribe,

		/** Fetch the first page for a network, replacing any previous state. */
		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null, unavailable: false }));
			try {
				const result = await api.networks.getEvents(networkId, { pageSize: PAGE_SIZE });
				const last = result.events[result.events.length - 1];
				update((s) => ({
					...s,
					events: result.events,
					loading: false,
					// There is more to page through as long as this page was
					// non-empty and its last event carries a cursor to page from -
					// not tied to an exact page-size match, which would wrongly
					// hide "Load older" for a final page that happens to be full.
					hasMore: result.events.length > 0 && !!(last && timestampOf(last))
				}));
			} catch (error) {
				if (error instanceof ApiClientError && error.type === 'feature_unavailable') {
					update((s) => ({ ...s, loading: false, unavailable: true }));
					return;
				}
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load events'
				}));
			}
		},

		/** Load the next (older) page, appending to `events`. */
		async loadMore(networkId: string): Promise<void> {
			let cursor: string | null = null;
			update((s) => {
				const last = s.events[s.events.length - 1];
				cursor = last ? timestampOf(last) : null;
				return { ...s, loadingMore: true, error: null };
			});
			if (!cursor) {
				update((s) => ({ ...s, loadingMore: false, hasMore: false }));
				return;
			}
			try {
				const result = await api.networks.getEvents(networkId, {
					pageSize: PAGE_SIZE,
					timestamp: cursor
				});
				const last = result.events[result.events.length - 1];
				update((s) => ({
					...s,
					events: [...s.events, ...result.events],
					loadingMore: false,
					hasMore: result.events.length > 0 && !!(last && timestampOf(last))
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loadingMore: false,
					error: error instanceof Error ? error.message : 'Failed to load older events'
				}));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const eventsStore = createEventsStore();
