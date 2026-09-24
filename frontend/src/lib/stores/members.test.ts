/**
 * Tests for the members store (phase-6.0-revamp.md § 7 WP6, deliverable 10).
 *
 * Coverage:
 * - fetch loads permissions/members/invites together
 * - a partial:true on any one of the three surfaces as its own flag
 * - a transport failure records error
 * - clear resets to the initial state
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
});
