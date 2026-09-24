/**
 * Authentication Store
 *
 * Manages authentication state and login flow.
 */

import { writable, derived } from 'svelte/store';
import { api, ApiClientError } from '$api/client';

// ============================================
// Types
// ============================================

interface AuthState {
	authenticated: boolean;
	/**
	 * Why the session is not authenticated: `"expired"` when a previously
	 * valid token was rejected by the eero cloud, `"none"` when no session
	 * was ever established, `null` while authenticated. Lets the login page
	 * show "your session expired" instead of the bare login form (plan § 4.1).
	 */
	reason: 'none' | 'expired' | null;
	userEmail: string | null;
	userName: string | null;
	userPhone: string | null;
	userRole: string | null;
	accountId: string | null;
	premiumStatus: string | null;
	loading: boolean;
	error: string | null;
	loginPending: boolean; // Waiting for verification code
}

// ============================================
// Store
// ============================================

const initialState: AuthState = {
	authenticated: false,
	reason: null,
	userEmail: null,
	userName: null,
	userPhone: null,
	userRole: null,
	accountId: null,
	premiumStatus: null,
	loading: true,
	error: null,
	loginPending: false
};

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,

		/**
		 * Check current authentication status
		 */
		async checkStatus(): Promise<boolean> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const status = await api.auth.status();
				update((s) => ({
					...s,
					authenticated: status.authenticated,
					reason: status.authenticated ? null : status.reason,
					userEmail: status.user_email,
					userName: status.user_name,
					userPhone: status.user_phone,
					userRole: status.user_role,
					accountId: status.account_id,
					premiumStatus: status.premium_status,
					loading: false,
					loginPending: false
				}));
				return status.authenticated;
			} catch (error) {
				update((s) => ({
					...s,
					authenticated: false,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to check auth status'
				}));
				return false;
			}
		},

		/**
		 * Start login flow - sends verification code
		 */
		async login(identifier: string): Promise<boolean> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const response = await api.auth.login(identifier);
				if (response.success) {
					update((s) => ({
						...s,
						loading: false,
						loginPending: true
					}));
					return true;
				} else {
					update((s) => ({
						...s,
						loading: false,
						error: response.message
					}));
					return false;
				}
			} catch (error) {
				const message =
					error instanceof ApiClientError ? error.detail : 'Login failed. Please try again.';
				update((s) => ({
					...s,
					loading: false,
					error: message
				}));
				return false;
			}
		},

		/**
		 * Verify login with OTP code
		 */
		async verify(code: string): Promise<boolean> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const response = await api.auth.verify(code);
				if (response.success) {
					update((s) => ({
						...s,
						authenticated: true,
						reason: null,
						loading: false,
						loginPending: false
					}));
					// Fetch full user info after successful verification
					await this.checkStatus();
					return true;
				} else {
					update((s) => ({
						...s,
						loading: false,
						error: response.message
					}));
					return false;
				}
			} catch (error) {
				const message =
					error instanceof ApiClientError ? error.detail : 'Verification failed. Please try again.';
				update((s) => ({
					...s,
					loading: false,
					error: message
				}));
				return false;
			}
		},

		/**
		 * Log out
		 */
		async logout(): Promise<void> {
			update((s) => ({ ...s, loading: true }));

			try {
				await api.auth.logout();
			} catch {
				// Continue with local logout even if API fails
			}

			set({
				...initialState,
				loading: false
			});
		},

		/**
		 * Clear error
		 */
		clearError(): void {
			update((s) => ({ ...s, error: null }));
		},

		/**
		 * Set the unauthenticated `reason` immediately, ahead of the
		 * `checkStatus()` round trip the `auth:unauthorized` listener always
		 * follows up with. Purely a UX optimization - `checkStatus()` is the
		 * source of truth and overwrites this once it resolves.
		 */
		setReason(reason: 'none' | 'expired' | null): void {
			update((s) => ({ ...s, authenticated: false, reason }));
		},

		/**
		 * Cancel login (go back from verification)
		 */
		cancelLogin(): void {
			update((s) => ({ ...s, loginPending: false, error: null }));
		}
	};
}

export const authStore = createAuthStore();

// Derived stores
export const isAuthenticated = derived(authStore, ($auth) => $auth.authenticated);
export const isAuthLoading = derived(authStore, ($auth) => $auth.loading);
export const authError = derived(authStore, ($auth) => $auth.error);
export const isLoginPending = derived(authStore, ($auth) => $auth.loginPending);
export const userEmail = derived(authStore, ($auth) => $auth.userEmail);
export const userName = derived(authStore, ($auth) => $auth.userName);
export const userPhone = derived(authStore, ($auth) => $auth.userPhone);
export const userRole = derived(authStore, ($auth) => $auth.userRole);
export const accountId = derived(authStore, ($auth) => $auth.accountId);
export const premiumStatus = derived(authStore, ($auth) => $auth.premiumStatus);
export const authReason = derived(authStore, ($auth) => $auth.reason);

// Listen for 401 events from API client. `checkStatus()` re-probes
// `/auth/status`, which the backend now clears the token before answering
// (plan § 4.1), so this settles once and does not loop: the follow-up
// `/auth/status` truthfully reports `authenticated: false`, never a second
// 401. The layout's existing redirect-when-unauthenticated takes the user to
// `/login`; the login page reads `authReason` to show the "session expired"
// copy instead of a second, indistinguishable bare form.
if (typeof window !== 'undefined') {
	window.addEventListener('auth:unauthorized', (event) => {
		const reason = (event as CustomEvent<{ reason?: 'expired' }>).detail?.reason;
		if (reason === 'expired') {
			authStore.setReason('expired');
		}
		authStore.checkStatus();
	});
}
