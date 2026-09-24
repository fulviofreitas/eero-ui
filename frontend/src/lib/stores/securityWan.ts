/**
 * Security & WAN Store
 *
 * Combined security settings, subnets, multi-static-IP WAN config and
 * DHCP/connection-mode/power-saving/DDNS for a network (phase-6.0-revamp.md
 * § 7 WP6, deliverable 12: `GET /networks/{id}/{security,subnets,
 * multistaticip,advanced}`). Single per-network store (Advanced tab only
 * mounts one at a time), same pattern as `events.ts`.
 *
 * `security` itself is fail-soft per-field server-side (each of its sources
 * is fetched independently and defaults to `null` on its own error), and
 * `multistaticip` reports `configured: false` rather than propagating a 404,
 * so a genuine `error` here means a transport/auth failure, not "some field
 * is unavailable".
 *
 * The DDNS toggle (phase-6.0-revamp.md § 7 WP7, family 4) is an unverified,
 * non-settings write (plan § 5): pessimistic, gated on
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side, never retried
 * (`client.ts` passes `retries: 0`), re-fetches this whole store on success
 * (there is no dedicated DDNS getter - it lives on the `advanced.ddns`
 * envelope field).
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type {
	AdvancedNetworkSettings,
	MultiStaticIpResponse,
	NetworkSubnetsResponse,
	SecuritySettingsResponse
} from '$api/types';

interface SecurityWanState {
	security: SecuritySettingsResponse | null;
	subnets: NetworkSubnetsResponse | null;
	multistaticip: MultiStaticIpResponse | null;
	advanced: AdvancedNetworkSettings | null;
	loading: boolean;
	/** True while the DDNS write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
}

const initialState: SecurityWanState = {
	security: null,
	subnets: null,
	multistaticip: null,
	advanced: null,
	loading: false,
	applying: false,
	error: null
};

function createSecurityWanStore() {
	const { subscribe, set, update } = writable<SecurityWanState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [security, subnets, multistaticip, advanced] = await Promise.all([
					api.networks.getSecurity(networkId),
					api.networks.getSubnets(networkId),
					api.networks.getMultiStaticIp(networkId),
					api.networks.getAdvanced(networkId)
				]);
				update((s) => ({ ...s, security, subnets, multistaticip, advanced, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load security settings'
				}));
			}
		},

		/**
		 * Enable/disable dynamic DNS. Pessimistic - re-fetches the whole
		 * store on success. Returns the backend's own `changed` flag
		 * (`false` means the no-op guard skipped the write entirely).
		 */
		async updateDdns(networkId: string, enabled: boolean): Promise<boolean> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.updateDdns(networkId, enabled);
				await this.fetch(networkId);
				return result.changed;
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

export const securityWanStore = createSecurityWanStore();
