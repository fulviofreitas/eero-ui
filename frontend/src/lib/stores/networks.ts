/**
 * Networks Store
 *
 * Manages available networks and the currently selected network.
 */

import { writable, derived, get } from 'svelte/store';
import { api } from '$api/client';
import type { NetworkSummary } from '$api/types';

// ============================================
// Types
// ============================================

interface NetworksState {
	networks: NetworkSummary[];
	selectedNetworkId: string | null;
	loading: boolean;
	error: string | null;
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

function createNetworksStore() {
	const { subscribe, set, update } = writable<NetworksState>(initialState);

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
		 * Clear store (on logout)
		 */
		clear(): void {
			if (typeof window !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
			}
			set(initialState);
		}
	};
}

export const networksStore = createNetworksStore();

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
