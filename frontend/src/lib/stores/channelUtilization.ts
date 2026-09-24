/**
 * Channel Utilisation Store
 *
 * Wi-Fi channel utilisation series for a network (phase-6.0-revamp.md § 7
 * WP6, deliverable 8: `GET /networks/{id}/channel-utilization`). Single
 * per-network store (Diagnostics tab only mounts one at a time) tracking the
 * selected band/eero/time-range alongside the raw (shape-undocumented)
 * result - rendered defensively by `ChannelUtilizationCard`.
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type { ChannelUtilizationBand, ChannelUtilizationResponse } from '$api/types';

export type ChannelUtilizationRange = '24h' | '7d' | '30d';

interface ChannelUtilizationState {
	data: ChannelUtilizationResponse | null;
	range: ChannelUtilizationRange;
	band: ChannelUtilizationBand | null;
	eeroId: number | null;
	loading: boolean;
	error: string | null;
	unavailable: boolean;
}

const initialState: ChannelUtilizationState = {
	data: null,
	range: '24h',
	band: null,
	eeroId: null,
	loading: false,
	error: null,
	unavailable: false
};

/** `range` -> {granularity (minutes), windowMs}. */
function windowFor(range: ChannelUtilizationRange): { granularity: number; windowMs: number } {
	switch (range) {
		case '7d':
			return { granularity: 60, windowMs: 7 * 24 * 60 * 60 * 1000 };
		case '30d':
			return { granularity: 240, windowMs: 30 * 24 * 60 * 60 * 1000 };
		case '24h':
		default:
			return { granularity: 5, windowMs: 24 * 60 * 60 * 1000 };
	}
}

export interface ChannelUtilizationFetchParams {
	range: ChannelUtilizationRange;
	band?: ChannelUtilizationBand | null;
	eeroId?: number | null;
}

function createChannelUtilizationStore() {
	const { subscribe, set, update } = writable<ChannelUtilizationState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string, params: ChannelUtilizationFetchParams): Promise<void> {
			const { range, band = null, eeroId = null } = params;
			update((s) => ({
				...s,
				range,
				band,
				eeroId,
				loading: true,
				error: null,
				unavailable: false
			}));

			const { granularity, windowMs } = windowFor(range);
			const end = new Date();
			const start = new Date(end.getTime() - windowMs);

			try {
				const data = await api.networks.getChannelUtilization(networkId, {
					start: start.toISOString(),
					end: end.toISOString(),
					...(band && { band }),
					...(eeroId !== null && { eeroId }),
					granularity
				});
				update((s) => ({ ...s, data, loading: false }));
			} catch (error) {
				if (error instanceof ApiClientError && error.type === 'feature_unavailable') {
					update((s) => ({ ...s, loading: false, unavailable: true }));
					return;
				}
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load channel utilisation'
				}));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const channelUtilizationStore = createChannelUtilizationStore();
