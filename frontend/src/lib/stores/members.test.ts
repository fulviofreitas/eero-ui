/**
 * Tests for the members store (phase-6.0-revamp.md § 7 WP6, deliverable 10).
 *
 * Coverage:
 * - fetch loads permissions/members/invites together
 * - a partial:true on any one of the three surfaces as its own flag
 * - a transport failure records error
 * - clear resets to the initial state
 * - createInvite/updateInvite/deleteInvite/cancelPendingAdmin (phase-6.0-revamp.md
 *   § 7 WP7, family 2) re-list on success (pessimistic, no optimistic flip)
 * - each write rolls back `applying` and rethrows on failure
 * - a 403 `experimental_disabled` response surfaces as a rejected promise
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { membersStore } from './members';
import { server } from '../../../tests/mocks/server';

describe('membersStore', () => {
	beforeEach(() => {
		membersStore.clear();
	});

	it('loads permissions/members/invites together', async () => {
		await membersStore.fetch('network-123');

		const state = get(membersStore);
		expect(state.role).toBe('owner');
		expect(state.permissions.can_manage_devices).toBe(true);
		expect(state.members).toHaveLength(1);
		expect(state.invites).toHaveLength(1);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a partial:true on members as its own flag, not an error', async () => {
		server.use(
			http.get('/api/networks/:networkId/members', () =>
				HttpResponse.json({ members: [], partial: true })
			)
		);

		await membersStore.fetch('network-123');

		const state = get(membersStore);
		expect(state.membersPartial).toBe(true);
		expect(state.permissionsPartial).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a transport failure as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/permissions', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await membersStore.fetch('network-123');

		const state = get(membersStore);
		expect(state.error).toBeTruthy();
		expect(state.loading).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		await membersStore.fetch('network-123');
		expect(get(membersStore).members).toHaveLength(1);

		membersStore.clear();

		const state = get(membersStore);
		expect(state.members).toEqual([]);
		expect(state.role).toBeNull();
	});

	describe('createInvite', () => {
		it('re-lists invites on success (pessimistic, no optimistic flip)', async () => {
			await membersStore.fetch('network-123');

			const promise = membersStore.createInvite('network-123', 'admin');
			expect(get(membersStore).applying).toBe(true);

			await promise;

			expect(get(membersStore).applying).toBe(false);
			expect(get(membersStore).invites).toHaveLength(1);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/invites', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(membersStore.createInvite('network-123', 'admin')).rejects.toThrow(
				'Experimental writes are disabled.'
			);
			expect(get(membersStore).applying).toBe(false);
		});
	});

	describe('updateInvite', () => {
		it('re-lists invites on success', async () => {
			await membersStore.fetch('network-123');

			await membersStore.updateInvite('network-123', 'invite-1', 'New nickname');

			expect(get(membersStore).applying).toBe(false);
			expect(get(membersStore).invites).toHaveLength(1);
		});
	});

	describe('deleteInvite', () => {
		it('re-lists invites on success', async () => {
			await membersStore.fetch('network-123');

			await membersStore.deleteInvite('network-123', 'invite-1');

			expect(get(membersStore).applying).toBe(false);
		});

		it('rolls back applying and rethrows on failure', async () => {
			server.use(
				http.delete('/api/networks/:networkId/invites/:inviteId', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await expect(membersStore.deleteInvite('network-123', 'invite-1')).rejects.toThrow();
			expect(get(membersStore).applying).toBe(false);
		});
	});

	describe('cancelPendingAdmin', () => {
		it('re-lists on success', async () => {
			await membersStore.fetch('network-123');

			await membersStore.cancelPendingAdmin('network-123');

			expect(get(membersStore).applying).toBe(false);
		});
	});
});
