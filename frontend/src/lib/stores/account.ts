/**
 * Account Store
 *
 * Account-profile writes (phase-6.0-revamp.md § 7 WP7, family 9): display
 * name, marketing-email consent, and the two-step e-mail/phone change flow.
 * Every write here is unverified, non-settings (plan § 5) - pessimistic,
 * gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side, never retried
 * (`client.ts` passes `retries: 0`). Errors are never swallowed here - they
 * propagate to the caller (the card component), which decides how to
 * surface them (a `account_identity_disabled` note vs. a plain error toast).
 *
 * There is no `fetch()` - the account's current name/email/phone/role come
 * from `authStore.checkStatus()` (`/auth/status`), which every write below
 * re-runs on success so the displayed value reflects the read-back.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { SmsCountriesResponse } from '$api/types';
import { authStore } from './auth';

interface AccountState {
	/** True while any account write is in flight - pessimistic, one at a time. */
	applying: boolean;
	/** True once `setEmail`/`setPhone` succeeded and the code-entry step should show. */
	emailChangePending: boolean;
	phoneChangePending: boolean;
	smsCountries: SmsCountriesResponse['countries'];
	smsCountriesLoading: boolean;
	/**
	 * `null` until this session sets it - there is no `GET` for the
	 * account's current consent value (`account.py` exposes only the
	 * write), so this reflects "what we last told the server", not a
	 * verified read-back.
	 */
	marketingEmailsConsent: boolean | null;
}

const initialState: AccountState = {
	applying: false,
	emailChangePending: false,
	phoneChangePending: false,
	smsCountries: [],
	smsCountriesLoading: false,
	marketingEmailsConsent: null
};

function createAccountStore() {
	const { subscribe, set, update } = writable<AccountState>(initialState);

	return {
		subscribe,

		/** Set the account's display name. Pessimistic - re-checks auth status on success. */
		async setName(name: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.setName(name);
				await authStore.checkStatus();
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Set the account's marketing-email consent. Pessimistic - there is
		 * no read-back available (see `marketingEmailsConsent` doc), so the
		 * requested value is recorded locally only after the write itself
		 * succeeds.
		 */
		async setConsents(marketingEmails: boolean): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.setConsents(marketingEmails);
				update((s) => ({ ...s, marketingEmailsConsent: marketingEmails }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/**
		 * Start an e-mail change. On success, flips `emailChangePending` so
		 * the card shows the code-entry step - it does NOT re-check auth
		 * status yet, since the change is inactive until verified.
		 */
		async requestEmailChange(email: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.setEmail(email);
				update((s) => ({ ...s, emailChangePending: true }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Confirm a pending e-mail change. Pessimistic - re-checks auth status on success. */
		async verifyEmailChange(code: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.verifyEmail(code);
				update((s) => ({ ...s, emailChangePending: false }));
				await authStore.checkStatus();
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Cancel the pending e-mail change locally (does not undo the pending server-side change). */
		cancelEmailChange(): void {
			update((s) => ({ ...s, emailChangePending: false }));
		},

		/** Start a phone-number change. Same two-step shape as `requestEmailChange`. */
		async requestPhoneChange(phone: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.setPhone(phone);
				update((s) => ({ ...s, phoneChangePending: true }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Confirm a pending phone-number change. Pessimistic - re-checks auth status on success. */
		async verifyPhoneChange(code: string): Promise<void> {
			update((s) => ({ ...s, applying: true }));
			try {
				await api.account.verifyPhone(code);
				update((s) => ({ ...s, phoneChangePending: false }));
				await authStore.checkStatus();
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Cancel the pending phone change locally. */
		cancelPhoneChange(): void {
			update((s) => ({ ...s, phoneChangePending: false }));
		},

		/** Fetch the SMS country-code catalogue for the phone country picker. Never throws. */
		async fetchSmsCountries(): Promise<void> {
			update((s) => ({ ...s, smsCountriesLoading: true }));
			try {
				const result = await api.account.getSmsCountries();
				update((s) => ({ ...s, smsCountries: result.countries, smsCountriesLoading: false }));
			} catch {
				update((s) => ({ ...s, smsCountriesLoading: false }));
			}
		},

		/** Clear store (e.g. on logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const accountStore = createAccountStore();
