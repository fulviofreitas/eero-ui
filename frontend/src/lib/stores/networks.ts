/**
 * Networks Store
 *
 * Manages available networks and the currently selected network.
 */

import { writable, derived, get } from 'svelte/store';
import { api } from '$api/client';
import type { NetworkSummary, SpeedTestResult } from '$api/types';
import { withSettingsLock } from './settingsLock';

// ============================================
// Types
// ============================================

interface NetworksState {
	networks: NetworkSummary[];
	selectedNetworkId: string | null;
	loading: boolean;
	error: string | null;
}

/**
 * State for an in-progress or completed speed test on one network.
 *
 * Speed test is a **Verified** write (plan § 5), but its result is not in
 * the POST response on eero-api v8 - `run_speed_test` returns 202 with
 * `data: null` (plan decision 4). The store starts the test, then polls
 * `GET /networks/{id}/speedtests?limit=1` every 5s for up to 90s, comparing
 * the polled result's timestamp against the time the test was started so a
 * stale (pre-test) history entry is never mistaken for the new result.
 */
interface SpeedTestState {
	networkId: string | null;
	running: boolean;
	/** Whole seconds elapsed since the test was started - drives "running… Ns". */
	elapsedSeconds: number;
	result: SpeedTestResult | null;
	error: string | null;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 90000;

// ============================================
// Store
// ============================================

const STORAGE_KEY = 'eero_selected_network';

// Load initial selection from localStorage
function getInitialNetworkId(): string | null {
	if (typeof window !== 'undefined') {
		return localStorage.getItem(STORAGE_KEY);
	}
	return null;
}

const initialState: NetworksState = {
	networks: [],
	selectedNetworkId: getInitialNetworkId(),
	loading: false,
	error: null
};

const initialSpeedTestState: SpeedTestState = {
	networkId: null,
	running: false,
	elapsedSeconds: 0,
	result: null,
	error: null
};

/** Parses a speed-test result timestamp; treats anything unparseable as "not newer". */
function resultTime(result: SpeedTestResult | null): number {
	if (!result?.timestamp) return -Infinity;
	const parsed = Date.parse(result.timestamp);
	return Number.isNaN(parsed) ? -Infinity : parsed;
}

function createNetworksStore() {
	const { subscribe, set, update } = writable<NetworksState>(initialState);
	const speedTestStore = writable<SpeedTestState>(initialSpeedTestState);

	return {
		subscribe,

		/**
		 * Fetch all available networks
		 */
		async fetch(refresh = false): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const networks = await api.networks.list(refresh);

				update((s) => {
					// If no network is selected, or selected network doesn't exist, select the first one
					let selectedNetworkId = s.selectedNetworkId;

					if (!selectedNetworkId || !networks.find((n) => n.id === selectedNetworkId)) {
						selectedNetworkId = networks.length > 0 ? networks[0].id : null;

						// Persist to localStorage
						if (selectedNetworkId && typeof window !== 'undefined') {
							localStorage.setItem(STORAGE_KEY, selectedNetworkId);
						}

						// Set as preferred on backend
						if (selectedNetworkId) {
							api.networks.setPreferred(selectedNetworkId).catch(console.error);
						}
					}

					return {
						...s,
						networks,
						selectedNetworkId,
						loading: false
					};
				});
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to fetch networks'
				}));
			}
		},

		/**
		 * Select a network
		 */
		async selectNetwork(networkId: string): Promise<void> {
			const state = get({ subscribe });

			// Verify network exists
			if (!state.networks.find((n) => n.id === networkId)) {
				console.error(`Network ${networkId} not found`);
				return;
			}

			update((s) => ({ ...s, selectedNetworkId: networkId }));

			// Persist to localStorage
			if (typeof window !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, networkId);
			}

			// Set as preferred on backend
			try {
				await api.networks.setPreferred(networkId);
			} catch (error) {
				console.error('Failed to set preferred network:', error);
			}
		},

		/**
		 * Rename a network.
		 *
		 * Settings-class write (plan § 5): a rename is assumed to reboot the
		 * mesh (decision 5), so this is pessimistic, runs under the shared
		 * per-network `settingsLock` (also used by `dns.ts` - both PUT the
		 * same `settings` link and must never overlap), and skips the write
		 * entirely - client-side, before ever touching the lock or the API -
		 * when the requested name matches the current one. The confirmation
		 * dialog naming the reboot lives in the calling component, matching
		 * the DNS settings card's pattern.
		 */
		async renameNetwork(
			networkId: string,
			name: string
		): Promise<import('$api/types').NetworkRenameResponse> {
			const trimmed = name.trim();
			const current = get({ subscribe }).networks.find((n) => n.id === networkId);

			if (current && current.name === trimmed) {
				return { success: true, changed: false, network_id: networkId, name: trimmed };
			}

			const result = await withSettingsLock(networkId, () =>
				api.networks.setName(networkId, trimmed)
			);

			if (result.changed) {
				update((s) => ({
					...s,
					networks: s.networks.map((n) => (n.id === networkId ? { ...n, name: result.name } : n))
				}));
			}

			return result;
		},

		/**
		 * Run a speed test and poll for its result.
		 *
		 * Verified write (plan § 5) - the POST itself is safe to fire, but its
		 * result is not in the response (decision 4), so this polls
		 * `GET /networks/{id}/speedtests?limit=1` every 5s for up to 90s,
		 * accepting only a result timestamped after the test was started.
		 * `speedTestStore` exposes `running`/`elapsedSeconds` so the UI can
		 * show progress; stops cleanly on success, timeout, or a thrown error
		 * from the initiating POST.
		 */
		async runSpeedTest(networkId: string): Promise<SpeedTestResult> {
			speedTestStore.set({
				networkId,
				running: true,
				elapsedSeconds: 0,
				result: null,
				error: null
			});

			const startedAt = Date.now();

			try {
				await api.networks.speedTest(networkId);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to start speed test';
				speedTestStore.set({
					networkId,
					running: false,
					elapsedSeconds: 0,
					result: null,
					error: message
				});
				throw error;
			}

			while (true) {
				const elapsedMs = Date.now() - startedAt;
				speedTestStore.update((s) => ({ ...s, elapsedSeconds: Math.floor(elapsedMs / 1000) }));

				if (elapsedMs >= POLL_TIMEOUT_MS) {
					const message = 'Speed test timed out waiting for a result.';
					speedTestStore.update((s) => ({ ...s, running: false, error: message }));
					throw new Error(message);
				}

				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

				let history: SpeedTestResult[];
				try {
					history = await api.networks.speedTestHistory(networkId, 1);
				} catch {
					// Transient read failure while polling - keep waiting for the
					// next tick rather than failing the whole test.
					continue;
				}

				const latest = history[0] ?? null;
				if (latest && resultTime(latest) >= startedAt) {
					speedTestStore.set({
						networkId,
						running: false,
						elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
						result: latest,
						error: null
					});
					return latest;
				}
			}
		},

		/**
		 * Clear store (on logout)
		 */
		clear(): void {
			if (typeof window !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
			}
			set(initialState);
			speedTestStore.set(initialSpeedTestState);
		},

		/** Internal: exposed for the derived `speedTestState` export below. */
		_speedTestStore: speedTestStore
	};
}

export const networksStore = createNetworksStore();

// Derived: speed-test progress/result for the network under test
export const speedTestState = derived(networksStore._speedTestStore, ($speedTest) => $speedTest);

// Derived: currently selected network
export const selectedNetwork = derived(
	networksStore,
	($store) => $store.networks.find((n) => n.id === $store.selectedNetworkId) || null
);

// Derived: selected network ID
export const selectedNetworkId = derived(networksStore, ($store) => $store.selectedNetworkId);

// Derived: has multiple networks
export const hasMultipleNetworks = derived(networksStore, ($store) => $store.networks.length > 1);

// Derived: loading state
export const isNetworksLoading = derived(networksStore, ($store) => $store.loading);
