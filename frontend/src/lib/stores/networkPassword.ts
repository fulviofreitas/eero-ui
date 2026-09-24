/**
 * Network Password Store
 *
 * Sets/clears the network's own Wi-Fi password (phase-6.0-revamp.md § 5,
 * § 7 WP8, family 12: `PUT/DELETE /networks/{id}/password`).
 *
 * Not in § 5's settings-class table - it PUTs the network's own `password`
 * link, not `settings` - but the SDK's own docstring says it disconnects
 * every client while it takes effect and has not been confirmed live, so
 * this follows the same danger-dialog, pessimistic contract as a
 * settings-class write (WP7/WP8 boundary note in the ledger), just without
 * `withSettingsLock` (`reboot_expected: false` - clients reconnect, the mesh
 * itself does not reboot). The eero cloud API never returns the password
 * back, so no no-op guard is possible and this store never holds the raw
 * value after submit.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { NetworkPasswordUpdateResponse } from '$api/types';

interface NetworkPasswordState {
	loading: boolean;
	/** True while a write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
	lastResult: NetworkPasswordUpdateResponse | null;
}

const initialState: NetworkPasswordState = {
	loading: false,
	applying: false,
	error: null,
	lastResult: null
};

function createNetworkPasswordStore() {
	const { subscribe, set, update } = writable<NetworkPasswordState>(initialState);

	return {
		subscribe,

		/**
		 * Set the network's Wi-Fi password. No no-op guard is possible - the
		 * API never returns a password to compare against, so this always
		 * proceeds. Never stores the submitted password itself.
		 */
		async setPassword(networkId: string, password: string): Promise<NetworkPasswordUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.setNetworkPassword(networkId, password);
				update((s) => ({ ...s, lastResult: result }));
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to set network password'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Clear the network's Wi-Fi password - opens the network. The caller
		 * MUST have already confirmed this via a danger dialog carrying the
		 * "the network becomes OPEN" wording.
		 */
		async clearPassword(networkId: string): Promise<NetworkPasswordUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.clearNetworkPassword(networkId);
				update((s) => ({ ...s, lastResult: result }));
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to clear network password'
				}));
				throw error;
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

export const networkPasswordStore = createNetworkPasswordStore();
