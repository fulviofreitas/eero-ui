/**
 * Tests for ProfileDevicesSection.svelte (WP5 reviewer fix R2):
 * - The list-view table must not have a nested <button> inside a `<tr role="button">` — the
 *   row itself carries no interactive role, and the device name is a real button instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ProfileDevicesSection from './ProfileDevicesSection.svelte';
import type { ProfileDevice } from '$api/types';

function makeDevice(overrides: Partial<ProfileDevice> = {}): ProfileDevice {
	return {
		id: 'dev-1',
		url: null,
		mac: 'AA:BB:CC:DD:EE:01',
		ip: '192.168.1.100',
		nickname: 'iPhone',
		hostname: 'iphone',
		display_name: 'iPhone',
		manufacturer: 'Apple',
		connected: true,
		wireless: true,
		paused: false,
		...overrides
	};
}

describe('ProfileDevicesSection list view', () => {
	function renderListView(devices: ProfileDevice[], onGoToDevice = vi.fn()) {
		const utils = render(ProfileDevicesSection, {
			props: {
				devices,
				deviceCount: devices.length,
				loading: false,
				onPauseDevice: vi.fn(),
				onGoToDevice,
				onRefresh: vi.fn()
			}
		});
		return { ...utils, onGoToDevice };
	}

	it('renders table rows with no interactive role, and a real button for the device name', async () => {
		const { onGoToDevice } = renderListView([makeDevice()]);

		// Switch to list view.
		await fireEvent.click(screen.getByTitle('List view'));

		const nameButton = screen.getByRole('button', { name: 'iPhone' });
		const row = nameButton.closest('tr')!;

		expect(row).not.toHaveAttribute('role');
		expect(row).not.toHaveAttribute('tabindex');

		await fireEvent.click(nameButton);
		expect(onGoToDevice).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-1' }));
	});

	it('marks the row offline (A7 dimming target) while the status badge cell is excluded from it', async () => {
		renderListView([makeDevice({ connected: false, id: 'dev-2' })]);
		await fireEvent.click(screen.getByTitle('List view'));

		const badge = screen.getByText('Offline');
		expect(badge).toHaveClass('badge-muted');

		const row = badge.closest('tr')!;
		expect(row).toHaveClass('offline');
		// The dimming rule (`.profile-device-row.offline td:not(:has(.badge))`) targets td cells
		// that don't contain a `.badge` - the status cell itself carries no *dimming* class (only
		// Svelte's own scoping hash class, unrelated to the row-level `paused`/`offline` classes).
		const badgeCell = badge.closest('td')!;
		expect(badgeCell.className).not.toMatch(/paused|offline/);
	});
});
