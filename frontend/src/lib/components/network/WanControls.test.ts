/**
 * Tests for WanControls (phase-6.0-revamp.md § 5, § 7 WP8, family 10:
 * multistaticip form + bulk secondary-WAN deny table).
 *
 * Coverage:
 * - gate-off hides every control
 * - gate-on: saving multi-static-IP goes through ConfirmDialog naming the
 *   mesh reboot and own disconnection
 * - a backend changed:false shows an info toast, not a success toast
 * - adding a device MAC and applying secondary-WAN access sends the bulk
 *   payload through its own ConfirmDialog
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import WanControls from './WanControls.svelte';
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

describe('WanControls', () => {
	beforeEach(async () => {
		securityWanStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
		resetSettingsLock();
		await securityWanStore.fetch('network-123');
	});

	it('hides every control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(WanControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('button', { name: /save multi-static-ip/i })).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('gate-on: saving multi-static-IP goes through ConfirmDialog naming the reboot and own disconnection', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WanControls, { props: { networkId: 'network-123' } });

		await fireEvent.click(screen.getByLabelText('Enabled'));
		await fireEvent.input(screen.getByLabelText('Router IP'), {
			target: { value: '203.0.113.1' }
		});
		await fireEvent.input(screen.getByLabelText('Subnet IP'), {
			target: { value: '203.0.113.0' }
		});
		await fireEvent.input(screen.getByLabelText('Subnet Mask'), {
			target: { value: '255.255.255.248' }
		});

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/networks/:networkId/multistaticip', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					config: receivedBody
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /save multi-static-ip/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).toMatchObject({ enabled: true, type: 'P' });
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WanControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/multistaticip', () =>
				HttpResponse.json({
					success: true,
					changed: false,
					reboot_expected: true,
					config: { enabled: false }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /save multi-static-ip/i }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/already set/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('adds a device MAC and applies secondary-WAN access through its own ConfirmDialog', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WanControls, { props: { networkId: 'network-123' } });

		const macInput = screen.getByLabelText('Add device MAC');
		await fireEvent.input(macInput, { target: { value: 'aa:bb:cc:dd:ee:ff' } });
		await fireEvent.keyDown(macInput, { key: 'Enter' });

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/networks/:networkId/secondary-wan', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					config: receivedBody
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /apply secondary wan access/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).toEqual({
			devices: [{ mac: 'aa:bb:cc:dd:ee:ff', secondary_wan_deny_access: true }]
		});
	});
});
