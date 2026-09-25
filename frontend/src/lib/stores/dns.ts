/**
 * DNS Settings Store
 *
 * Loads and applies per-network DNS settings.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { DnsSettings, DnsUpdateRequest, DnsUpdateResponse } from '$api/types';
import { withSettingsLock } from './settingsLock';

// ============================================
// Types
// ============================================

interface DnsState {
	settings: DnsSettings | null;
	loading: boolean;
	applying: boolean;
	error: string | null;
}

// ============================================
// Store
// ============================================

const initialState: DnsState = {
	settings: null,
	loading: false,
	applying: false,
	error: null
};

function createDnsStore() {
	const { subscribe, set, update } = writable<DnsState>(initialState);

	return {
		subscribe,

		/**
		 * Fetch DNS settings for a network.
		 */
		async fetchDns(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const settings = await api.networks.getDns(networkId);
				update((s) => ({ ...s, settings, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load DNS settings'
				}));
			}
		},

		/**
		 * Apply new DNS settings.
		 *
		 * DELIBERATE DEVIATION from the optimistic-update house rule
		 * (see .claude/rules/svelte-dashboard.md): a DNS write reboots every
		 * eero on the network. The API responds success immediately, but the
		 * actual disruption (every device losing Wi-Fi/internet) lands
		 * roughly five minutes later. There is nothing sensible to roll back
		 * to in that window, and speculatively showing the new settings as
		 * "live" before the mesh has actually reconfigured would be actively
		 * misleading. This action is therefore PESSIMISTIC: `settings` is
		 * only updated once the request resolves, `applying` tracks the
		 * in-flight request, and the caller is responsible for surfacing an
		 * "applying - your network will restart shortly" state while it
		 * waits.
		 */
		async updateDns(networkId: string, body: DnsUpdateRequest): Promise<DnsUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));

			try {
				// Shared per-network lock (settingsLock.ts): DNS and network-rename
				// both PUT the same `settings` link, so they must never race.
				const result = await withSettingsLock(networkId, () =>
					api.networks.setDns(networkId, body)
				);
				update((s) => ({
					...s,
					applying: false,
					settings: result.changed ? result.dns : s.settings
				}));
				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to update DNS settings';
				update((s) => ({ ...s, applying: false, error: message }));
				throw error;
			}
		},

		/**
		 * Clear store (e.g. on network switch / logout).
		 */
		clear(): void {
			set(initialState);
		}
	};
}

export const dnsStore = createDnsStore();
