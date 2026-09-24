/**
 * Content Filter Store
 *
 * A network's advanced content-filter allow/block lists (phase-6.0-revamp.md
 * § 7 WP7, family 10): `GET /networks/{id}/content-filter`. Premium-gated
 * (Plus/Secure) - a 402 is recorded as `premiumRequired` rather than `error`,
 * matching `backupInternet.ts`/`dataUsage.ts`.
 *
 * The network-wide allow/block writes are unverified, non-settings writes
 * (plan § 5): pessimistic, gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`,
 * never retried, re-fetch on success (the response carries the read-back
 * lists directly, but re-deriving from a single `fetch()` keeps this store's
 * shape identical to every other list store in the app).
 *
 * The profile-scoped allow/block-for-profiles writes return only
 * `{success}` (no updated list), so they do not touch `allowedList`/
 * `blockedList` - the caller decides whether to show a success toast.
 */

import { writable } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type { DomainBlockForProfilesRequest, DomainForProfilesRequest } from '$api/types';

interface ContentFilterState {
	allowedList: unknown[];
	blockedList: unknown[];
	loading: boolean;
	/** True while any write is in flight - pessimistic, one at a time. */
	applying: boolean;
	error: string | null;
	premiumRequired: boolean;
}

const initialState: ContentFilterState = {
	allowedList: [],
	blockedList: [],
	loading: false,
	applying: false,
	error: null,
	premiumRequired: false
};

function createContentFilterStore() {
	const { subscribe, set, update } = writable<ContentFilterState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null, premiumRequired: false }));
			try {
				const result = await api.networks.getContentFilter(networkId);
				update((s) => ({
					...s,
					allowedList: result.allowed_list,
					blockedList: result.blocked_list,
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
					error: error instanceof Error ? error.message : 'Failed to load content filter'
				}));
			}
		},

		/** Add a domain to the network-wide allow list. Pessimistic - re-fetches on success. */
		async allowDomain(networkId: string, domain: string, addCname?: boolean): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.networks.allowDomain(networkId, domain, addCname);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Remove a domain from the network-wide allow list. Pessimistic - re-fetches on success. */
		async unallowDomain(networkId: string, domain: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.networks.unallowDomain(networkId, domain);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Add a domain to the network-wide block list. Pessimistic - re-fetches on success. */
		async blockDomain(networkId: string, domain: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.networks.blockDomain(networkId, domain);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Remove a domain from the network-wide block list. Pessimistic - re-fetches on success. */
		async unblockDomain(networkId: string, domain: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.networks.unblockDomain(networkId, domain);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Add a domain to the allow list for specific profiles. Returns only `{success}`. */
		async allowDomainForProfiles(
			networkId: string,
			body: DomainForProfilesRequest
		): Promise<boolean> {
			update((s) => ({ ...s, applying: true }));
			try {
				const result = await api.networks.allowDomainForProfiles(networkId, body);
				return result.success;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Remove a domain from the allow list for specific profiles. Returns only `{success}`. */
		async unallowDomainForProfiles(
			networkId: string,
			body: DomainForProfilesRequest
		): Promise<boolean> {
			update((s) => ({ ...s, applying: true }));
			try {
				const result = await api.networks.unallowDomainForProfiles(networkId, body);
				return result.success;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Add a domain to the block list for specific profiles. Returns only `{success}`. */
		async blockDomainForProfiles(
			networkId: string,
			body: DomainBlockForProfilesRequest
		): Promise<boolean> {
			update((s) => ({ ...s, applying: true }));
			try {
				const result = await api.networks.blockDomainForProfiles(networkId, body);
				return result.success;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Remove a domain from the block list for specific profiles. Returns only `{success}`. */
		async unblockDomainForProfiles(
			networkId: string,
			body: DomainBlockForProfilesRequest
		): Promise<boolean> {
			update((s) => ({ ...s, applying: true }));
			try {
				const result = await api.networks.unblockDomainForProfiles(networkId, body);
				return result.success;
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

export const contentFilterStore = createContentFilterStore();
