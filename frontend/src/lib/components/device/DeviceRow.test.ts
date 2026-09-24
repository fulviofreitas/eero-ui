/**
 * Tests for DeviceRow.svelte's action menu (plan § 5, § 8.2):
 * - Block is pessimistic and unverified: the confirm dialog it queues via
 *   `uiStore.confirm()` carries wording that says so, so an operator isn't
 *   left assuming the write is as trustworthy as unblock/rename.
 * - Unblock and rename do NOT go through a confirm dialog at all (Verified,
 *   § 5 - safe for the existing optimistic pattern).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import DeviceRow from './DeviceRow.svelte';
import { uiStore } from '$stores';
import type { DeviceSummary } from '$api/types';

function makeDevice(overrides: Partial<DeviceSummary> = {}): DeviceSummary {
	return {
		id: 'dev-1',
		url: null,
		mac: 'AA:BB:CC:DD:EE:01',
		ip: '192.168.1.100',
		nickname: 'iPhone',
		hostname: 'iphone',
		display_name: 'iPhone',
		manufacturer: 'Apple',
		model_name: null,
		device_type: 'phone',
		connected: true,
		wireless: true,
		blocked: false,
		paused: false,
		is_guest: false,
		connection_type: 'wireless',
		signal_strength: -50,
		frequency: '5GHz',
		connected_to_eero: 'Living Room',
		last_active: null,
		profile_id: null,
		profile_name: null,
		...overrides
	};
}

async function openActionMenu() {
	await fireEvent.click(screen.getByRole('button', { name: 'Device actions' }));
}

describe('DeviceRow action menu', () => {
	beforeEach(() => {
		uiStore.closeConfirm();
	});

	it('block (Unverified, § 5) queues a confirm dialog whose details mention it is not verified', async () => {
		render(DeviceRow, { props: { device: makeDevice({ blocked: false }) } });

		await openActionMenu();
		await fireEvent.click(screen.getByRole('menuitem', { name: /Block/ }));

		await waitFor(() => expect(get(uiStore).confirmDialog).not.toBeNull());
		const dialog = get(uiStore).confirmDialog!;
		expect(dialog.danger).toBe(true);
		expect(dialog.details?.join(' ')).toMatch(/not verified/i);
	});

	it('unblock (Verified, § 5) never queues a confirm dialog', async () => {
		render(DeviceRow, { props: { device: makeDevice({ blocked: true }) } });

		await openActionMenu();
		await fireEvent.click(screen.getByRole('menuitem', { name: /Unblock/ }));

		// Give any (incorrect) confirm() call a tick to land before asserting its absence.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(get(uiStore).confirmDialog).toBeNull();
	});

	it('shows Block for an unblocked device and Unblock for a blocked one', async () => {
		const { rerender } = render(DeviceRow, { props: { device: makeDevice({ blocked: false }) } });
		await openActionMenu();
		expect(screen.getByRole('menuitem', { name: /Block/ })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: /Unblock/ })).toBeNull();

		// The menu is still open across the prop update (same component
		// instance) - re-opening it here would toggle it closed instead.
		await rerender({ device: makeDevice({ blocked: true }) });
		expect(screen.getByRole('menuitem', { name: /Unblock/ })).toBeInTheDocument();
	});
});
