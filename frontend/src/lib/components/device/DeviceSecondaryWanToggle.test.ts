/**
 * Tests for DeviceSecondaryWanToggle (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 10: per-device secondary-WAN-access deny toggle).
 *
 * Coverage:
 * - gate-off hides the control
 * - gate-on: toggling goes through ConfirmDialog naming the mesh reboot and
 *   own disconnection
 * - a backend changed:false shows an info toast, not a success toast
 * - a failed toggle surfaces an error toast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import DeviceSecondaryWanToggle from './DeviceSecondaryWanToggle.svelte';
import { entitlementsStore, uiStore, confirmDialog } from '$stores';
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

describe('DeviceSecondaryWanToggle', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('hides the control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(DeviceSecondaryWanToggle, { props: { deviceId: 'dev-1' } });

		expect(
			screen.queryByRole('button', { name: /deny secondary wan access/i })
		).not.toBeInTheDocument();
	});

	it('gate-on: toggling goes through ConfirmDialog naming the reboot and own disconnection', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(DeviceSecondaryWanToggle, { props: { deviceId: 'dev-1' } });

		let receivedBody: Record<string, unknown> | null = null;
		server.use(
			http.put('/api/devices/:deviceId/secondary-wan-access', async ({ request }) => {
				receivedBody = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: true,
					deny: true
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /deny secondary wan access/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.details?.some((d) => /restart|reboot/i.test(d))).toBe(true);
		expect(dialog!.details?.some((d) => /lose your own connection/i.test(d))).toBe(true);
		expect(receivedBody).toBeNull();

		await dialog!.onConfirm();

		expect(receivedBody).toEqual({ deny: true });
		expect(
			await screen.findByRole('button', { name: /allow secondary wan access/i })
		).toBeInTheDocument();
	});

	it('shows an info toast, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(DeviceSecondaryWanToggle, { props: { deviceId: 'dev-1' } });

		server.use(
			http.put('/api/devices/:deviceId/secondary-wan-access', () =>
				HttpResponse.json({ success: true, changed: false, reboot_expected: true, deny: false })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /deny secondary wan access/i }));
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

		render(DeviceSecondaryWanToggle, { props: { deviceId: 'dev-1' } });

		server.use(
			http.put('/api/devices/:deviceId/secondary-wan-access', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /deny secondary wan access/i }));
		const dialog = get(confirmDialog);
		const errorSpy = vi.spyOn(uiStore, 'error');

		await dialog!.onConfirm();

		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
