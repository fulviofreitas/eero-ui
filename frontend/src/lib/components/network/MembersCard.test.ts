/**
 * Tests for MembersCard (phase-6.0-revamp.md § 7 WP6, deliverable 10).
 *
 * Coverage:
 * - loads and renders role, permissions, members and invites on mount
 * - the partial note renders when any one source reports partial:true
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides every invite/admin write control
 * - gate-on: cancelling an invite goes through ConfirmDialog naming
 *   "not verified end-to-end" before any DELETE fires
 * - a successful invite create/delete confirmation re-lists
 * - a failed write surfaces an error toast
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import MembersCard from './MembersCard.svelte';
import { membersStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

function mockEntitlements(experimentalWrites: boolean) {
	server.use(
		http.get('/api/networks/:networkId/entitlements', () =>
			HttpResponse.json({
				features: [],
				upsell_features: [],
				is_premium: null,
				premium_status: null,
				capabilities: [],
				experimental_writes: experimentalWrites
			})
		)
	);
}

describe('MembersCard', () => {
	beforeEach(() => {
		membersStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders role, permissions, members and invites on mount', async () => {
		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getAllByText('owner').length).toBeGreaterThan(0));
		expect(screen.getByText('can_manage_devices')).toBeInTheDocument();
		expect(screen.getByText('Alice')).toBeInTheDocument();
		expect(screen.getByText('pending')).toBeInTheDocument();
	});

	it('renders the partial note when any one source reports partial:true', async () => {
		server.use(
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ invites: [], partial: true })
			)
		);

		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Some data unavailable for this account.')).toBeInTheDocument()
		);
	});

	it('renders ErrorState with a working retry when every one of the three sources fails', async () => {
		server.use(
			http.get('/api/networks/:networkId/permissions', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			),
			http.get('/api/networks/:networkId/members', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			),
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/permissions', () =>
				HttpResponse.json({ permissions: {}, role: 'recovered', partial: false })
			),
			http.get('/api/networks/:networkId/members', () =>
				HttpResponse.json({ members: [], partial: false })
			),
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ invites: [], partial: false })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('recovered')).toBeInTheDocument());
	});

	it('renders role and permissions with a muted note instead of erroring when only one source fails (bug-fix follow-up)', async () => {
		server.use(
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(MembersCard, { props: { networkId: 'network-123' } });

		// The invites source 5xxs, so the API client's GET retry/backoff (2
		// retries, exponential) runs to exhaustion before Promise.allSettled
		// resolves - same real-time cost as the "every source fails" retry
		// test above, hence the same extended timeout.
		await waitFor(
			() => expect(screen.getByText('Some data unavailable for this account.')).toBeInTheDocument(),
			{ timeout: 5000 }
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.getAllByText('owner').length).toBeGreaterThan(0);
		expect(screen.getByText('can_manage_devices')).toBeInTheDocument();
	});

	it('hides every invite/admin write control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());

		expect(screen.queryByRole('button', { name: 'Send Invite' })).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Cancel Pending Admin Invites' })
		).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
	});

	it('gate-on: cancelling an invite goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(MembersCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/invites/:inviteId', () => {
				deleteCalls++;
				return HttpResponse.json({ success: true });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(deleteCalls).toBe(0);
	});

	it('a successful invite cancel confirmation re-lists the (now empty) invites', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(MembersCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());

		server.use(
			http.delete('/api/networks/:networkId/invites/:inviteId', () =>
				HttpResponse.json({ success: true })
			),
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ invites: [], partial: false })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.queryByText('pending')).not.toBeInTheDocument());
	});

	it('surfaces a failed invite cancel as an error toast, leaving the stale row in place', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(MembersCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());

		server.use(
			http.delete('/api/networks/:networkId/invites/:inviteId', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
		expect(screen.getByText('pending')).toBeInTheDocument();
	});
});
