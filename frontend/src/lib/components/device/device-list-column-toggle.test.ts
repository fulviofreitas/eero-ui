import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
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

describe('DeviceList column visibility toggle', () => {
	beforeEach(() => resetStores());
	it('column toggle works', async () => {
		render(DeviceList);
		await waitFor(() => expect(screen.getByText('3 filtered')).toBeInTheDocument());
		expect(screen.getByRole('columnheader', { name: /^IP/ })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /columns/i }));
		expect(screen.queryByLabelText('IP Address')).not.toBeNull();
		await fireEvent.click(screen.getByLabelText('IP Address'));
		expect(screen.queryByRole('columnheader', { name: /^IP/ })).toBeNull();
	});
});
