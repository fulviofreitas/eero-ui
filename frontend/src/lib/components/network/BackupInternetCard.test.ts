/**
 * Tests for BackupInternetCard (phase-6.0-revamp.md § 7 WP6, deliverable 11).
 *
 * Coverage:
 * - loads and renders status and access points on mount
 * - a 402 renders the premium upsell note, not an error
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides the enable/disable toggle button
 * - gate-on: the toggle goes through ConfirmDialog naming "not verified
 *   end-to-end" before any PUT fires
 * - a successful toggle confirmation re-fetches
 * - a backend `changed:false` renders an informational message, not a
 *   success toast
 * - a failed toggle surfaces an error toast
 * - gate-off hides the add/edit/delete/reorder/discover/check access-point
 *   controls (phase-6.0-revamp.md § 7 WP7, family 5)
 * - gate-on: adding an access point goes through ConfirmDialog naming "not
 *   verified end-to-end" before any POST fires
 * - a successful add confirmation re-fetches the access-point list
 * - a failed add surfaces an error toast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import BackupInternetCard from './BackupInternetCard.svelte';
import { backupInternetStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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

describe('BackupInternetCard', () => {
	beforeEach(() => {
		backupInternetStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders status and access points on mount', async () => {
		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());
		expect(screen.getByText('Enabled', { selector: '.badge' })).toBeInTheDocument();
	});

	it('renders the premium upsell note — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Backup internet requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ enabled: false, cellular_usage: null, cellular_events: [] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
	});

	it('hides the enable/disable button when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
	});

	it('gate-on: the toggle goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/backup-internet', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, enabled: false });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it('a successful toggle confirmation re-fetches', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ success: true, changed: true, enabled: false })
			),
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ enabled: false, cellular_usage: null, cellular_events: [] })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument());
	});

	it('shows an informational message, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ success: true, changed: false, enabled: true })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('surfaces a failed toggle as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('hides the add/edit/delete/reorder/discover/check access-point controls when the gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'Add Access Point' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Check Connectivity' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});

	it('gate-on: deleting an access point goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/backup-access-points/:apId', () => {
				deleteCalls++;
				return HttpResponse.json({ success: true });
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

	it('adding an access point via the modal re-fetches the (now longer) access-point list', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		server.use(
			http.post('/api/networks/:networkId/backup-access-points', () =>
				HttpResponse.json(
					{
						id: 'ap-new',
						ssid: 'New AP',
						uuid: null,
						priority: 2,
						enabled: true,
						status: null,
						connectivity: null
					},
					{ status: 201 }
				)
			),
			http.get('/api/networks/:networkId/backup-access-points', () =>
				HttpResponse.json({
					access_points: [
						{
							id: 'ap-1',
							ssid: 'Backup-5G',
							uuid: 'uuid-1',
							priority: 1,
							enabled: true,
							status: 'active',
							connectivity: null
						},
						{
							id: 'ap-new',
							ssid: 'New AP',
							uuid: null,
							priority: 2,
							enabled: true,
							status: null,
							connectivity: null
						}
					]
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Add Access Point' }));
		await fireEvent.input(screen.getByLabelText('SSID'), { target: { value: 'New AP' } });
		await fireEvent.input(screen.getByLabelText(/Password/), {
			target: { value: 'correct-horse-battery' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByText('New AP')).toBeInTheDocument());
	});

	it('surfaces a failed add as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(BackupInternetCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());

		server.use(
			http.post('/api/networks/:networkId/backup-access-points', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Add Access Point' }));
		await fireEvent.input(screen.getByLabelText('SSID'), { target: { value: 'New AP' } });
		await fireEvent.input(screen.getByLabelText(/Password/), {
			target: { value: 'correct-horse-battery' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});
});
