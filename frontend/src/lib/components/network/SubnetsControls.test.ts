/**
 * Tests for SubnetsControls (phase-6.0-revamp.md § 5, § 7 WP8, family 9:
 * edit/delete for non-main subnets).
 *
 * Coverage:
 * - gate-off hides every control
 * - the "main" subnet is never offered in the picker
 * - gate-on: saving a non-main subnet goes through ConfirmDialog naming the
 *   mesh reboot and own disconnection, and never sends a blank password
 * - a backend changed:false shows an info toast, not a success toast
 * - delete goes through its own ConfirmDialog
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import SubnetsControls from './SubnetsControls.svelte';
import { securityWanStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
import { resetSettingsLock } from '$lib/stores/settingsLock';
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

function mockSubnets() {
	server.use(
		http.get('/api/networks/:networkId/subnets', () =>
			HttpResponse.json({
				subnets: [
					{
						subnet_type: 'main',
						name: 'Main',
						enabled: true,
						wan_access: true,
						open_network: false
					},
					{ subnet_type: 'iot', name: 'IoT', enabled: true, wan_access: true, open_network: false }
				]
			})
		)
	);
}

describe('SubnetsControls', () => {
	beforeEach(async () => {
		securityWanStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
		resetSettingsLock();
		mockSubnets();
		await securityWanStore.fetch('network-123');
	});

	it('hides every control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(SubnetsControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('never offers the "main" subnet in the picker', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SubnetsControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('option', { name: 'Main' })).not.toBeInTheDocument();
		expect(screen.getByRole('option', { name: 'IoT' })).toBeInTheDocument();
	});

	it('gate-on: saving goes through ConfirmDialog naming the reboot and own disconnection, never sends a blank password', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SubnetsControls, { props: { networkId: 'network-123' } });

		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'iot' } });

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/networks/:networkId/subnets', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					subnet: { subnet_type: 'iot' }
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Save Subnet' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).not.toBeNull();
		expect(receivedBody).not.toHaveProperty('password');
		expect(receivedBody!.subnet_type).toBe('iot');
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SubnetsControls, { props: { networkId: 'network-123' } });
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'iot' } });

		server.use(
			http.put('/api/networks/:networkId/subnets', () =>
				HttpResponse.json({
					success: true,
					changed: false,
					reboot_expected: true,
					subnet: { subnet_type: 'iot' }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Save Subnet' }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/already set/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('Delete goes through its own ConfirmDialog before any DELETE fires', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SubnetsControls, { props: { networkId: 'network-123' } });
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'iot' } });

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/subnets/:subnetType', () => {
				deleteCalls++;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					subnet: null
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Subnet' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(deleteCalls).toBe(0);

		await dialog!.onConfirm();
		await waitFor(() => expect(deleteCalls).toBe(1));
	});
});
