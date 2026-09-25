/**
 * Tests for DeviceList after the DataTable migration (phase-6.0-revamp.md § 6.2 Tier 2).
 *
 * Covers what the migration must preserve: field-scoped search, live filter counts,
 * keyboard-driven sort (DataTable's `<button aria-sort>`, not the old mouse-only `<th>`), the
 * shift-click bulk-selection range (now provided by DataTable itself), and that export still
 * renders. Uses the default 3-device MSW fixture from tests/mocks/handlers.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { devicesStore, deviceFilters, selectionMode, selectedDevices } from '$stores';
import DeviceList from './DeviceList.svelte';
import { server } from '../../../../tests/mocks/server';

const DEVICES_FIXTURE = [
	{
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
		profile_name: null
	},
	{
		id: 'dev-2',
		url: null,
		mac: 'AA:BB:CC:DD:EE:02',
		ip: '192.168.1.101',
		nickname: 'Laptop',
		hostname: 'laptop',
		display_name: 'Laptop',
		manufacturer: null,
		model_name: null,
		device_type: 'computer',
		connected: true,
		wireless: false,
		blocked: false,
		paused: false,
		is_guest: false,
		connection_type: 'wired',
		signal_strength: null,
		frequency: null,
		connected_to_eero: 'Living Room',
		last_active: null,
		profile_id: null,
		profile_name: null
	},
	{
		id: 'dev-3',
		url: null,
		mac: 'AA:BB:CC:DD:EE:03',
		ip: '192.168.1.102',
		nickname: 'Smart TV',
		hostname: 'smart-tv',
		display_name: 'Smart TV',
		manufacturer: null,
		model_name: null,
		device_type: 'tv',
		connected: false,
		wireless: true,
		blocked: false,
		paused: false,
		is_guest: false,
		connection_type: 'wireless',
		signal_strength: null,
		frequency: null,
		connected_to_eero: null,
		last_active: null,
		profile_id: null,
		profile_name: null
	}
];

function resetStores() {
	devicesStore.clear();
	deviceFilters.set({
		search: '',
		status: 'all',
		connectionType: 'all',
		frequency: 'all',
		sortBy: 'name',
		sortOrder: 'asc'
	});
	selectionMode.set(false);
	selectedDevices.set(new Set());
}

async function renderLoaded() {
	render(DeviceList);
	await waitFor(() => expect(screen.getByText('3 filtered')).toBeInTheDocument());
}

function bodyRowNames() {
	return within(screen.getByRole('table'))
		.getAllByRole('row')
		.slice(1)
		.map((row) => within(row).queryAllByRole('link').at(0)?.textContent ?? row.textContent);
}

describe('DeviceList', () => {
	beforeEach(() => {
		resetStores();
	});

	it('loads and renders all devices with live filter counts', async () => {
		await renderLoaded();

		expect(screen.getByText('3 total')).toBeInTheDocument();
		// dev-1 (wireless, connected), dev-2 (wired, connected), dev-3 (wireless, disconnected)
		expect(screen.getByRole('button', { name: /Connected \(2\)/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Offline \(1\)/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Blocked \(0\)/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Wireless \(1\)/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Wired \(1\)/ })).toBeInTheDocument();
	});

	it('filters by field-scoped search (device=)', async () => {
		await renderLoaded();

		const search = screen.getByPlaceholderText(/Search devices/);
		await fireEvent.input(search, { target: { value: 'device=laptop' } });

		await waitFor(() => expect(screen.getByText('1 filtered')).toBeInTheDocument());
		expect(screen.getByText('Laptop')).toBeInTheDocument();
		expect(screen.queryByText('iPhone')).not.toBeInTheDocument();
	});

	it('clearing the search restores the full list', async () => {
		await renderLoaded();

		const search = screen.getByPlaceholderText(/Search devices/);
		await fireEvent.input(search, { target: { value: 'ip=10.0.5' } });
		await waitFor(() => expect(screen.getByText('0 filtered')).toBeInTheDocument());

		await fireEvent.click(screen.getByTitle('Clear search'));
		await waitFor(() => expect(screen.getByText('3 filtered')).toBeInTheDocument());
	});

	it('sorts via the keyboard-accessible column header and updates aria-sort', async () => {
		await renderLoaded();

		const ipHeader = () => screen.getByRole('columnheader', { name: /^IP Address/ });
		const sortButton = () => within(ipHeader()).getByRole('button');

		expect(ipHeader()).toHaveAttribute('aria-sort', 'none');

		// Ascending: 100, 101, 102 - same order as the default name sort for this fixture.
		await fireEvent.click(sortButton());
		expect(ipHeader()).toHaveAttribute('aria-sort', 'ascending');
		expect(bodyRowNames()).toEqual(['iPhone', 'Laptop', 'Smart TV']);

		// Descending flips it - proof the header (not just the store) drives the table.
		await fireEvent.click(sortButton());
		expect(ipHeader()).toHaveAttribute('aria-sort', 'descending');
		expect(bodyRowNames()).toEqual(['Smart TV', 'Laptop', 'iPhone']);
	});

	it('supports shift-click range selection once selection mode is on', async () => {
		await renderLoaded();

		await fireEvent.click(screen.getByRole('button', { name: /^Select$/ }));

		await fireEvent.click(screen.getByLabelText('Select row dev-1'));
		await fireEvent.click(screen.getByLabelText('Select row dev-3'), { shiftKey: true });

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Assign to Profile \(3\)/ })).toBeInTheDocument()
		);
	});

	it('still renders the export control once devices have loaded', async () => {
		await renderLoaded();
		expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
	});

	// Skeleton-first loading (phase-6.0-revamp.md § 6.1/6.2 Tier 3, WP9): the table shows a
	// row-shaped skeleton only while there is no data yet, and keeps rendering existing rows
	// (stale-while-revalidate) while a refresh is in flight.
	it('shows a skeleton, not an empty table, before the first fetch resolves', async () => {
		server.use(
			http.get('/api/devices', async () => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				return HttpResponse.json(DEVICES_FIXTURE);
			})
		);

		render(DeviceList);

		expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		expect(screen.queryByRole('table')).toBeNull();

		await waitFor(() => expect(screen.getByText('3 filtered')).toBeInTheDocument());
		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
	});

	it('keeps showing existing rows while a manual refresh is in flight', async () => {
		await renderLoaded();
		expect(screen.getByText('iPhone')).toBeInTheDocument();

		let resolveRefetch: (() => void) | undefined;
		server.use(
			http.get('/api/devices', () => {
				return new Promise((resolve) => {
					resolveRefetch = () => resolve(HttpResponse.json(DEVICES_FIXTURE));
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

		// Stale-while-revalidate: the old rows and their data stay on screen, no skeleton.
		expect(screen.getByText('iPhone')).toBeInTheDocument();
		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();

		resolveRefetch?.();
		await waitFor(() => expect(screen.getByText('iPhone')).toBeInTheDocument());
	});
});
