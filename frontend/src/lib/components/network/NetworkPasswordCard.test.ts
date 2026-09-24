/**
 * Tests for NetworkPasswordCard (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 12: network Wi-Fi password set/clear).
 *
 * Coverage:
 * - Generate fills the password field with a 16-character value
 * - Set Password goes through ConfirmDialog before any PUT fires, and the
 *   submitted password is never rendered back
 * - Clear is disabled until the "opens the network" checkbox is acknowledged
 * - Clear goes through ConfirmDialog carrying the "network becomes OPEN"
 *   wording
 * - a 422 response on Set surfaces inline, not as a toast
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import NetworkPasswordCard from './NetworkPasswordCard.svelte';
import { networkPasswordStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

describe('NetworkPasswordCard', () => {
	beforeEach(() => {
		networkPasswordStore.clear();
		uiStore.closeConfirm();
	});

	it('Generate fills the input with a 16-character password', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

		const input = screen.getByPlaceholderText(/new password/i) as HTMLInputElement;
		expect(input.value).toHaveLength(16);
	});

	it('does not fire a PUT until the confirmation is acknowledged', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/password', () => {
				putCalls++;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: false,
					disconnects_clients: true,
					open_network: false
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

		expect(get(confirmDialog)).not.toBeNull();
		expect(putCalls).toBe(0);
	});

	it('never renders the submitted password back onto the page and shows the reconnect note', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });
		server.use(
			http.put('/api/networks/:networkId/password', () =>
				HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: false,
					disconnects_clients: true,
					open_network: false
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
		const input = screen.getByPlaceholderText(/new password/i) as HTMLInputElement;
		const generated = input.value;

		await fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByText(/clients will reconnect/i)).toBeInTheDocument());
		expect(screen.queryByDisplayValue(generated)).not.toBeInTheDocument();
		expect(screen.queryByText(generated)).not.toBeInTheDocument();
	});

	it('disables Clear until the open-network acknowledgement checkbox is checked', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });
		expect(screen.getByRole('button', { name: 'Clear Password' })).toBeDisabled();

		await fireEvent.click(screen.getByRole('checkbox'));
		expect(screen.getByRole('button', { name: 'Clear Password' })).not.toBeDisabled();
	});

	it('Clear goes through ConfirmDialog carrying "network becomes OPEN" wording', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });
		await fireEvent.click(screen.getByRole('checkbox'));

		let deleteCalls = 0;
		server.use(
			http.delete('/api/networks/:networkId/password', () => {
				deleteCalls++;
				return HttpResponse.json({
					success: true,
					changed: true,
					reboot_expected: false,
					disconnects_clients: true,
					open_network: true
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Clear Password' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.danger).toBe(true);
		expect(dialog!.message).toMatch(/network becomes OPEN/i);
		expect(deleteCalls).toBe(0);

		await dialog!.onConfirm();
		expect(deleteCalls).toBe(1);
	});

	it('surfaces a 422 validation response inline on Set', async () => {
		render(NetworkPasswordCard, { props: { networkId: 'network-123' } });
		server.use(
			http.put('/api/networks/:networkId/password', () =>
				HttpResponse.json(
					{ detail: 'password must be 8-63 printable ASCII characters.' },
					{ status: 422 }
				)
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		expect(
			await screen.findByText(/password must be 8-63 printable ascii characters/i)
		).toBeInTheDocument();
	});
});
