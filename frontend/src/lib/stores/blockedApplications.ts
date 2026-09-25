/**
 * Blocked Applications Store
 *
 * A profile's blocked-application policy (phase-6.0-revamp.md § 7 WP7,
 * family 10): `GET/PUT /profiles/{id}/blocked-applications`. Premium-gated
 * (Plus/Secure) - a 402 is recorded as `premiumRequired` rather than
 * `error`, matching `contentFilter.ts`.
 *
 * The write is an unverified, non-settings write (plan § 5): pessimistic,
 * gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, never retried, sends the
 * FULL desired application list (read-first from the store) and stores the
 * response's read-back list.
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';

interface BlockedApplicationsState {
	applications: unknown[];
	loading: boolean;
	/** True while the write is in flight - pessimistic. */
	applying: boolean;
	error: string | null;
	premiumRequired: boolean;
}

const initialState: BlockedApplicationsState = {
	applications: [],
	loading: false,
	applying: false,
	error: null,
	premiumRequired: false
};

function createBlockedApplicationsStore() {
	const { subscribe, set, update } = writable<BlockedApplicationsState>(initialState);

	return {
		subscribe,

		async fetch(profileId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null, premiumRequired: false }));
			try {
				const result = await api.profiles.getBlockedApplications(profileId);
				update((s) => ({ ...s, applications: result.applications, loading: false }));
			} catch (error) {
				if (error instanceof ApiClientError && error.type === 'premium_required') {
					update((s) => ({ ...s, loading: false, premiumRequired: true }));
					return;
				}
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load blocked applications'
				}));
			}
		},

		/**
		 * Set the profile's full blocked-application list. Pessimistic -
		 * stores the response's read-back list directly rather than
		 * re-fetching, matching the backend's own read-back-in-response
		 * shape.
		 */
		async setApplications(profileId: string, applications: string[]): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				const result = await api.profiles.setBlockedApplications(profileId, applications);
				update((s) => ({ ...s, applications: result.applications }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Clear store (e.g. on navigating away / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const blockedApplicationsStore = createBlockedApplicationsStore();
