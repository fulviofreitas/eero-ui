/**
 * WAN Throughput Store (eero-ui#458: `GET /metrics/network/wan`)
 *
 * Single per-network store for the Diagnostics card, modelled on `roaming.ts`.
 * A monotonically increasing request sequence number makes only the most recently
 * issued request's response win, so a slow older range never overwrites a
 * newer one. A network change clears `data` immediately; a same-network
 * range change keeps the stale data in place while loading.
 */

import { writable, get } from 'svelte/store';
import { api, ApiClientError } from '#lib/api/client.js';
import type { WanThroughputRange, WanThroughputSeries } from '#lib/api/types.js';

export interface WanThroughputFetchOptions {
	range?: WanThroughputRange;
}

interface WanThroughputState {
	data: WanThroughputSeries | null;
	/** `false` when the server has the feature switched off; `null` until first response. */
	enabled: boolean | null;
	range: WanThroughputRange;
	networkId: string | null;
	loading: boolean;
	error: string | null;
	lastUpdated: Date | null;
}

const initialState: WanThroughputState = {
	data: null,
	enabled: null,
	range: '24h',
	networkId: null,
	loading: false,
	error: null,
	lastUpdated: null
};

/** Range options for `TimeRangeSelector`. */
export const WAN_RANGE_OPTIONS: { value: WanThroughputRange; label: string }[] = [
	{ value: '1h', label: '1h' },
	{ value: '6h', label: '6h' },
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' }
];

function createWanThroughputStore() {
	const { subscribe, set, update } = writable<WanThroughputState>(initialState);
	let latestRequestSeq = 0;

	const storeApi = {
		subscribe,

		async fetch(networkId: string, opts: WanThroughputFetchOptions = {}): Promise<void> {
			const requestSeq = ++latestRequestSeq;
			const current = get({ subscribe });
			const range = opts.range ?? current.range;
			const isNetworkChange = networkId !== current.networkId;

			update((s) => ({
				...s,
				networkId,
				range,
				loading: true,
				error: null,
				...(isNetworkChange ? { data: null, enabled: null, lastUpdated: null } : {})
			}));

			try {
				const result = await api.metrics.wanThroughput(networkId, range);
				if (requestSeq !== latestRequestSeq) return;
				update((s) => ({
					...s,
					enabled: result.enabled,
					data: { download: result.download, upload: result.upload },
					loading: false,
					lastUpdated: new Date()
				}));
			} catch (error) {
				if (requestSeq !== latestRequestSeq) return;
				update((s) => ({ ...s, loading: false, error: messageFor(error) }));
			}
		},

		/** Change the time range and refetch for the current network. */
		async setRange(range: WanThroughputRange): Promise<void> {
			const current = get({ subscribe });
			if (!current.networkId) {
				update((s) => ({ ...s, range }));
				return;
			}
			await storeApi.fetch(current.networkId, { range });
		},

		clear(): void {
			latestRequestSeq += 1;
			set(initialState);
		}
	};

	return storeApi;
}

function messageFor(error: unknown): string {
	if (error instanceof ApiClientError) {
		if (error.status === 503) return 'Metrics are unavailable.';
		if (error.detail) return error.detail;
	}
	return error instanceof Error ? error.message : 'Failed to load WAN throughput';
}

export const wanThroughputStore = createWanThroughputStore();
