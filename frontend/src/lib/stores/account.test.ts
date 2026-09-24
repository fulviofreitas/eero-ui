/**
 * Tests for the account store (phase-6.0-revamp.md § 7 WP7, family 9).
 *
 * Coverage:
 * - setName re-checks auth status on success
 * - setConsents records the requested value locally (no read-back exists)
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

	it('setConsents records the requested value locally', async () => {
		expect(get(accountStore).marketingEmailsConsent).toBeNull();

		await accountStore.setConsents(true);

		expect(get(accountStore).marketingEmailsConsent).toBe(true);
		expect(get(accountStore).applying).toBe(false);
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
		await accountStore.setConsents(true);
		expect(get(accountStore).marketingEmailsConsent).toBe(true);

		accountStore.clear();

		expect(get(accountStore).marketingEmailsConsent).toBeNull();
		expect(get(accountStore).emailChangePending).toBe(false);
	});
});
