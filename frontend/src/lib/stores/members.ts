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
	error: null
};

function createMembersStore() {
	const { subscribe, set, update } = writable<MembersState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [permissions, members, invites] = await Promise.all([
					api.networks.getPermissions(networkId),
					api.networks.getMembers(networkId),
					api.networks.getInvites(networkId)
				]);
				update((s) => ({
					...s,
					permissions: permissions.permissions,
					role: permissions.role,
					permissionsPartial: permissions.partial,
					members: members.members,
					membersPartial: members.partial,
					invites: invites.invites,
					invitesPartial: invites.partial,
					loading: false
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load members'
				}));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const membersStore = createMembersStore();
