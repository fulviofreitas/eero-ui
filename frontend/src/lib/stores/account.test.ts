/**
 * Tests for the account store (phase-6.0-revamp.md § 7 WP7, family 9).
 *
 * Coverage:
 * - setName re-checks auth status on success
 * - setConsents re-checks auth status on success (read-back value, not the
 *   requested value) and rethrows without re-checking on failure
 * - requestEmailChange flips emailChangePending; verifyEmailChange clears it
 *   and re-checks auth status
 * - requestPhoneChange/verifyPhoneChange follow the same two-step shape
 * - cancelEmailChange/cancelPhoneChange clear the pending flag locally
 * - fetchSmsCountries loads the catalogue and never throws
 * - a 403 account_identity_disabled response surfaces as a rejected promise
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { accountStore } from './account';
import { authStore } from './auth';
import { server } from '../../../tests/mocks/server';

describe('accountStore', () => {
	beforeEach(() => {
		accountStore.clear();
		authStore.logout().catch(() => undefined);
	});

	it('setName re-checks auth status on success', async () => {
		server.use(
			http.get('/api/auth/status', () =>
				HttpResponse.json({
					authenticated: true,
					reason: null,
					preferred_network_id: 'network-123',
					user_email: 'user@example.com',
					user_name: 'New Name',
					user_phone: null,
					user_role: 'owner',
					account_id: 'account-1',
					premium_status: null
				})
			)
		);

		await accountStore.setName('New Name');

		expect(get(accountStore).applying).toBe(false);
		expect(get(authStore).userName).toBe('New Name');
	});

	it('setConsents calls PUT /api/account/consents then re-fetches /api/auth/status', async () => {
		let putBody: unknown = null;
		server.use(
			http.put('/api/account/consents', async ({ request }) => {
				putBody = await request.json();
				return HttpResponse.json({ success: true });
			}),
			http.get('/api/auth/status', () =>
				HttpResponse.json({
					authenticated: true,
					reason: null,
					preferred_network_id: 'network-123',
					user_email: 'user@example.com',
					user_name: 'User',
					user_phone: null,
					user_role: 'owner',
					account_id: 'account-1',
					premium_status: null,
					// Read-back value differs from the request on purpose - asserts the
					// store reflects what the eero cloud reports, not what was sent.
					marketing_emails_consent: false
				})
			)
		);

		await accountStore.setConsents(true);

		expect(putBody).toEqual({ marketing_emails: true });
		expect(get(authStore).marketingEmailsConsent).toBe(false);
		expect(get(accountStore).applying).toBe(false);
	});

	it('setConsents leaves state and rethrows on failure', async () => {
		server.use(
			http.put('/api/account/consents', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await expect(accountStore.setConsents(true)).rejects.toThrow();
		expect(get(accountStore).applying).toBe(false);
		expect(get(authStore).marketingEmailsConsent).toBeNull();
	});

	describe('email change', () => {
		it('flips emailChangePending on requestEmailChange, clears it on verifyEmailChange', async () => {
			await accountStore.requestEmailChange('new@example.com');
			expect(get(accountStore).emailChangePending).toBe(true);

			await accountStore.verifyEmailChange('123456');
			expect(get(accountStore).emailChangePending).toBe(false);
		});

		it('cancelEmailChange clears the pending flag locally', async () => {
			await accountStore.requestEmailChange('new@example.com');
			expect(get(accountStore).emailChangePending).toBe(true);

			accountStore.cancelEmailChange();
			expect(get(accountStore).emailChangePending).toBe(false);
		});

		it('surfaces a 403 account_identity_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/account/email', () =>
					HttpResponse.json(
						{
							detail: 'This write is disabled.',
							type: 'account_identity_disabled'
						},
						{ status: 403 }
					)
				)
			);

			await expect(accountStore.requestEmailChange('new@example.com')).rejects.toThrow();
			expect(get(accountStore).applying).toBe(false);
			expect(get(accountStore).emailChangePending).toBe(false);
		});
	});

	describe('phone change', () => {
		it('flips phoneChangePending on requestPhoneChange, clears it on verifyPhoneChange', async () => {
			await accountStore.requestPhoneChange('+15551234567');
			expect(get(accountStore).phoneChangePending).toBe(true);

			await accountStore.verifyPhoneChange('123456');
			expect(get(accountStore).phoneChangePending).toBe(false);
		});

		it('cancelPhoneChange clears the pending flag locally', async () => {
			await accountStore.requestPhoneChange('+15551234567');
			expect(get(accountStore).phoneChangePending).toBe(true);

			accountStore.cancelPhoneChange();
			expect(get(accountStore).phoneChangePending).toBe(false);
		});
	});

	describe('fetchSmsCountries', () => {
		it('loads the country catalogue', async () => {
			await accountStore.fetchSmsCountries();

			const state = get(accountStore);
			expect(state.smsCountries.length).toBeGreaterThan(0);
			expect(state.smsCountriesLoading).toBe(false);
		});

		it('never throws on failure', async () => {
			server.use(
				http.get('/api/account/sms-countries', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await expect(accountStore.fetchSmsCountries()).resolves.toBeUndefined();
			expect(get(accountStore).smsCountriesLoading).toBe(false);
		});
	});

	it('clear resets to the initial state', async () => {
		await accountStore.requestEmailChange('new@example.com');
		expect(get(accountStore).emailChangePending).toBe(true);

		accountStore.clear();

		expect(get(accountStore).emailChangePending).toBe(false);
		expect(get(accountStore).applying).toBe(false);
	});
});
