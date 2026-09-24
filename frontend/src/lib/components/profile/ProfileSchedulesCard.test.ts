/**
 * Tests for ProfileSchedulesCard (phase-6.0-revamp.md § 7 WP7, family 1).
 *
 * Coverage:
 * - the list renders once loaded
 * - gate-off hides every write control (Add Schedule/Add Bedtime/Clear All
 *   and each row's Edit/Delete), showing the muted operator note instead
 * - gate-on: Delete goes through ConfirmDialog naming "not verified
 *   end-to-end" before any DELETE fires
 * - a successful create re-fetches and renders the read-back
 * - a failed write surfaces an error toast, not a thrown crash
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import ProfileSchedulesCard from './ProfileSchedulesCard.svelte';
import { profileSchedulesStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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

const SCHEDULE = {
	id: 'sched-1',
	name: 'School nights',
	days: ['monday', 'tuesday'],
	start: '20:00',
	end: '07:00',
	enabled: true
};

describe('ProfileSchedulesCard', () => {
	beforeEach(() => {
		profileSchedulesStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('renders the schedule list once loaded', async () => {
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		render(ProfileSchedulesCard, { props: { profileId: 'profile-1' } });

		await waitFor(() => expect(screen.getByText('School nights')).toBeInTheDocument());
		expect(screen.getByText('monday, tuesday')).toBeInTheDocument();
	});

	it('hides every write control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		render(ProfileSchedulesCard, { props: { profileId: 'profile-1' } });

		await waitFor(() => expect(screen.getByText('School nights')).toBeInTheDocument());

		expect(screen.queryByRole('button', { name: 'Add Schedule' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Add Bedtime' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Clear All' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
	});

	it('gate-on: Delete goes through ConfirmDialog naming "not verified end-to-end" before any DELETE fires', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		render(ProfileSchedulesCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('School nights')).toBeInTheDocument());

		let deleteCalls = 0;
		server.use(
			http.delete('/api/profiles/:profileId/schedules/:scheduleId', () => {
				deleteCalls++;
				return HttpResponse.json({ success: true, schedule_id: 'sched-1' });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(deleteCalls).toBe(0);
	});

	it('a successful delete confirmation re-fetches and renders the (now empty) list', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		render(ProfileSchedulesCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('School nights')).toBeInTheDocument());

		server.use(
			http.delete('/api/profiles/:profileId/schedules/:scheduleId', () =>
				HttpResponse.json({ success: true, schedule_id: 'sched-1' })
			),
			http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([]))
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.queryByText('School nights')).not.toBeInTheDocument());
	});

	it('surfaces a failed write as an error toast, leaving the stale row in place', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		render(ProfileSchedulesCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('School nights')).toBeInTheDocument());

		server.use(
			http.delete('/api/profiles/:profileId/schedules/:scheduleId', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		// A failed delete never optimistically removes the row, and never poisons the list's
		// own load-error state (that would flip the whole card into ErrorState) - it surfaces
		// only via a toast.
		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
		expect(screen.getByText('School nights')).toBeInTheDocument();
		expect(get(profileSchedulesStore).error).toBeNull();
	});
});
