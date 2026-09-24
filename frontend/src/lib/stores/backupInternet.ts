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
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type { BackupAccessPoint, BackupInternetStatus } from '$api/types';

interface BackupInternetState {
	status: BackupInternetStatus | null;
	accessPoints: BackupAccessPoint[];
	loading: boolean;
	error: string | null;
	premiumRequired: boolean;
}

const initialState: BackupInternetState = {
	status: null,
	accessPoints: [],
	loading: false,
	error: null,
	premiumRequired: false
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

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const backupInternetStore = createBackupInternetStore();
