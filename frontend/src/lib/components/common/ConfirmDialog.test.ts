/**
 * Tests for ConfirmDialog.svelte (plan § 8.2).
 *
 * `details[]` rendering and Escape-to-cancel are implemented today and
 * covered as real assertions. Focus trap and focus restore are NOT
 * implemented yet - ConfirmDialog.svelte has no `tabindex` on its dialog
 * `<div>` and no focus-management logic at all (WP9 / Tier 3 scope per plan
 * § 6.2: "Native `<dialog>` with focus trap and focus restore"). Those two
 * are written as `it.todo` with the reason rather than skipped silently, so
 * this file stops being a false green the moment WP9 lands the real
 * behaviour and someone runs `grep -r 'it.todo' ConfirmDialog.test.ts`.
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

	// PRODUCT BUG: not implemented. ConfirmDialog.svelte's dialog <div> carries
	// no tabindex and no focus-management effect, so focus stays wherever it
	// was on the page (typically the trigger button) instead of moving into
	// the dialog. WP9 / Tier 3 (plan § 6.2) is scoped to fix this with a
	// native <dialog> element.
	it.todo(
		'focus moves into the dialog when it opens (blocked on WP9 - ConfirmDialog has no focus-management logic yet)'
	);

	// PRODUCT BUG: not implemented, same root cause as above - there is no
	// code path that remembers `document.activeElement` before opening or
	// restores it on close.
	it.todo(
		'focus restores to the triggering element when the dialog closes (blocked on WP9 - same gap as focus trap)'
	);
});
