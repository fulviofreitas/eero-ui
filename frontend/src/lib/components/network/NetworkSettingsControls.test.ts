/**
 * Tests for NetworkSettingsControls (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 1-2: SQM, DHCP, connection mode, NAT port randomization).
 *
 * Coverage:
 * - gate-off hides every control
 * - gate-on: toggling SQM goes through ConfirmDialog naming the mesh
 *   reboot and the operator's own disconnection, before any PUT fires
 * - a successful SQM toggle confirmation applies the write
 * - a backend changed:false shows an info toast, not a success toast
 * - a failed toggle surfaces an error toast
 * - switching to BRIDGE requires the acknowledgement checkbox and names
 *   the DHCP/NAT/forwards/profiles consequence in the dialog
 * - the settings lock blocks a second settings write (DNS) while SQM is applying
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import NetworkSettingsControls from './NetworkSettingsControls.svelte';
import { securityWanStore, entitlementsStore, uiStore, confirmDialog, dnsStore } from '$stores';
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

describe('NetworkSettingsControls', () => {
	beforeEach(async () => {
		securityWanStore.clear();
		dnsStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
		resetSettingsLock();
		await securityWanStore.fetch('network-123');
	});

	it('hides every control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('button', { name: /enable sqm/i })).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('gate-on: toggling SQM goes through ConfirmDialog naming the reboot and own disconnection', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/sqm', () => {
				putCalls++;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					enabled: true
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable sqm/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(putCalls).toBe(0);
	});

	it('applies the write once the dialog is confirmed', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/sqm', () =>
				HttpResponse.json({ success: true, changed: true, reboot_expected: true, enabled: true })
			),
			// The re-fetch after a successful write reads the read-back value from
			// GET /security - reflect the new state there too.
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: 'enabled',
					wpa3_per_band: { band_2_4_ghz: true, band_5_ghz: true, band_6_ghz: false },
					fast_transition: { enabled: false },
					sqm: true,
					thread: { enabled: true, name: 'thread-net', channel: 15, pan_id: '0x1234' },
					updates: { has_update: false }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable sqm/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /disable sqm/i })).toBeInTheDocument()
		);
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/sqm', () =>
				HttpResponse.json({ success: true, changed: false, reboot_expected: true, enabled: false })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable sqm/i }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/already set/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('surfaces an error toast when the write fails', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/sqm', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable sqm/i }));
		const dialog = get(confirmDialog);
		const errorSpy = vi.spyOn(uiStore, 'error');

		await dialog!.onConfirm();

		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('shows an error toast, not a dialog, when switching to BRIDGE without acknowledging', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		const errorSpy = vi.spyOn(uiStore, 'error');
		await fireEvent.click(screen.getByRole('radio', { name: 'BRIDGE' }));

		expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/acknowledge/i));
		expect(get(confirmDialog)).toBeNull();
		errorSpy.mockRestore();
	});

	it('names the DHCP/NAT/forwards/profiles consequence once BRIDGE is acknowledged', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		await fireEvent.click(screen.getByRole('checkbox'));
		await fireEvent.click(screen.getByRole('radio', { name: 'BRIDGE' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(
			dialog!.details?.some((d) => /disables.*dhcp.*nat.*port forwards.*profiles/i.test(d))
		).toBe(true);
	});

	it('blocks a settings-class DNS write while an SQM write is applying', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NetworkSettingsControls, { props: { networkId: 'network-123' } });

		let resolveFirst: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});
		server.use(
			http.put('/api/networks/:networkId/sqm', async () => {
				await gate;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					enabled: true
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable sqm/i }));
		const dialog = get(confirmDialog);
		const applyPromise = dialog!.onConfirm();

		await expect(dnsStore.updateDns('network-123', { caching: true })).rejects.toThrow(
			/already being applied/i
		);

		resolveFirst!();
		await applyPromise;
	});
});
