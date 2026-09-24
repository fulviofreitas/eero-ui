/**
 * Tests for GuestPasswordCard (phase-6.0-revamp.md § 7 WP6, deliverable 2).
 *
 * Coverage:
 * - shows has_password status once loaded
 * - Generate fills the password field with a 16-character value
 * - Set Password goes through ConfirmDialog before any PUT fires
 * - Clear is disabled when no password is set
 * - the submitted password is never rendered back to the page
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import GuestPasswordCard from './GuestPasswordCard.svelte';
import { guestPasswordStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

async function renderLoaded(hasPassword = false) {
	server.use(
		http.get('/api/networks/:networkId/guest', () =>
			HttpResponse.json({ enabled: true, name: 'Guest', has_password: hasPassword })
		)
	);
	const utils = render(GuestPasswordCard, { props: { networkId: 'network-123' } });
	await waitFor(() =>
		expect(
			screen.getByText(hasPassword ? 'Password is set' : 'No password set (open network)')
		).toBeInTheDocument()
	);
	return utils;
}

describe('GuestPasswordCard', () => {
	beforeEach(() => {
		guestPasswordStore.clear();
		uiStore.closeConfirm();
	});

	it('shows "No password set" when has_password is false', async () => {
		await renderLoaded(false);
		expect(screen.getByText('No password set (open network)')).toBeInTheDocument();
	});

	it('shows "Password is set" when has_password is true', async () => {
		await renderLoaded(true);
		expect(screen.getByText('Password is set')).toBeInTheDocument();
	});

	it('Generate fills the input with a 16-character password', async () => {
		await renderLoaded(false);
		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

		const input = screen.getByPlaceholderText(/new password/i) as HTMLInputElement;
		expect(input.value).toHaveLength(16);
	});

	it('does not fire a PUT until the confirmation is acknowledged', async () => {
		await renderLoaded(false);

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/guest/password', () => {
				putCalls++;
				return HttpResponse.json({
					success: true,
					guest_network: { enabled: true, name: 'Guest', has_password: true }
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

		expect(get(confirmDialog)).not.toBeNull();
		expect(putCalls).toBe(0);
	});

	it('never renders the submitted password back onto the page', async () => {
		await renderLoaded(false);
		server.use(
			http.put('/api/networks/:networkId/guest/password', () =>
				HttpResponse.json({
					success: true,
					guest_network: { enabled: true, name: 'Guest', has_password: true }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
		const input = screen.getByPlaceholderText(/new password/i) as HTMLInputElement;
		const generated = input.value;

		await fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByText('Password is set')).toBeInTheDocument());
		expect(screen.queryByDisplayValue(generated)).not.toBeInTheDocument();
		expect(screen.queryByText(generated)).not.toBeInTheDocument();
	});

	it('disables Clear when no password is set', async () => {
		await renderLoaded(false);
		expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
	});

	it('Clear is enabled when a password is set and goes through ConfirmDialog', async () => {
		await renderLoaded(true);
		const clearButton = screen.getByRole('button', { name: 'Clear' });
		expect(clearButton).not.toBeDisabled();

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/guest/password', () => {
				deleteCalls++;
				return HttpResponse.json({
					success: true,
					guest_network: { enabled: true, name: 'Guest', has_password: false }
				});
			})
		);

		await fireEvent.click(clearButton);
		expect(get(confirmDialog)).not.toBeNull();
		expect(deleteCalls).toBe(0);
	});
});
