/**
 * Entitlements Store
 *
 * Per-network premium/entitlement status and the
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` operator flag (plan § 7 WP6 — "first"
 * commit: this gates every premium-only card and every unverified/
 * settings-class write control added in WP6-WP8). Fetched once per network
 * selection from `+layout.svelte`, alongside the other per-network stores.
 */

import { writable, derived, get } from 'svelte/store';
import { api } from '$api/client';
import type { NetworkEntitlements } from '$api/types';

// ============================================
// Types
// ============================================

interface EntitlementsState {
	entitlements: NetworkEntitlements | null;
	loading: boolean;
	error: string | null;
}

const initialState: EntitlementsState = {
	entitlements: null,
	loading: false,
	error: null
};

// ============================================
// Helpers
// ============================================

/**
 * `features`/`upsell_features`/`capabilities` element shape is undocumented
 * upstream (eero-api v8.0.3 — "element shape undocumented and unfixtured
 * ([] only) — take from a live read", per the backend model docstring).
 * Treat each element defensively: a bare string, or an object carrying the
 * feature's identity under one of a few plausible keys.
 */
function featureKey(feature: unknown): string | null {
	if (typeof feature === 'string') return feature;
	if (feature && typeof feature === 'object') {
		const record = feature as Record<string, unknown>;
		for (const key of ['name', 'id', 'feature']) {
			const value = record[key];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}

function hasFeatureIn(features: unknown[], name: string): boolean {
	return features.some((f) => featureKey(f) === name);
}

// ============================================
// Store
// ============================================

function createEntitlementsStore() {
	const { subscribe, set, update } = writable<EntitlementsState>(initialState);

	return {
		subscribe,

		/**
		 * Fetch entitlements for a network. Never throws — a failed fetch
		 * leaves every premium/experimental gate closed (fail safe), with the
		 * error recorded for the caller to surface if it chooses to.
		 */
		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const entitlements = await api.networks.getEntitlements(networkId);
				update((s) => ({ ...s, entitlements, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load entitlements'
				}));
			}
		},

		/**
		 * Whether a named feature is present in either the entitled or the
		 * upsell feature list (upsell membership alone does not mean the
		 * feature is usable — callers combine this with `isPremium`/
		 * `premiumRequired` as appropriate).
		 */
		hasFeature(name: string): boolean {
			const entitlements = get({ subscribe }).entitlements;
			return entitlements ? hasFeatureIn(entitlements.features, name) : false;
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const entitlementsStore = createEntitlementsStore();

// ============================================
// Derived stores
// ============================================

/**
 * `null` while entitlements have not loaded yet (or the fetch failed) —
 * treat as "unknown", not "not premium": `PremiumGate` distinguishes the
 * two so a slow/failed entitlements call does not flash an upsell notice at
 * a premium subscriber.
 */
export const isPremium = derived(entitlementsStore, ($s) => $s.entitlements?.is_premium ?? null);

export const experimentalWrites = derived(
	entitlementsStore,
	($s) => $s.entitlements?.experimental_writes ?? false
);

/**
 * `true` when the named feature is present in the entitled `features` list.
 * `false` (not `null`) when entitlements are unknown — callers gating a
 * *write* on a specific feature should fail closed; callers gating a whole
 * *read-only card* on premium status should use `isPremium` instead, which
 * preserves the loading/unknown distinction.
 */
export function hasFeature(features: unknown[] | undefined, name: string): boolean {
	return features ? hasFeatureIn(features, name) : false;
}

/**
 * True when the entitlements call resolved and the network is definitively
 * NOT premium — the condition `PremiumGate` uses to render its upsell
 * notice instead of children. `null`/loading is treated as "not yet known"
 * and renders neither the children nor the upsell (see `PremiumGate.svelte`).
 */
export const premiumRequired = derived(entitlementsStore, ($s) => {
	if ($s.loading || $s.entitlements === null) return false;
	return $s.entitlements.is_premium === false;
});
