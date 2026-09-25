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
 *
 * Keyed by network id (REVIEWER finding, High): a dashboard and a network
 * detail page can both be mounted and can both trigger a speed test for
 * different networks, and a second test on the *same* network (e.g. a
 * double-click) must not have its poll loop clobber the newer run's state.
 */
interface SpeedTestState {
	networkId: string;
	running: boolean;
	/** Whole seconds elapsed since the test was started - drives "running… Ns". */
	elapsedSeconds: number;
	result: SpeedTestResult | null;
	error: string | null;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 90000;

function defaultSpeedTestState(networkId: string): SpeedTestState {
	return { networkId, running: false, elapsedSeconds: 0, result: null, error: null };
}

/** `DOMException('AbortError')` isn't constructible in every test environment; a plain tagged Error is enough. */
function speedTestAbortedError(): Error {
	const error = new Error('Speed test cancelled.');
	error.name = 'AbortError';
	return error;
}

function speedTestSupersededError(): Error {
	return new Error('Speed test superseded by a newer run for this network.');
}

/**
 * `setTimeout` wrapped so cancellation via `AbortSignal` stops the wait
 * immediately (REVIEWER finding, Medium) rather than waiting out the full
 * 5s poll interval before the loop notices it was cancelled.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(speedTestAbortedError());
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			reject(speedTestAbortedError());
		}
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

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

/** Parses a speed-test result timestamp; treats anything unparseable as "not newer". */
function resultTime(result: SpeedTestResult | null): number {
	if (!result?.timestamp) return -Infinity;
	const parsed = Date.parse(result.timestamp);
	return Number.isNaN(parsed) ? -Infinity : parsed;
}

function createNetworksStore() {
	const { subscribe, set, update } = writable<NetworksState>(initialState);
	/** Per-network speed-test state (REVIEWER finding, High - keyed reentrancy). */
	const speedTestStates = writable<Map<string, SpeedTestState>>(new Map());
	/** The one run per network whose writes are allowed to land - a newer `runSpeedTest` call for the same network replaces it. */
	const currentSpeedTestRuns = new Map<string, symbol>();

	function patchSpeedTestState(networkId: string, patch: Partial<SpeedTestState>): void {
		speedTestStates.update((map) => {
			const next = new Map(map);
			const existing = next.get(networkId) ?? defaultSpeedTestState(networkId);
			next.set(networkId, { ...existing, ...patch });
			return next;
		});
	}

	/**
	 * POST the speed test start and resolve the server's `started_at` as epoch millis. On
	 * failure, records the error on the store (if this run is still current) and rethrows.
	 */
	async function startSpeedTest(networkId: string, isCurrent: () => boolean): Promise<number> {
		try {
			const start = await api.networks.speedTest(networkId);
			const startedAtMs = Date.parse(start.started_at);
			// Defensive only - the backend contract guarantees `started_at`.
			return Number.isNaN(startedAtMs) ? Date.now() : startedAtMs;
		} catch (error) {
			if (isCurrent()) {
				const message = error instanceof Error ? error.message : 'Failed to start speed test';
				patchSpeedTestState(networkId, {
					running: false,
					elapsedSeconds: 0,
					result: null,
					error: message
				});
			}
			throw error;
		}
	}

	/**
	 * One iteration of the speed-test poll loop: checks for cancellation/supersession, updates
	 * elapsed time, times out past `POLL_TIMEOUT_MS`, waits `POLL_INTERVAL_MS`, then fetches the
	 * latest result. Returns the result once one lands at/after `startedAtMs`, or `null` to keep
	 * polling.
	 */
	async function pollSpeedTestOnce(
		networkId: string,
		startedAtMs: number,
		isCurrent: () => boolean,
		signal?: AbortSignal
	): Promise<SpeedTestResult | null> {
		if (signal?.aborted) {
			if (isCurrent()) patchSpeedTestState(networkId, { running: false });
			throw speedTestAbortedError();
		}
		if (!isCurrent()) throw speedTestSupersededError();

		const elapsedMs = Date.now() - startedAtMs;
		patchSpeedTestState(networkId, { elapsedSeconds: Math.max(0, Math.floor(elapsedMs / 1000)) });

		if (elapsedMs >= POLL_TIMEOUT_MS) {
			const message = 'Speed test timed out waiting for a result.';
			if (isCurrent()) patchSpeedTestState(networkId, { running: false, error: message });
			throw new Error(message);
		}

		try {
			await delay(POLL_INTERVAL_MS, signal);
		} catch (error) {
			if (isCurrent()) patchSpeedTestState(networkId, { running: false });
			throw error;
		}

		if (!isCurrent()) throw speedTestSupersededError();

		let history: SpeedTestResult[];
		try {
			history = await api.networks.speedTestHistory(networkId, { limit: 1 });
		} catch {
			// Transient read failure while polling - keep waiting for the next tick rather than
			// failing the whole test.
			return null;
		}

		if (!isCurrent()) throw speedTestSupersededError();

		const latest = history[0] ?? null;
		if (latest && resultTime(latest) >= startedAtMs) {
			patchSpeedTestState(networkId, {
				running: false,
				elapsedSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
				result: latest,
				error: null
			});
			return latest;
		}
		return null;
	}

	return {
		subscribe,

		/**
		 * Fetch all available networks
		 */
		async fetch(refresh = false): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const networks = await api.networks.list(refresh);

				let selectedNetworkId: string | null = null;

				update((s) => {
					// If no network is selected, or selected network doesn't exist, select the first one
					selectedNetworkId = s.selectedNetworkId;

					if (!selectedNetworkId || !networks.find((n) => n.id === selectedNetworkId)) {
						selectedNetworkId = networks.length > 0 ? networks[0].id : null;

						// Persist to localStorage
						if (selectedNetworkId && typeof window !== 'undefined') {
							localStorage.setItem(STORAGE_KEY, selectedNetworkId);
						}
					}

					return {
						...s,
						networks,
						selectedNetworkId,
						loading: false
					};
				});

				// Always re-send the preferred network on every fetch (issue #401): the
				// backend's "preferred network" is in-memory and empty after a restart,
				// so a stored-but-valid selection must be re-asserted, not just the
				// fallback-to-first-network case. Awaited so callers (e.g. +layout's
				// onMount) can rely on the backend knowing the right network before
				// firing off data fetches that depend on it.
				if (selectedNetworkId) {
					try {
						await api.networks.setPreferred(selectedNetworkId);
					} catch (error) {
						console.error('Failed to set preferred network:', error);
					}
				}
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
		 * accepting only a result timestamped at/after the server's
		 * `started_at` (REVIEWER finding, High - never the browser's
		 * `Date.now()`, which is skewed by clock drift and by however long the
		 * POST round trip took).
		 *
		 * Reentrancy (REVIEWER finding, High): state is keyed by `networkId`.
		 * Calling this again for the same network before the first call
		 * settles supersedes it - the older run's poll loop stops writing to
		 * the store (checked before every write) and its promise rejects
		 * rather than resolving with a stale result.
		 *
		 * Cancellation (REVIEWER finding, Medium): pass `signal` to stop
		 * polling immediately - including cutting short the 5s wait between
		 * polls - rather than waiting out the current tick.
		 */
		async runSpeedTest(
			networkId: string,
			options: { signal?: AbortSignal } = {}
		): Promise<SpeedTestResult> {
			const { signal } = options;
			const token = Symbol('speedtest-run');
			currentSpeedTestRuns.set(networkId, token);
			// Reference equality on a run-scoped Symbol used for reentrancy bookkeeping, not a
			// secret/token comparison - there is nothing here for a timing side-channel to leak.
			const isCurrent = () => currentSpeedTestRuns.get(networkId) === token; // nosemgrep: javascript_timing_rule-possible-timing-attacks, rules_lgpl_javascript_crypto_rule-node-timing-attack

			if (signal?.aborted) {
				throw speedTestAbortedError();
			}

			patchSpeedTestState(networkId, {
				running: true,
				elapsedSeconds: 0,
				result: null,
				error: null
			});

			const startedAtMs = await startSpeedTest(networkId, isCurrent);

			while (true) {
				const result = await pollSpeedTestOnce(networkId, startedAtMs, isCurrent, signal);
				if (result) return result;
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
			speedTestStates.set(new Map());
			currentSpeedTestRuns.clear();
		},

		/** Internal: exposed for the `speedTestFor` export below. */
		_speedTestStates: speedTestStates
	};
}

export const networksStore = createNetworksStore();

/** Speed-test progress/result for one network - keyed, since more than one network's test can be tracked at once. */
export function speedTestFor(networkId: string) {
	return derived(
		networksStore._speedTestStates,
		($map) => $map.get(networkId) ?? defaultSpeedTestState(networkId)
	);
}

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
