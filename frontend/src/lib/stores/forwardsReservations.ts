/**
 * Forwards & Reservations Store
 *
 * A network's configured port forwards and DHCP reservations
 * (phase-6.0-revamp.md § 7 WP7, family 8): `GET/POST/PUT/DELETE
 * /networks/{id}/forwards[/{id}]` and `/reservations[/{id}]`. Single
 * per-network store (Advanced tab only mounts one at a time), same pattern
 * as `backupInternet.ts`.
 *
 * The list reads are verified; every write (create/update/delete, either
 * resource) is an unverified, non-settings write (plan § 5): pessimistic
 * (no optimistic row insert/update/removal - the tables only reflect the
 * server's read-back), gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`
 * server-side, never retried (`client.ts` passes `retries: 0`), re-fetches
 * on success.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type {
	ForwardCreateRequest,
	ForwardSummary,
	ForwardUpdateRequest,
	ReservationCreateRequest,
	ReservationSummary,
	ReservationUpdateRequest
} from '$api/types';

interface ForwardsReservationsState {
	forwards: ForwardSummary[];
	reservations: ReservationSummary[];
	loading: boolean;
	/** True while any write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
}

const initialState: ForwardsReservationsState = {
	forwards: [],
	reservations: [],
	loading: false,
	applying: false,
	error: null
};

function createForwardsReservationsStore() {
	const { subscribe, set, update } = writable<ForwardsReservationsState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [forwards, reservations] = await Promise.all([
					api.networks.getForwards(networkId),
					api.networks.getReservations(networkId)
				]);
				update((s) => ({
					...s,
					forwards: forwards.forwards,
					reservations: reservations.reservations,
					loading: false
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load forwards/reservations'
				}));
			}
		},

		/** Create a port forward. Pessimistic - re-fetches on success. */
		async createForward(networkId: string, body: ForwardCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.createForward(networkId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Update a port forward. Pessimistic - re-fetches on success. */
		async updateForward(
			networkId: string,
			forwardId: string,
			body: ForwardUpdateRequest
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.updateForward(networkId, forwardId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Delete a port forward. Pessimistic - re-fetches on success. */
		async deleteForward(networkId: string, forwardId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.deleteForward(networkId, forwardId);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Create a DHCP reservation. Pessimistic - re-fetches on success. */
		async createReservation(networkId: string, body: ReservationCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.createReservation(networkId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Update a DHCP reservation. Pessimistic - re-fetches on success. */
		async updateReservation(
			networkId: string,
			reservationId: string,
			body: ReservationUpdateRequest
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.updateReservation(networkId, reservationId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Delete a DHCP reservation, optionally also deleting its forwards.
		 * Pessimistic - re-fetches on success.
		 */
		async deleteReservation(
			networkId: string,
			reservationId: string,
			deleteForwards?: boolean
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.deleteReservation(networkId, reservationId, deleteForwards);
				await this.fetch(networkId);
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

export const forwardsReservationsStore = createForwardsReservationsStore();
