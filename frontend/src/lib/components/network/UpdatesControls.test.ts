/**
 * Tests for UpdatesControls (phase-6.0-revamp.md § 5, § 7 WP8, family 11:
 * "Apply update").
 *
 * Coverage:
 * - hidden entirely when no update is available
 * - gate-off hides the button when an update is available
 * - gate-on: applying goes through ConfirmDialog naming the reboot and own
 *   disconnection
 * - a 409 no_update_available/update_in_progress response shows an inline
 *   note rather than a success toast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import UpdatesControls from './UpdatesControls.svelte';
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

function mockUpdateAvailable(available: boolean) {
	server.use(
		http.get('/api/networks/:networkId/security', () =>
			HttpResponse.json({
				wpa3: true,
				band_steering: true,
				upnp: false,
				ipv6: 'enabled',
				wpa3_per_band: { band_2_4_ghz: true, band_5_ghz: true },
				fast_transition: { enabled: false },
				sqm: false,
				thread: { enabled: true },
				updates: { available }
			})
		)
	);
}

describe('UpdatesControls', () => {
	beforeEach(async () => {
		securityWanStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
		resetSettingsLock();
	});

	it('renders nothing when no update is available', async () => {
		mockUpdateAvailable(false);
		mockEntitlements(true);
		await securityWanStore.fetch('network-123');
		await entitlementsStore.fetch('network-123');

		render(UpdatesControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('button', { name: /apply update/i })).not.toBeInTheDocument();
	});

	it('hides the button when the experimental-writes gate is off, even with an update available', async () => {
		mockUpdateAvailable(true);
		mockEntitlements(false);
		await securityWanStore.fetch('network-123');
		await entitlementsStore.fetch('network-123');

		render(UpdatesControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('button', { name: /apply update/i })).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('gate-on with an update available: applying goes through ConfirmDialog naming the reboot and own disconnection', async () => {
		mockUpdateAvailable(true);
		mockEntitlements(true);
		await securityWanStore.fetch('network-123');
		await entitlementsStore.fetch('network-123');

		render(UpdatesControls, { props: { networkId: 'network-123' } });

		let called = false;
		server.use(
			http.post('/api/networks/:networkId/updates/apply', () => {
				called = true;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					scope: 'all_nodes'
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /apply update/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(called).toBe(false);

		const successSpy = vi.spyOn(uiStore, 'success');
		await dialog!.onConfirm();

		expect(called).toBe(true);
		expect(successSpy).toHaveBeenCalled();
		successSpy.mockRestore();
	});

	it('shows an inline note (not a success toast) on a 409 no_update_available response', async () => {
		mockUpdateAvailable(true);
		mockEntitlements(true);
		await securityWanStore.fetch('network-123');
		await entitlementsStore.fetch('network-123');

		render(UpdatesControls, { props: { networkId: 'network-123' } });

		server.use(
			http.post('/api/networks/:networkId/updates/apply', () =>
				HttpResponse.json(
					{ type: 'no_update_available', detail: 'No update is pending.' },
					{ status: 409 }
				)
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /apply update/i }));
		const dialog = get(confirmDialog);
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(successSpy).not.toHaveBeenCalled();
		expect(screen.getByText(/no update is pending/i)).toBeInTheDocument();
		successSpy.mockRestore();
	});
});
