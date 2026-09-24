import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DeviceProfileSelector from './DeviceProfileSelector.svelte';

const profiles = [
	{
		id: 'p1',
		url: null,
		name: 'Kids',
		device_count: 2,
		paused: false,
		device_ids: [],
		devices: []
	},
	{
		id: 'p2',
		url: null,
		name: 'Guests',
		device_count: 1,
		paused: false,
		device_ids: [],
		devices: []
	}
];

describe('DeviceProfileSelector', () => {
	it('shows the current profile name on the trigger', () => {
		render(DeviceProfileSelector, {
			props: {
				profileName: 'Kids',
				profileId: 'p1',
				profiles,
				loadingProfiles: false,
				changingProfile: false,
				onSelect: () => {}
			}
		});
		expect(screen.getByRole('button', { name: /Kids/ })).toBeInTheDocument();
	});

	it('falls back to "No Profile" when unassigned', () => {
		render(DeviceProfileSelector, {
			props: {
				profileName: null,
				profileId: null,
				profiles,
				loadingProfiles: false,
				changingProfile: false,
				onSelect: () => {}
			}
		});
		expect(screen.getByRole('button', { name: /No Profile/ })).toBeInTheDocument();
	});

	it('calls onSelect with the chosen profile id and name', async () => {
		const onSelect = vi.fn();
		render(DeviceProfileSelector, {
			props: {
				profileName: 'No Profile',
				profileId: null,
				profiles,
				loadingProfiles: false,
				changingProfile: false,
				onSelect
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: /No Profile/ }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Kids' }));
		expect(onSelect).toHaveBeenCalledWith('p1', 'Kids');
	});

	it('renders the profile link only when a profile is assigned', () => {
		render(DeviceProfileSelector, {
			props: {
				profileName: 'Kids',
				profileId: 'p1',
				profiles,
				loadingProfiles: false,
				changingProfile: false,
				onSelect: () => {}
			}
		});
		expect(screen.getByRole('link', { name: /View profile details/ })).toHaveAttribute(
			'href',
			'/profiles/p1'
		);
	});
});
