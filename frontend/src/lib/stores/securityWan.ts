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
 *
 * The Thread enable/disable and regenerate-credentials controls
 * (phase-6.0-revamp.md § 7 WP7, family 7) follow the same policy: pessimistic,
 * gated, `retries: 0`. Both re-fetch this whole store on success so the
 * `security.thread` read-back stays in sync (there is no dedicated Thread
 * getter of its own on the frontend).
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type {
	AdvancedNetworkSettings,
	ConnectionModeUpdateRequest,
	ConnectionModeUpdateResponse,
	DhcpUpdateRequest,
	DhcpUpdateResponse,
	FastTransitionUpdateResponse,
	MloUpdateRequest,
	MloUpdateResponse,
	MultiStaticIpResponse,
	NatPortRandomizationUpdateResponse,
	NetworkSubnetsResponse,
	PasspointUpdateResponse,
	ProxiedNodesUpdateResponse,
	SecurityEnvelopeUpdateRequest,
	SecurityEnvelopeUpdateResponse,
	SecuritySettingsResponse,
	SqmUpdateResponse,
	Wpa3PerBandUpdateRequest,
	Wpa3PerBandUpdateResponse
} from '$api/types';
import { withSettingsLock } from './settingsLock';

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

		/**
		 * Enable/disable Thread, optionally toggling credential syncing.
		 * Pessimistic - re-fetches the whole store on success. Returns the
		 * backend's own `changed` flag (`false` means the no-op guard
		 * skipped the write entirely).
		 */
		async updateThread(
			networkId: string,
			enabled: boolean,
			enableCredentialSyncing?: boolean
		): Promise<boolean> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await api.networks.updateThread(networkId, enabled, enableCredentialSyncing);
				await this.fetch(networkId);
				return result.changed;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Regenerate the network's Thread credentials. Pessimistic -
		 * re-fetches the whole store on success. No no-op guard is possible
		 * (regenerating is inherently a change).
		 */
		async regenerateThreadCredentials(networkId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.regenerateThreadCredentials(networkId);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		// ------------------------------------------------------------
		// WP8: settings-class write controls (plan § 5, § 7 WP8).
		//
		// Every action below is PESSIMISTIC (deliberate deviation from
		// the optimistic-update house rule, same rationale as
		// `dns.ts`/`updateDns`): each is treated as rebooting the whole
		// mesh. Each runs under the shared per-network `withSettingsLock`
		// (settingsLock.ts) so it can never race a DNS write, a network
		// rename, or another settings-class write on the same network -
		// "never two settings writes in one Save" (plan § 5). On a
		// genuine change (`changed: true`) the whole store is re-fetched
		// so every read-back field (`security`, `advanced`) stays in
		// sync; on `changed: false` the caller is expected to show an
		// "already set" info toast rather than the applying state.
		// ------------------------------------------------------------

		/** Enable/disable SQM (Smart Queue Management). */
		async updateSqm(networkId: string, enabled: boolean): Promise<SqmUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setSqm(networkId, enabled)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update SQM'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Set DHCP mode and/or manual lease range. */
		async updateDhcp(networkId: string, body: DhcpUpdateRequest): Promise<DhcpUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setDhcp(networkId, body)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update DHCP'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Set the network's WAN connection mode (BRIDGE or NAT). */
		async updateConnectionMode(
			networkId: string,
			body: ConnectionModeUpdateRequest
		): Promise<ConnectionModeUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setConnectionMode(networkId, body)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update connection mode'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Enable/disable NAT port randomization. */
		async updateNatPortRandomization(
			networkId: string,
			enabled: boolean
		): Promise<NatPortRandomizationUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setNatPortRandomization(networkId, enabled)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update NAT port randomization'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Set the per-band WPA3 mode. */
		async updateWpa3PerBand(
			networkId: string,
			body: Wpa3PerBandUpdateRequest
		): Promise<Wpa3PerBandUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setWpa3PerBand(networkId, body)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update WPA3'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Toggle exactly one envelope-level security setting (wpa3,
		 * band_steering, upnp or ipv6) - never more than one field per call.
		 */
		async updateSecurityField(
			networkId: string,
			body: SecurityEnvelopeUpdateRequest
		): Promise<SecurityEnvelopeUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setSecurity(networkId, body)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update security setting'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Set the network's MLO (Multi-Link Operation) mode. */
		async updateMlo(networkId: string, mode: MloUpdateRequest['mode']): Promise<MloUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setMlo(networkId, mode)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update MLO mode'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Enable/disable 802.11r fast transition. */
		async updateFastTransition(
			networkId: string,
			enabled: boolean
		): Promise<FastTransitionUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setFastTransition(networkId, enabled)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update fast transition'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Enable/disable Passpoint. */
		async updatePasspoint(networkId: string, enabled: boolean): Promise<PasspointUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setPasspoint(networkId, enabled)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update Passpoint'
				}));
				throw error;
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Enable/disable proxied nodes. No no-op guard exists server-side
		 * for this field, so `changed` is always `true` here - the store
		 * always re-fetches after a successful write.
		 */
		async updateProxiedNodes(
			networkId: string,
			enabled: boolean
		): Promise<ProxiedNodesUpdateResponse> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				const result = await withSettingsLock(networkId, () =>
					api.networks.setProxiedNodes(networkId, enabled)
				);
				if (result.changed) await this.fetch(networkId);
				return result;
			} catch (error) {
				update((s) => ({
					...s,
					error: error instanceof Error ? error.message : 'Failed to update proxied nodes'
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

export const securityWanStore = createSecurityWanStore();
