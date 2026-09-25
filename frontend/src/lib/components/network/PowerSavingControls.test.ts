/**
 * Tests for PowerSavingControls (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 8: power-saving enable/schedule_enabled toggles).
 *
 * Coverage:
 * - gate-off hides every control
 * - gate-on: toggling goes through ConfirmDialog naming the mesh reboot and
 *   own disconnection
 * - a backend changed:false shows an info toast, not a success toast
 * - a failed toggle surfaces an error toast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import PowerSavingControls from './PowerSavingControls.svelte';
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

describe('PowerSavingControls', () => {
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

		render(PowerSavingControls, { props: { networkId: 'network-123' } });

		expect(screen.queryByRole('button', { name: 'Enable Power Saving' })).not.toBeInTheDocument();
		expect(screen.getByText(/EERO_DASHBOARD_EXPERIMENTAL_WRITES/i)).toBeInTheDocument();
	});

	it('gate-on: toggling Power Saving goes through ConfirmDialog naming the reboot and own disconnection', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(PowerSavingControls, { props: { networkId: 'network-123' } });

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/networks/:networkId/power-saving', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					enable: true,
					schedule_enabled: null
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Enable Power Saving' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).toEqual({ enable: true });
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(PowerSavingControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/power-saving', () =>
				HttpResponse.json({
					success: true,
					changed: false,
					reboot_expected: true,
					enable: false,
					schedule_enabled: null
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Enable Power Saving' }));
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

		render(PowerSavingControls, { props: { networkId: 'network-123' } });

		server.use(
			http.put('/api/networks/:networkId/power-saving', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Enable Power Saving' }));
		const dialog = get(confirmDialog);
		const errorSpy = vi.spyOn(uiStore, 'error');

		await dialog!.onConfirm();

		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
