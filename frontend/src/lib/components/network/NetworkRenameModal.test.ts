import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import NetworkRenameModal from './NetworkRenameModal.svelte';

describe('NetworkRenameModal', () => {
	it('renders nothing when closed', () => {
		render(NetworkRenameModal, {
			props: {
				open: false,
				value: '',
				submitting: false,
				onClose: () => {},
				onSubmit: () => {},
				onValueChange: () => {}
			}
		});
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('submits the trimmed value on Save', async () => {
		const onSubmit = vi.fn();
		render(NetworkRenameModal, {
			props: {
				open: true,
				value: 'My Network',
				submitting: false,
				onClose: () => {},
				onSubmit,
				onValueChange: () => {}
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onSubmit).toHaveBeenCalledWith('My Network');
	});

	it('disables Save while empty or submitting', () => {
		render(NetworkRenameModal, {
			props: {
				open: true,
				value: '',
				submitting: false,
				onClose: () => {},
				onSubmit: () => {},
				onValueChange: () => {}
			}
		});
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});
});
