import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Modal from './Modal.svelte';

function textSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

describe('Modal', () => {
	it('renders nothing when closed', () => {
		render(Modal, {
			props: { open: false, title: 'Rename', onClose: () => {}, children: textSnippet('<p>x</p>') }
		});
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders the dialog with title and children when open', () => {
		render(Modal, {
			props: {
				open: true,
				title: 'Rename Network',
				onClose: () => {},
				children: textSnippet('<input />')
			}
		});
		expect(screen.getByRole('dialog', { name: 'Rename Network' })).toBeInTheDocument();
	});

	it('calls onClose on Escape', async () => {
		const onClose = vi.fn();
		render(Modal, {
			props: { open: true, title: 'Rename', onClose, children: textSnippet('<p>x</p>') }
		});
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});
});
