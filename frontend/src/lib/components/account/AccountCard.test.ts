/**
 * Tests for AccountCard (phase-6.0-revamp.md § 7 WP7, family 9).
 *
 * Coverage:
 * - renders the current account info from authStore
 * - gate-off hides the name/consent/email/phone controls
 * - gate-on: setting the name goes through ConfirmDialog naming "not
 *   verified end-to-end" before any PUT fires
 * - a successful name confirmation succeeds
 * - requesting an e-mail change shows the identity-specific detail and,
 *   on success, the code-entry step
 * - a 403 account_identity_disabled response on the e-mail change renders
 *   the dedicated note naming EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES
 * - a plain failure surfaces an error toast instead of the identity note
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import AccountCard from './AccountCard.svelte';
import { accountStore, authStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

function mockAuthenticated() {
	server.use(
		http.get('/api/auth/status', () =>
			HttpResponse.json({
				authenticated: true,
				reason: null,
				preferred_network_id: 'network-123',
				user_email: 'user@example.com',
				user_name: 'Test User',
				user_phone: '+15551234567',
				user_role: 'owner',
				account_id: 'account-1',
				premium_status: null
			})
		)
	);
}

describe('AccountCard', () => {
	beforeEach(async () => {
		accountStore.clear();
		uiStore.closeConfirm();
		mockAuthenticated();
		await authStore.checkStatus();
	});

	it('renders the current account info from authStore', () => {
		render(AccountCard);

		expect(screen.getByText('Test User')).toBeInTheDocument();
		expect(screen.getByText('user@example.com')).toBeInTheDocument();
		expect(screen.getByText('+15551234567')).toBeInTheDocument();
		expect(screen.getByText('owner')).toBeInTheDocument();
	});

	it('hides the write controls when the experimental-writes gate is off', () => {
		render(AccountCard);

		expect(screen.queryByPlaceholderText('Display name')).not.toBeInTheDocument();
		expect(screen.queryByPlaceholderText('New e-mail address')).not.toBeInTheDocument();
		expect(screen.queryByPlaceholderText('New phone number')).not.toBeInTheDocument();
	});

	describe('with experimental writes enabled', () => {
		// AccountCard's write controls are account-scoped, not per-network,
		// but `ExperimentalGate` still reads the single global
		// `entitlementsStore` (there is no per-account entitlements call) -
		// fetching entitlements for any network id flips the gate open here,
		// same as every other `ExperimentalGate`-gated card's tests.
		async function enableExperimentalWrites() {
			const { entitlementsStore } = await import('$stores');
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({
						features: [],
						upsell_features: [],
						is_premium: null,
						premium_status: null,
						capabilities: [],
						experimental_writes: true
					})
				)
			);
			await entitlementsStore.fetch('network-123');
		}

		it('gate-on: setting the name goes through ConfirmDialog naming "not verified end-to-end"', async () => {
			await enableExperimentalWrites();
			render(AccountCard);

			let putCalls = 0;
			server.use(
				http.put('/api/account/name', () => {
					putCalls++;
					return HttpResponse.json({ success: true });
				})
			);

			const input = screen.getByPlaceholderText('Display name');
			await fireEvent.input(input, { target: { value: 'New Name' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

			const dialog = get(confirmDialog);
			expect(dialog).not.toBeNull();
			expect(dialog!.details).toContain(
				'This action is not verified end-to-end against the eero cloud.'
			);
			expect(putCalls).toBe(0);
		});

		it('a successful name confirmation succeeds', async () => {
			await enableExperimentalWrites();
			render(AccountCard);

			const input = screen.getByPlaceholderText('Display name');
			await fireEvent.input(input, { target: { value: 'New Name' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

			const dialog = get(confirmDialog);
			await dialog!.onConfirm();

			await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'success')).toBe(true));
		});

		it('requesting an e-mail change shows the identity detail and the code-entry step on success', async () => {
			await enableExperimentalWrites();
			render(AccountCard);

			const emailInput = screen.getByPlaceholderText('New e-mail address');
			const emailForm = emailInput.closest('form') as HTMLElement;
			await fireEvent.input(emailInput, { target: { value: 'new@example.com' } });
			await fireEvent.click(within(emailForm).getByRole('button', { name: 'Change e-mail' }));

			const dialog = get(confirmDialog);
			expect(dialog!.details).toContain(
				'This changes the credential eero uses to identify and recover your account.'
			);

			await dialog!.onConfirm();

			await waitFor(() =>
				expect(screen.getByPlaceholderText('Verification code')).toBeInTheDocument()
			);
		});

		it('renders the account-identity note on a 403 account_identity_disabled response', async () => {
			await enableExperimentalWrites();
			server.use(
				http.put('/api/account/email', () =>
					HttpResponse.json(
						{ detail: 'This write is disabled.', type: 'account_identity_disabled' },
						{ status: 403 }
					)
				)
			);

			render(AccountCard);

			const emailInput = screen.getByPlaceholderText('New e-mail address');
			const emailForm = emailInput.closest('form') as HTMLElement;
			await fireEvent.input(emailInput, { target: { value: 'new@example.com' } });
			await fireEvent.click(within(emailForm).getByRole('button', { name: 'Change e-mail' }));

			const dialog = get(confirmDialog);
			await dialog!.onConfirm();

			await waitFor(() =>
				expect(
					screen.getAllByText(/EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES/).length
				).toBeGreaterThan(0)
			);
		});

		it('surfaces a plain failure as an error toast, not the identity note', async () => {
			await enableExperimentalWrites();
			server.use(
				http.put('/api/account/email', () => HttpResponse.json({ detail: 'boom' }, { status: 500 }))
			);

			render(AccountCard);

			const emailInput = screen.getByPlaceholderText('New e-mail address');
			const emailForm = emailInput.closest('form') as HTMLElement;
			await fireEvent.input(emailInput, { target: { value: 'new@example.com' } });
			await fireEvent.click(within(emailForm).getByRole('button', { name: 'Change e-mail' }));

			const dialog = get(confirmDialog);
			await dialog!.onConfirm();

			await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
			expect(screen.queryAllByText(/EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES/)).toHaveLength(0);
		});
	});
});
