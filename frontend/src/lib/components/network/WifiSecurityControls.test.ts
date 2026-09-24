/**
 * Tests for WifiSecurityControls (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 3-7: WPA3 per band, security envelope, MLO, fast transition,
 * Passpoint, proxied nodes).
 *
 * Coverage:
 * - gate-off hides every control
 * - gate-on: toggling an envelope field (band_steering) goes through
 *   ConfirmDialog naming the mesh reboot and own disconnection, and never
 *   sends more than one field per request
 * - a backend changed:false shows an info toast, not a success toast
 * - a failed toggle surfaces an error toast
 * - MLO mode change applies and re-fetches
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import WifiSecurityControls from './WifiSecurityControls.svelte';
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

describe('WifiSecurityControls', () => {
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

		render(WifiSecurityControls, { props: { networkId: 'network-123' } });

		expect(
			screen.queryByRole('button', { name: /disable band_steering/i })
		).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('gate-on: toggling Band Steering goes through ConfirmDialog naming the reboot and own disconnection, one field per request', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WifiSecurityControls, { props: { networkId: 'network-123' } });

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/networks/:networkId/security', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					field: 'band_steering',
					value: false
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable band steering/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).toEqual({ band_steering: false });
		expect(Object.keys(receivedBody!)).toHaveLength(1);
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WifiSecurityControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					success: true,
					changed: false,
					reboot_expected: true,
					field: 'band_steering',
					value: true
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable band steering/i }));
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

		render(WifiSecurityControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/security', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable band steering/i }));
		const dialog = get(confirmDialog);
		const errorSpy = vi.spyOn(uiStore, 'error');

		await dialog!.onConfirm();

		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('applies an MLO mode change and re-fetches', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(WifiSecurityControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/mlo', () =>
				HttpResponse.json({ success: true, changed: true, reboot_expected: true, mode: 'single' })
			)
		);

		await fireEvent.click(screen.getByRole('radio', { name: 'single' }));
		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		await dialog!.onConfirm();

		await waitFor(() => {
			const radio = screen.getByRole('radio', { name: 'single' }) as HTMLInputElement;
			expect(radio.checked).toBe(true);
		});
	});
});
