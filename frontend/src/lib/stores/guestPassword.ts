/**
 * Guest Network Password Store
 *
 * Loads and writes the guest network password (phase-6.0-revamp.md § 7 WP6,
 * deliverable 2: `GET/PUT/DELETE /networks/{id}/guest/password`). Verified
 * write (plan § 5) - optimistic `has_password` flip with rollback, per
 * `svelte-dashboard.md`. The eero cloud API never returns the raw password,
 * so this store (and every caller) only ever holds `has_password`.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { GuestNetworkStatus } from '$api/types';

interface GuestPasswordState {
	status: GuestNetworkStatus | null;
	loading: boolean;
	applying: boolean;
	error: string | null;
}

const initialState: GuestPasswordState = {
	status: null,
	loading: false,
	applying: false,
	error: null
};

function createGuestPasswordStore() {
	const { subscribe, set, update } = writable<GuestPasswordState>(initialState);

	return {
		subscribe,

		/** Fetch the guest network's current configuration for a network. */
		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const status = await api.networks.getGuestNetwork(networkId);
				update((s) => ({ ...s, status, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load guest network'
				}));
			}
		},

		/**
		 * Set the guest password. Verified write - optimistic `has_password:
		 * true` flip with rollback on failure. Never stores the submitted
		 * password itself.
		 */
		async setPassword(networkId: string, password: string): Promise<void> {
			let previous: GuestNetworkStatus | null = null;
			update((s) => {
				previous = s.status;
				return {
					...s,
					applying: true,
					error: null,
					status: s.status ? { ...s.status, has_password: true } : s.status
				};
			});

			try {
				const result = await api.networks.setGuestPassword(networkId, password);
				update((s) => ({ ...s, applying: false, status: result.guest_network }));
			} catch (error) {
				update((s) => ({
					...s,
					applying: false,
					status: previous,
					error: error instanceof Error ? error.message : 'Failed to set guest password'
				}));
				throw error;
			}
		},

		/**
		 * Clear the guest password. Verified write - optimistic `has_password:
		 * false` flip with rollback on failure.
		 */
		async clearPassword(networkId: string): Promise<void> {
			let previous: GuestNetworkStatus | null = null;
			update((s) => {
				previous = s.status;
				return {
					...s,
					applying: true,
					error: null,
					status: s.status ? { ...s.status, has_password: false } : s.status
				};
			});

			try {
				const result = await api.networks.clearGuestPassword(networkId);
				update((s) => ({ ...s, applying: false, status: result.guest_network }));
			} catch (error) {
				update((s) => ({
					...s,
					applying: false,
					status: previous,
					error: error instanceof Error ? error.message : 'Failed to clear guest password'
				}));
				throw error;
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const guestPasswordStore = createGuestPasswordStore();
