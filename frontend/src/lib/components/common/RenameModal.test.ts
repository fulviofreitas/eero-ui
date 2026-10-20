import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RenameModal from './RenameModal.svelte';

function props(overrides: Record<string, unknown> = {}) {
	return {
		open: true,
		title: 'Rename Network',
		initialValue: 'My Network',
		onClose: () => {},
		onSubmit: () => {},
		...overrides
	};
}

describe('RenameModal', () => {
	it('renders nothing when closed', () => {
		render(RenameModal, { props: props({ open: false }) });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens titled, with the field pre-filled from initialValue', () => {
		render(RenameModal, { props: props({ label: 'Location' }) });
		expect(screen.getByRole('dialog', { name: 'Rename Network' })).toBeInTheDocument();
		expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('My Network');
	});

	it('submits the trimmed value on Save', async () => {
		const onSubmit = vi.fn();
		render(RenameModal, { props: props({ onSubmit }) });

		await fireEvent.input(screen.getByLabelText('New name'), {
			target: { value: '  Home  ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(onSubmit).toHaveBeenCalledWith('Home');
	});

	it('disables Save while the field is blank', async () => {
		render(RenameModal, { props: props() });
		await fireEvent.input(screen.getByLabelText('New name'), { target: { value: '   ' } });
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('Cancel calls onClose without submitting', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn();
		render(RenameModal, { props: props({ onClose, onSubmit }) });

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('discards an abandoned edit when reopened', async () => {
		const { rerender } = render(RenameModal, { props: props() });
		await fireEvent.input(screen.getByLabelText('New name'), { target: { value: 'Draft' } });

		await rerender(props({ open: false }));
		await rerender(props({ open: true }));

		expect((screen.getByLabelText('New name') as HTMLInputElement).value).toBe('My Network');
	});
});
