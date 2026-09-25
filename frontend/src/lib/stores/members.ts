/**
 * Members Store
 *
 * The network's permissions, members and pending invites (phase-6.0-revamp.md
 * § 7 WP6, deliverable 10: `GET /networks/{id}/{permissions,members,invites}`).
 * Single per-network store, same non-keyed pattern as `events.ts`/
 * `channelUtilization.ts` - the Advanced tab only ever mounts one network's
 * MembersCard at a time.
 *
 * Each of the three calls fails soft server-side to `partial: true` on a 403
 * rather than throwing, so the three loads are tracked as one `fetch()` and
 * only a genuine transport/auth failure sets `error`.
 *
 * Invite/admin writes (phase-6.0-revamp.md § 7 WP7, family 2) are unverified,
 * non-settings writes (plan § 5): pessimistic, gated on
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side, never retried
 * (`client.ts` passes `retries: 0`), re-list on success. `promoteMember`/
 * `removeAdmin` are NOT implemented here - `NetworkMember` carries no id
 * (allowlisted server-side to name/role/status only), so there is no
 * non-secret handle for the frontend to promote/demote a specific member
 * by; that is a contract gap, not an oversight (see the ledger).
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { NetworkInvite, NetworkMember } from '$api/types';

interface MembersState {
	permissions: Record<string, boolean>;
	role: string | null;
	permissionsPartial: boolean;
	members: NetworkMember[];
	membersPartial: boolean;
	invites: NetworkInvite[];
	invitesPartial: boolean;
	loading: boolean;
	/** True while any invite/admin write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
}

const initialState: MembersState = {
	permissions: {},
	role: null,
	permissionsPartial: false,
	members: [],
	membersPartial: false,
	invites: [],
	invitesPartial: false,
	loading: false,
	applying: false,
	error: null
};

function createMembersStore() {
	const { subscribe, set, update } = writable<MembersState>(initialState);

	return {
		subscribe,

		/**
		 * Bug-fix follow-up (maintainer feedback, 6.0.0): this used to await the three sources
		 * with `Promise.all`, so one source rejecting (a genuine transport/auth failure on just
		 * `/invites`, say) discarded whatever `/permissions` and `/members` had ALREADY returned
		 * and rendered the whole card as `ErrorState` - on top of the backend's own per-field
		 * `partial: true` soft-fail, which only covers a 403 *within* one source, not one source
		 * failing outright. `Promise.allSettled` lets each source degrade independently: a failed
		 * source falls back to its empty default and counts as partial, while every source that
		 * did succeed still renders. The full-card `error` is now reserved for every source
		 * failing at once, i.e. nothing at all to show.
		 */
		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			const [permissionsResult, membersResult, invitesResult] = await Promise.allSettled([
				api.networks.getPermissions(networkId),
				api.networks.getMembers(networkId),
				api.networks.getInvites(networkId)
			]);

			if (
				permissionsResult.status === 'rejected' &&
				membersResult.status === 'rejected' &&
				invitesResult.status === 'rejected'
			) {
				const reason = permissionsResult.reason;
				update((s) => ({
					...s,
					loading: false,
					error: reason instanceof Error ? reason.message : 'Failed to load members'
				}));
				return;
			}

			update((s) => ({
				...s,
				permissions:
					permissionsResult.status === 'fulfilled' ? permissionsResult.value.permissions : {},
				role: permissionsResult.status === 'fulfilled' ? permissionsResult.value.role : s.role,
				permissionsPartial:
					permissionsResult.status === 'fulfilled' ? permissionsResult.value.partial : true,
				members: membersResult.status === 'fulfilled' ? membersResult.value.members : [],
				membersPartial: membersResult.status === 'fulfilled' ? membersResult.value.partial : true,
				invites: invitesResult.status === 'fulfilled' ? invitesResult.value.invites : [],
				invitesPartial: invitesResult.status === 'fulfilled' ? invitesResult.value.partial : true,
				loading: false,
				error: null
			}));
		},

		/** Create an invite for the network. Pessimistic - re-lists on success. */
		async createInvite(networkId: string, role: 'owner' | 'admin'): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.createInvite(networkId, role);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Rename a pending invite. Pessimistic - re-lists on success. */
		async updateInvite(networkId: string, inviteId: string, nickname: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.updateInvite(networkId, inviteId, nickname);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Cancel a pending invite. Pessimistic - re-lists on success. */
		async deleteInvite(networkId: string, inviteId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.deleteInvite(networkId, inviteId);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Cancel every pending admin-promotion invite. Pessimistic - re-lists on success. */
		async cancelPendingAdmin(networkId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.cancelPendingAdmin(networkId);
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

export const membersStore = createMembersStore();
