/**
 * Tests for ConfirmDialog.svelte (plan § 8.2, WP5 A5).
 *
 * `details[]` rendering, Escape-to-cancel, and focus trap/restore (via the shared
 * `trapFocus` action - see focusTrap.ts) are all covered as real assertions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ConfirmDialog from './ConfirmDialog.svelte';
import { uiStore } from '$stores';

describe('ConfirmDialog', () => {
	beforeEach(() => {
		uiStore.closeConfirm();
	});

	it('renders nothing when no dialog is queued', () => {
		render(ConfirmDialog);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders title, message and details[] as list items when opened via uiStore.confirm', async () => {
		render(ConfirmDialog);

		uiStore.confirm({
			title: 'Block Device',
			message: 'Are you sure you want to block "iPhone"?',
			details: ['This is not verified end-to-end.', 'Confirm the device shows as blocked.'],
			onConfirm: async () => {}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		expect(screen.getByText('Block Device')).toBeInTheDocument();
		expect(screen.getByText('Are you sure you want to block "iPhone"?')).toBeInTheDocument();

		const items = screen.getAllByRole('listitem');
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent('This is not verified end-to-end.');
		expect(items[1]).toHaveTextContent('Confirm the device shows as blocked.');
	});

	it('renders no details list when details is omitted', async () => {
		render(ConfirmDialog);

		uiStore.confirm({
			title: 'Reboot eero',
			message: 'This will disconnect every device briefly.',
			onConfirm: async () => {}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		expect(screen.queryByRole('listitem')).toBeNull();
	});

	it('Escape cancels and closes the dialog without invoking onConfirm', async () => {
		render(ConfirmDialog);
		let confirmed = false;

		uiStore.confirm({
			title: 'Delete Profile',
			message: 'This cannot be undone.',
			onConfirm: async () => {
				confirmed = true;
			}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

		await fireEvent.keyDown(window, { key: 'Escape' });

		// Asserted against the store rather than DOM removal: the modal
		// unmounts through a `transition:fade`/`scale` outro, whose real
		// completion timing (jsdom has no native Web Animations API - see
		// `tests/setup.ts`'s polyfill) is an animation-implementation detail,
		// not the behaviour this test is chartered to check.
		await waitFor(() => expect(get(uiStore).confirmDialog).toBeNull());
		expect(confirmed).toBe(false);
	});

	it('clicking Cancel closes without invoking onConfirm', async () => {
		render(ConfirmDialog);
		let confirmed = false;

		uiStore.confirm({
			title: 'Delete Profile',
			message: 'This cannot be undone.',
			onConfirm: async () => {
				confirmed = true;
			}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(get(uiStore).confirmDialog).toBeNull());
		expect(confirmed).toBe(false);
	});

	it('clicking Confirm invokes onConfirm and then closes', async () => {
		render(ConfirmDialog);
		let confirmed = false;

		uiStore.confirm({
			title: 'Reboot eero',
			message: 'This will disconnect every device briefly.',
			confirmText: 'Reboot',
			onConfirm: async () => {
				confirmed = true;
			}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Reboot' }));

		await waitFor(() => expect(get(uiStore).confirmDialog).toBeNull());
		expect(confirmed).toBe(true);
	});

	it('focus moves into the dialog when it opens', async () => {
		render(ConfirmDialog);
		const trigger = document.createElement('button');
		trigger.textContent = 'Open';
		document.body.appendChild(trigger);
		trigger.focus();
		expect(trigger).toHaveFocus();

		uiStore.confirm({
			title: 'Delete Profile',
			message: 'This cannot be undone.',
			onConfirm: async () => {}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		// First focusable inside the dialog is the Cancel button.
		await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());

		trigger.remove();
	});

	it('focus restores to the triggering element when the dialog closes', async () => {
		render(ConfirmDialog);
		const trigger = document.createElement('button');
		trigger.textContent = 'Open';
		document.body.appendChild(trigger);
		trigger.focus();

		uiStore.confirm({
			title: 'Delete Profile',
			message: 'This cannot be undone.',
			onConfirm: async () => {}
		});

		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(get(uiStore).confirmDialog).toBeNull());
		await waitFor(() => expect(trigger).toHaveFocus());

		trigger.remove();
	});
});
