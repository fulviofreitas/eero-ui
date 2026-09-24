/**
 * Tests for ForwardsReservationsCard (phase-6.0-revamp.md § 7 WP7, family 8).
 *
 * Coverage:
 * - loads and renders both lists on mount
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides every write control (Add Forward/Add Reservation and each
 *   row's Edit/Delete), showing the muted operator note instead
 * - gate-on: deleting a forward goes through ConfirmDialog naming "not
 *   verified end-to-end" before any DELETE fires
 * - a successful forward create (via the modal) re-fetches and renders the
 *   read-back
 * - a failed write surfaces an error toast, not a thrown crash
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import ForwardsReservationsCard from './ForwardsReservationsCard.svelte';
import { forwardsReservationsStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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

describe('ForwardsReservationsCard', () => {
	beforeEach(() => {
		forwardsReservationsStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders both lists on mount', async () => {
		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Web server')).toBeInTheDocument());
		expect(screen.getByText('Printer')).toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/forwards', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/forwards', () => HttpResponse.json({ forwards: [] }))
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('No port forwards')).toBeInTheDocument());
	});

	it('hides every write control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Web server')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'Add Forward' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Add Reservation' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
	});

	it('gate-on: deleting a forward goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Web server')).toBeInTheDocument());

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/forwards/:forwardId', () => {
				deleteCalls++;
				return HttpResponse.json({ success: true });
			})
		);

		await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(deleteCalls).toBe(0);
	});

	it('a successful forward create via the modal re-fetches and renders the read-back', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Web server')).toBeInTheDocument());

		server.use(
			http.post('/api/networks/:networkId/forwards', () =>
				HttpResponse.json(
					{
						id: 'forward-new',
						client_port: 9000,
						gateway_port: 90,
						ip: '192.168.1.70',
						protocol: 'tcp',
						description: 'New Forward',
						enabled: true
					},
					{ status: 201 }
				)
			),
			http.get('/api/networks/:networkId/forwards', () =>
				HttpResponse.json({
					forwards: [
						{
							id: 'forward-1',
							client_port: 8080,
							gateway_port: 80,
							ip: '192.168.1.50',
							protocol: 'tcp',
							description: 'Web server',
							enabled: true
						},
						{
							id: 'forward-new',
							client_port: 9000,
							gateway_port: 90,
							ip: '192.168.1.70',
							protocol: 'tcp',
							description: 'New Forward',
							enabled: true
						}
					]
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Add Forward' }));
		await fireEvent.input(screen.getByLabelText('Client Port'), { target: { value: '9000' } });
		await fireEvent.input(screen.getByLabelText('Gateway Port'), { target: { value: '90' } });
		await fireEvent.input(screen.getByLabelText('IP (private IPv4)'), {
			target: { value: '192.168.1.70' }
		});
		await fireEvent.input(screen.getByLabelText('Description (optional)'), {
			target: { value: 'New Forward' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByText('New Forward')).toBeInTheDocument());
	});

	it('surfaces a failed reservation create as an error toast, not a thrown crash', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ForwardsReservationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Printer')).toBeInTheDocument());

		server.use(
			http.post('/api/networks/:networkId/reservations', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Add Reservation' }));
		await fireEvent.input(screen.getByLabelText('IP (private IPv4)'), {
			target: { value: '192.168.1.80' }
		});
		await fireEvent.input(screen.getByLabelText('MAC Address'), {
			target: { value: 'aa:bb:cc:dd:ee:11' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
		expect(get(forwardsReservationsStore).error).toBeNull();
	});
});
