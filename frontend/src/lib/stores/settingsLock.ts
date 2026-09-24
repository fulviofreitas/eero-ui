/**
 * Shared per-network "applying" lock for settings-class writes.
 *
 * Plan § 5 defines settings-class writes (a PUT to the network `settings`
 * link - DNS, network rename, and friends) as writes that are proven or
 * assumed to reboot every eero on the network. Each of these follows the
 * same pessimistic pattern: a blocking danger dialog, a per-network
 * "applying" flag while the request is in flight, a static "applying" state
 * afterwards (no polling - the mesh is rebooting and the browser itself may
 * be offline), and never two settings writes in flight for the same network
 * at once.
 *
 * `dns.ts` and `networks.ts` (network rename) both need this same lock
 * keyed by network id, so it lives here rather than being duplicated or
 * living inside just one of the two stores.
 */

import { writable, derived } from 'svelte/store';

/** Network ids currently applying a settings-class write. */
const applyingNetworkIds = writable<Set<string>>(new Set());

/**
 * True while any settings-class write is in flight for `networkId`.
 */
export function isApplyingSettings(networkId: string): boolean {
	let applying = false;
	applyingNetworkIds.subscribe((ids) => {
		applying = ids.has(networkId);
	})();
	return applying;
}

/** Derived store for reactive use in components: `$applyingSettingsFor(networkId)`. */
export const applyingSettingsIds = derived(applyingNetworkIds, ($ids) => $ids);

/**
 * Run `fn` under the per-network settings lock, throwing if a settings-class
 * write is already in flight for this network rather than queuing or
 * clobbering it - "never two settings writes in one Save" (plan § 5).
 */
export async function withSettingsLock<T>(networkId: string, fn: () => Promise<T>): Promise<T> {
	let alreadyApplying = false;
	applyingNetworkIds.update((ids) => {
		if (ids.has(networkId)) {
			alreadyApplying = true;
			return ids;
		}
		const next = new Set(ids);
		next.add(networkId);
		return next;
	});

	if (alreadyApplying) {
		throw new Error('A settings change is already being applied to this network.');
	}

	try {
		return await fn();
	} finally {
		applyingNetworkIds.update((ids) => {
			const next = new Set(ids);
			next.delete(networkId);
			return next;
		});
	}
}
