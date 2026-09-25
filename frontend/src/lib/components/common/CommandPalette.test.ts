/**
 * Tests for the ⌘K command palette (WP9 § 6.2 Tier 3). Uses the default MSW fixtures
 * (tests/mocks/handlers.ts): devices iPhone/Laptop/Smart TV, eeros "Living Room"/second unit,
 * profiles Kids/Guests, network "Home Network".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { devicesStore, networksStore } from '$stores';
import CommandPalette from './CommandPalette.svelte';

const gotoMock = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

// Eeros/profiles have no dedicated store yet (see CommandPalette.svelte's header comment) - it
// fetches them directly via the API client. Overriding just those two methods (keeping every
// other export, incl. `devices`/`networks` that devicesStore/networksStore themselves import)
// keeps this test deterministic and fast rather than depending on MSW's real fetch timing for an
// orthogonal concern.
vi.mock('$api/client', async () => {
	const actual = await vi.importActual<typeof import('$api/client')>('$api/client');
	return {
		...actual,
		api: {
			...actual.api,
			eeros: {
				...actual.api.eeros,
				list: vi.fn().mockResolvedValue([
					{
						id: 'eero-1',
						url: '/eeros/eero-1',
						serial: 'SERIAL1',
						mac_address: 'AA:BB:CC:00:00:01',
						model: 'eero Pro 6E',
						status: 'green',
						location: 'Living Room',
						is_gateway: true,
						is_primary: true,
						connected_clients_count: 8,
						firmware_version: '7.0.0',
						ip_address: '192.168.1.1',
						mesh_quality_bars: 4,
						led_on: true,
						wired: true
					}
				])
			},
			profiles: {
				...actual.api.profiles,
				list: vi.fn().mockResolvedValue([
					{
						id: 'profile-1',
						url: null,
						name: 'Kids',
						paused: false,
						device_count: 3,
						device_ids: [],
						devices: []
					},
					{
						id: 'profile-2',
						url: null,
						name: 'Guests',
						paused: true,
						device_count: 0,
						device_ids: [],
						devices: []
					}
				])
			}
		}
	};
});

async function renderOpen() {
	render(CommandPalette, { props: { open: true } });
	await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
	// Wait for the "Loading…" placeholder to clear - devices/eeros/profiles/networks are loaded.
	await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
}

describe('CommandPalette', () => {
	beforeEach(() => {
		devicesStore.clear();
		networksStore.clear();
		localStorage.clear();
		gotoMock.mockClear();
	});

	it('does not render the dialog when closed', () => {
		render(CommandPalette, { props: { open: false } });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('shows a hint when the query is empty and there are no recents', async () => {
		await renderOpen();
		expect(screen.getByText(/type to search/i)).toBeInTheDocument();
	});

	it('ranks a prefix match above a substring match and groups results by entity type', async () => {
		await renderOpen();
		const input = screen.getByRole('combobox');

		// "lap" is a prefix of Laptop's label but only a substring nowhere else - single hit.
		await fireEvent.input(input, { target: { value: 'lap' } });
		await waitFor(() => expect(screen.getByText('Laptop')).toBeInTheDocument());
		expect(screen.getByText('Devices')).toBeInTheDocument();

		// "living" matches the eero's location field.
		await fireEvent.input(input, { target: { value: 'living' } });
		await waitFor(() => expect(screen.getByText('Eeros')).toBeInTheDocument());

		// "kids" matches a profile name.
		await fireEvent.input(input, { target: { value: 'kids' } });
		await waitFor(() => expect(screen.getByText('Profiles')).toBeInTheDocument());

		// "home" matches the network name.
		await fireEvent.input(input, { target: { value: 'home' } });
		await waitFor(() => expect(screen.getByText('Networks')).toBeInTheDocument());
	});

	it('supports ArrowDown/ArrowUp/Home/End navigation and Enter navigates via goto', async () => {
		await renderOpen();
		const input = screen.getByRole('combobox');

		// A broad query that matches more than one device by substring.
		await fireEvent.input(input, { target: { value: 'e' } });
		await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));

		const options = () => screen.getAllByRole('option');
		expect(options()[0]).toHaveAttribute('aria-selected', 'true');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(options()[1]).toHaveAttribute('aria-selected', 'true');

		await fireEvent.keyDown(input, { key: 'ArrowUp' });
		expect(options()[0]).toHaveAttribute('aria-selected', 'true');

		await fireEvent.keyDown(input, { key: 'End' });
		const lastIndex = options().length - 1;
		expect(options()[lastIndex]).toHaveAttribute('aria-selected', 'true');

		await fireEvent.keyDown(input, { key: 'Home' });
		expect(options()[0]).toHaveAttribute('aria-selected', 'true');

		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock.mock.calls[0][0]).toMatch(/^\/(devices|eeros|profiles|network)\//);
	});

	// Escape-closes is exercised end-to-end (with a real `bind:open` parent) in
	// routes/layout-command-palette.test.ts - CommandPalette's own `open` is `$bindable` with no
	// bound parent in this file's plain `render()` calls, which isn't representative of how it's
	// actually mounted (+layout.svelte always binds it).
});
