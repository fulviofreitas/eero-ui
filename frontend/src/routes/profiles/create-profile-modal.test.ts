/**
 * Tests for the "New Profile" dialog on the profiles page (WP5 reviewer fix R4): it now renders
 * through the Modal primitive instead of a hand-rolled backdrop/card, which gives it a real
 * role="dialog"/aria-modal/aria-labelledby, initial focus, a Tab focus trap, Escape-to-close and
 * focus restore to the trigger button for free (see Modal.svelte + focusTrap.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Page from './+page.svelte';
import { server } from '../../../tests/mocks/server';

describe('profiles page - create profile dialog', () => {
	beforeEach(() => {
		server.resetHandlers();
	});

	async function openCreateDialog() {
		render(Page);
		await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
		const trigger = screen.getByRole('button', { name: '+ New profile' });
		// jsdom, unlike a real browser, does not auto-focus a button on click - focus it
		// explicitly so the opener-capture effect has something real to restore later.
		trigger.focus();
		await fireEvent.click(trigger);
		await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
		return trigger;
	}

	it('opens as a labelled dialog with focus moved to the name field', async () => {
		await openCreateDialog();

		const dialog = screen.getByRole('dialog', { name: 'New Profile' });
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		await waitFor(() => expect(screen.getByLabelText('Profile name')).toHaveFocus());
	});

	it('Escape closes the dialog and restores focus to the trigger button', async () => {
		const trigger = await openCreateDialog();

		await fireEvent.keyDown(window, { key: 'Escape' });

		// Focus restore is keyed off the `open` prop, not off the dialog unmounting (which only
		// happens after the close transition's outro finishes - see focusTrap.ts).
		await waitFor(() => expect(trigger).toHaveFocus());
	});
});
