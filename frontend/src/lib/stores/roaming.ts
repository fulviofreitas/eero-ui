/**
 * Device Roaming Events Store
 *
 * Roaming events for a network (eero-ui#431: `GET /metrics/roaming`), newest
 * first, with per-device filtering and a top-roamers summary. Single
 * per-network store (the roaming tab only mounts one at a time), tracking
 * the selected time range and optional device filter alongside the result -
 * same pattern as `channelUtilization.ts`/`events.ts`.
 *
 * Guards against out-of-order responses: `setRange`/`fetch` can be called in
 * quick succession (e.g. a user clicking through ranges), and a slow older
 * request must never overwrite a newer one's result. A monotonically
 * increasing request token, checked before each response is applied, makes
 * only the most recently *issued* request's response ever win.
 */

import { writable, get } from 'svelte/store';
import { api, ApiClientError } from '#lib/api/client.js';
import type { RoamingResponse, RoamingRange } from '#lib/api/types.js';

export interface RoamingFetchOptions {
	range?: RoamingRange;
	deviceId?: string | null;
}

interface RoamingState {
	data: RoamingResponse | null;
	range: RoamingRange;
	deviceId: string | null;
	networkId: string | null;
	loading: boolean;
	error: string | null;
	lastUpdated: Date | null;
}

const initialState: RoamingState = {
	data: null,
	range: '24h',
	deviceId: null,
	networkId: null,
	loading: false,
	error: null,
	lastUpdated: null
};

/** Range options for `TimeRangeSelector` (WP4 consumes this directly). */
export const ROAMING_RANGE_OPTIONS: { value: RoamingRange; label: string }[] = [
	{ value: '1h', label: '1h' },
	{ value: '6h', label: '6h' },
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' }
];

function createRoamingStore() {
	const { subscribe, set, update } = writable<RoamingState>(initialState);

	// Bumped on every `fetch` call; a response is only applied if its token is
	// still the latest one issued by the time it resolves.
	let requestToken = 0;

	const storeApi = {
		subscribe,

		/**
		 * Fetch (or re-fetch, on a range/device change) roaming events for a
		 * network. `opts.range` defaults to the store's current range (or
		 * `'24h'` on first call); `opts.deviceId` narrows to one device's
		 * history, or pass `null`/omit to clear a previous filter.
		 */
		async fetch(networkId: string, opts: RoamingFetchOptions = {}): Promise<void> {
			const token = ++requestToken;

			const current = get({ subscribe });
			const range = opts.range ?? current.range;
			const deviceId = opts.deviceId !== undefined ? opts.deviceId : current.deviceId;

			update((s) => ({ ...s, networkId, range, deviceId, loading: true, error: null }));

			try {
				const data = await api.metrics.roaming(networkId, range, deviceId ?? undefined);
				if (token !== requestToken) {
					// A newer request has since been issued - discard this result.
					return;
				}
				update((s) => ({ ...s, data, loading: false, lastUpdated: new Date() }));
			} catch (error) {
				if (token !== requestToken) {
					return;
				}
				update((s) => ({ ...s, loading: false, error: messageFor(error) }));
			}
		},

		/** Change the time range and refetch with the current network/device. */
		async setRange(range: RoamingRange): Promise<void> {
			const current = get({ subscribe });
			if (!current.networkId) {
				update((s) => ({ ...s, range }));
				return;
			}
			await storeApi.fetch(current.networkId, { range });
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			requestToken += 1;
			set(initialState);
		}
	};

	return storeApi;
}

/** Map an error to a user-facing message, per eero-ui#431's error contract. */
function messageFor(error: unknown): string {
	if (error instanceof ApiClientError) {
		if (error.status === 422) {
			// Too many series for the requested range - the backend's own
			// detail already tells the user what to do ("narrow the range or
			// filter a device").
			return error.detail || 'Narrow the range or filter a device.';
		}
		if (error.status === 503) {
			return 'Metrics are unavailable.';
		}
		if (error.detail) {
			return error.detail;
		}
	}
	return error instanceof Error ? error.message : 'Failed to load roaming events';
}

export const roamingStore = createRoamingStore();
