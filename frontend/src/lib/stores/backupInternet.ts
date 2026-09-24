/**
 * Backup Internet Store
 *
 * Backup-internet (cellular failover) status, cellular usage/events and
 * configured backup Wi-Fi access points for a network (phase-6.0-revamp.md §
 * 7 WP6, deliverable 11: `GET /networks/{id}/backup-internet` and
 * `/backup-access-points`). Single per-network store (Advanced tab only
 * mounts one at a time), same pattern as `events.ts`.
 *
 * Plus-gated: a 402 from either call is recorded as `premiumRequired` rather
 * than `error`, matching `dataUsage.ts`/`insights.ts`.
 *
 * The enable/disable toggle (phase-6.0-revamp.md § 7 WP7, family 11) is an
 * unverified, non-settings write (plan § 5): pessimistic, gated on
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side, never retried
 * (`client.ts` passes `retries: 0`), re-fetches this store on success.
 *
 * The backup access point add/edit/delete/reorder/discover/check controls
 * (phase-6.0-revamp.md § 7 WP7, family 5) follow the same policy: pessimistic,
 * gated, `retries: 0`, re-fetch on success for add/edit/delete/reorder.
 * `discover`/`check` are read-only round trips against the eero cloud (they
 * do not change configured state) and store their own result rather than
 * re-fetching the access-point list.
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type {
	BackupAccessPoint,
	BackupAccessPointCreateRequest,
	BackupAccessPointUpdateRequest,
	BackupInternetStatus,
	DiscoveredBackupSsid
} from '$api/types';

interface BackupInternetState {
	status: BackupInternetStatus | null;
	accessPoints: BackupAccessPoint[];
	loading: boolean;
	/** True while the enable/disable write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
	premiumRequired: boolean;
	/** SSIDs found by the most recent discovery run, or `null` before one has run. */
	discovered: DiscoveredBackupSsid[] | null;
	/** Result of the most recent connectivity check, or `null` before one has run. */
	checkResult: DiscoveredBackupSsid | null;
}

const initialState: BackupInternetState = {
	status: null,
	accessPoints: [],
	loading: false,
	applying: false,
	error: null,
	premiumRequired: false,
	discovered: null,
	checkResult: null
};

function createBackupInternetStore() {
	const { subscribe, set, update } = writable<BackupInternetState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null, premiumRequired: false }));
			try {
				const [status, accessPoints] = await Promise.all([
					api.networks.getBackupInternet(networkId),
					api.networks.getBackupAccessPoints(networkId)
				]);
				update((s) => ({
					...s,
					status,
					accessPoints: accessPoints.access_points,
					loading: false
				}));
			} catch (error) {
				if (error instanceof ApiClientError && error.type === 'premium_required') {
					update((s) => ({ ...s, loading: false, premiumRequired: true }));
					return;
				}
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load backup internet'
				}));
			}
		},

		/**
		 * Enable/disable backup internet (cellular failover). Pessimistic -
		 * re-fetches the store on success. Returns the backend's own
		 * `changed` flag (`false` means the no-op guard skipped the write).
		 */
		async updateEnabled(networkId: string, enabled: boolean): Promise<boolean> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.updateBackupInternet(networkId, enabled);
				await this.fetch(networkId);
				return result.changed;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Add a backup Wi-Fi access point. Pessimistic - re-fetches on success. */
		async addAccessPoint(networkId: string, body: BackupAccessPointCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.addBackupAccessPoint(networkId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Update a backup Wi-Fi access point. Pessimistic - re-fetches on success. */
		async updateAccessPoint(
			networkId: string,
			apId: string,
			body: BackupAccessPointUpdateRequest
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.updateBackupAccessPoint(networkId, apId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Delete a backup Wi-Fi access point. Pessimistic - re-fetches on success. */
		async deleteAccessPoint(networkId: string, apId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.deleteBackupAccessPoint(networkId, apId);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Reorder backup Wi-Fi access points. Pessimistic - re-fetches on
		 * success. `order` is the full desired-priority id list.
		 */
		async reorderAccessPoints(networkId: string, order: string[]): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.reorderBackupAccessPoints(networkId, order);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Start backup-SSID discovery. Stores the result in `discovered`
		 * rather than re-fetching the access-point list (discovery does not
		 * change configured access points).
		 */
		async discover(networkId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.discoverBackupSsids(networkId);
				update((s) => ({ ...s, discovered: result.ssids }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Run a backup-connectivity check. Stores the result in
		 * `checkResult` rather than re-fetching the access-point list.
		 */
		async check(networkId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.backupConnectivityCheck(networkId);
				update((s) => ({ ...s, checkResult: result }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const backupInternetStore = createBackupInternetStore();
