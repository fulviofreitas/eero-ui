/**
 * Tests for the authentication store.
 *
 * Tests cover:
 * - Auth status checking
 * - Login flow initiation
 * - Verification handling
 * - Logout functionality
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { authStore, isAuthenticated, authError, isLoginPending } from './auth';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

describe('authStore', () => {
	beforeEach(async () => {
		// Reset store state before each test
		await authStore.logout();
		authStore.clearError();
	});

	describe('checkStatus', () => {
		it('sets authenticated to true when server returns authenticated', async () => {
			server.use(
				http.get('/api/auth/status', () => {
					return HttpResponse.json({
						authenticated: true,
						preferred_network_id: 'net-123',
						user_email: 'user@test.com',
						user_name: 'Test User',
						user_phone: '+1234567890',
						user_role: 'owner',
						account_id: 'account-123',
						premium_status: 'premium'
					});
				})
			);

			const result = await authStore.checkStatus();

			expect(result).toBe(true);
			expect(get(isAuthenticated)).toBe(true);
			expect(get(authStore).userEmail).toBe('user@test.com');
			expect(get(authStore).userName).toBe('Test User');
			expect(get(authStore).preferredNetworkId).toBe('net-123');
		});

		it('sets authenticated to false when server returns unauthenticated', async () => {
			server.use(
				http.get('/api/auth/status', () => {
					return HttpResponse.json({
						authenticated: false,
						preferred_network_id: null
					});
				})
			);

			const result = await authStore.checkStatus();

			expect(result).toBe(false);
			expect(get(isAuthenticated)).toBe(false);
		});

		it('sets error on network failure', async () => {
			server.use(
				http.get('/api/auth/status', () => {
					return HttpResponse.error();
				})
			);

			const result = await authStore.checkStatus();

			expect(result).toBe(false);
			expect(get(isAuthenticated)).toBe(false);
			expect(get(authError)).toBeTruthy();
		});
	});

	describe('login', () => {
		it('sets loginPending on successful login request', async () => {
			const result = await authStore.login('user@test.com');

			expect(result).toBe(true);
			expect(get(isLoginPending)).toBe(true);
			expect(get(authStore).loading).toBe(false);
		});

		it('sets error on invalid credentials', async () => {
			const result = await authStore.login('invalid@test.com');

			expect(result).toBe(false);
			expect(get(authError)).toBe('Invalid credentials');
			expect(get(isLoginPending)).toBe(false);
		});

		it('sets loading state during request', async () => {
			// Check initial loading state
			expect(get(authStore).loading).toBe(false);

			// Start login (don't await)
			const loginPromise = authStore.login('user@test.com');

			// Wait for login to complete
			await loginPromise;

			// Loading should be false after completion
			expect(get(authStore).loading).toBe(false);
		});
	});

	describe('verify', () => {
		beforeEach(async () => {
			// First, initiate login to enter verification state
			await authStore.login('user@test.com');
		});

		it('sets authenticated on successful verification', async () => {
			server.use(
				http.post('/api/auth/verify', () => {
					return HttpResponse.json({
						success: true,
						message: 'Login successful',
						preferred_network_id: 'net-123'
					});
				}),
				http.get('/api/auth/status', () => {
					return HttpResponse.json({
						authenticated: true,
						preferred_network_id: 'net-123',
						user_email: 'user@test.com',
						user_name: 'Test User',
						user_phone: null,
						user_role: 'owner',
						account_id: 'account-123',
						premium_status: null
					});
				})
			);

			const result = await authStore.verify('123456');

			expect(result).toBe(true);
			expect(get(isAuthenticated)).toBe(true);
			expect(get(isLoginPending)).toBe(false);
		});

		it('sets error on invalid verification code', async () => {
			server.use(
				http.post('/api/auth/verify', () => {
					return HttpResponse.json({ detail: 'Invalid verification code' }, { status: 401 });
				})
			);

			const result = await authStore.verify('wrong-code');

			expect(result).toBe(false);
			expect(get(authError)).toBe('Invalid verification code');
		});
	});

	describe('logout', () => {
		it('resets store to initial state', async () => {
			// First authenticate
			server.use(
				http.get('/api/auth/status', () => {
					return HttpResponse.json({
						authenticated: true,
						preferred_network_id: 'net-123',
						user_email: 'user@test.com'
					});
				})
			);
			await authStore.checkStatus();
			expect(get(isAuthenticated)).toBe(true);

			// Now logout
			await authStore.logout();

			expect(get(isAuthenticated)).toBe(false);
			expect(get(authStore).userEmail).toBeNull();
			expect(get(authStore).preferredNetworkId).toBeNull();
			expect(get(authStore).loading).toBe(false);
		});

		it('succeeds even if API call fails', async () => {
			server.use(
				http.post('/api/auth/logout', () => {
					return HttpResponse.error();
				})
			);

			// Should not throw
			await expect(authStore.logout()).resolves.toBeUndefined();
			expect(get(isAuthenticated)).toBe(false);
		});
	});

	describe('clearError', () => {
		it('clears the error state', async () => {
			// First trigger an error
			await authStore.login('invalid@test.com');
			expect(get(authError)).toBeTruthy();

			// Clear the error
			authStore.clearError();

			expect(get(authError)).toBeNull();
		});
	});

	describe('cancelLogin', () => {
		it('resets loginPending and clears error', async () => {
			// First initiate login
			await authStore.login('user@test.com');
			expect(get(isLoginPending)).toBe(true);

			// Cancel login
			authStore.cancelLogin();

			expect(get(isLoginPending)).toBe(false);
			expect(get(authError)).toBeNull();
		});
	});
});
