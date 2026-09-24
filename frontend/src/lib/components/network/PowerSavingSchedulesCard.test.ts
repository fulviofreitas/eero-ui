/**
 * Tests for PowerSavingSchedulesCard (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 8). NOT settings-class - own sub-resource, no documented reboot
 * behaviour.
 *
 * Coverage:
 * - the list renders once loaded
 * - gate-off hides every write control (Add Schedule and each row's
 *   Edit/Delete), showing the muted operator note instead
 * - gate-on: Delete goes through ConfirmDialog naming "not verified
 *   end-to-end" before any DELETE fires
 * - a successful delete confirmation re-fetches the (now empty) list
 * - a failed write surfaces an error toast, not a thrown crash
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import PowerSavingSchedulesCard from './PowerSavingSchedulesCard.svelte';
import { powerSavingSchedulesStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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
	id: 'schedule-1',
	name: 'Overnight',
	days: ['mon', 'tue'],
	start_time: '01:00',
	end_time: '06:00',
	enabled: true
};

describe('PowerSavingSchedulesCard', () => {
	beforeEach(() => {
		powerSavingSchedulesStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('renders the schedule list once loaded', async () => {
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		render(PowerSavingSchedulesCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Overnight')).toBeInTheDocument());
		expect(screen.getByText('mon, tue')).toBeInTheDocument();
	});

	it('hides every write control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		render(PowerSavingSchedulesCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Overnight')).toBeInTheDocument());

		expect(screen.queryByRole('button', { name: 'Add Schedule' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
	});

	it('gate-on: Delete goes through ConfirmDialog naming "not verified end-to-end" before any DELETE fires', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		render(PowerSavingSchedulesCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Overnight')).toBeInTheDocument());

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/power-saving/schedules/:scheduleId', () => {
				deleteCalls++;
				return HttpResponse.json({ success: true, schedule: null });
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
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		render(PowerSavingSchedulesCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Overnight')).toBeInTheDocument());

		server.use(
			http.delete('/api/networks/:networkId/power-saving/schedules/:scheduleId', () =>
				HttpResponse.json({ success: true, schedule: null })
			),
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [] })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.queryByText('Overnight')).not.toBeInTheDocument());
	});

	it('surfaces a failed write as an error toast, leaving the stale row in place', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		render(PowerSavingSchedulesCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Overnight')).toBeInTheDocument());

		server.use(
			http.delete('/api/networks/:networkId/power-saving/schedules/:scheduleId', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
		expect(screen.getByText('Overnight')).toBeInTheDocument();
		expect(get(powerSavingSchedulesStore).error).toBeNull();
	});
});
