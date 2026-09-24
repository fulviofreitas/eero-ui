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
import { devicesStore, deviceFilters, selectionMode, selectedDevices } from '$stores';
import DeviceList from './DeviceList.svelte';

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
});
