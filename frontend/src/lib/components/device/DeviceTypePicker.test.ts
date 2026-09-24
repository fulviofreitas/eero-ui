import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DeviceTypePicker from './DeviceTypePicker.svelte';
import { devicesStore } from '$stores';

describe('DeviceTypePicker', () => {
	beforeEach(() => {
		devicesStore.clear();
	});

	it('shows the current device type on the trigger', () => {
		render(DeviceTypePicker, {
			props: { deviceType: 'phone', changing: false, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: /Phone/ })).toBeInTheDocument();
	});

	it('falls back to "Not set" when no type is assigned', () => {
		render(DeviceTypePicker, {
			props: { deviceType: null, changing: false, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: /Not set/ })).toBeInTheDocument();
	});

	it('calls onSelect with the chosen device type from the static catalogue', async () => {
		const onSelect = vi.fn();
		render(DeviceTypePicker, {
			props: { deviceType: null, changing: false, onSelect }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Not set/ }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Tablet' }));
		expect(onSelect).toHaveBeenCalledWith('tablet');
	});

	it('validates and submits a custom device type matching the allowed pattern', async () => {
		const onSelect = vi.fn();
		render(DeviceTypePicker, {
			props: { deviceType: null, changing: false, onSelect }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Not set/ }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Custom…' }));

		const input = screen.getByLabelText('Custom device type');
		await fireEvent.input(input, { target: { value: 'Smart_Speaker' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(onSelect).toHaveBeenCalledWith('smart_speaker');
	});

	it('rejects a custom device type that fails the pattern without calling onSelect', async () => {
		const onSelect = vi.fn();
		render(DeviceTypePicker, {
			props: { deviceType: null, changing: false, onSelect }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Not set/ }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Custom…' }));

		const input = screen.getByLabelText('Custom device type');
		await fireEvent.input(input, { target: { value: 'not valid!' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(onSelect).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toBeInTheDocument();
	});

	it('disables the trigger while changing', () => {
		render(DeviceTypePicker, {
			props: { deviceType: 'phone', changing: true, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: /Updating…/ })).toBeDisabled();
	});
});
