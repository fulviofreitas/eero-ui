/**
 * Speed Test History Store
 *
 * Loads past speed-test results for a network (phase-6.0-revamp.md § 7 WP6,
 * deliverable 1: `GET /networks/{id}/speedtests?limit=1..50`). Read-only -
 * running a new test stays with `networksStore.runSpeedTest` (stores/networks.ts),
 * which already owns the poll loop for a freshly-started test's result.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { SpeedTestResult } from '$api/types';

export type SpeedTestHistoryLimit = 10 | 25 | 50;

interface SpeedTestHistoryState {
	results: SpeedTestResult[];
	limit: SpeedTestHistoryLimit;
	loading: boolean;
	error: string | null;
}

const initialState: SpeedTestHistoryState = {
	results: [],
	limit: 10,
	loading: false,
	error: null
};

function createSpeedTestHistoryStore() {
	const { subscribe, set, update } = writable<SpeedTestHistoryState>(initialState);

	return {
		subscribe,

		/**
		 * Fetch speed-test history for a network at the given limit (10/25/50).
		 * Callers switching limits should call this again with the new value.
		 */
		async fetch(networkId: string, limit: SpeedTestHistoryLimit = 10): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null, limit }));

			try {
				const results = await api.networks.speedTestHistory(networkId, { limit });
				update((s) => ({ ...s, results, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load speed test history'
				}));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const speedTestHistoryStore = createSpeedTestHistoryStore();
