/**
 * Tests for the guest network password store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 2).
 *
 * Coverage:
 * - fetch loads the current guest network status
 * - setPassword optimistically flips has_password to true, and rolls back
 *   on failure
 * - clearPassword optimistically flips has_password to false, and rolls
 *   back on failure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { guestPasswordStore } from './guestPassword';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

describe('guestPasswordStore', () => {
	beforeEach(() => {
		guestPasswordStore.clear();
	});

	it('fetch loads the current guest network status', async () => {
		server.use(
			http.get('/api/networks/:networkId/guest', () =>
				HttpResponse.json({ enabled: true, name: 'Guest', has_password: false })
			)
		);

		await guestPasswordStore.fetch('network-123');

		const state = get(guestPasswordStore);
		expect(state.status).toEqual({ enabled: true, name: 'Guest', has_password: false });
		expect(state.loading).toBe(false);
	});

	describe('setPassword', () => {
		it('optimistically flips has_password to true before the request resolves', async () => {
			server.use(
				http.get('/api/networks/:networkId/guest', () =>
					HttpResponse.json({ enabled: true, name: 'Guest', has_password: false })
				)
			);
			await guestPasswordStore.fetch('network-123');

			let resolveRequest: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolveRequest = resolve;
			});
			server.use(
				http.put('/api/networks/:networkId/guest/password', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						guest_network: { enabled: true, name: 'Guest', has_password: true }
					});
				})
			);

			const promise = guestPasswordStore.setPassword('network-123', 'correct-horse-battery');

			expect(get(guestPasswordStore).status?.has_password).toBe(true);
			expect(get(guestPasswordStore).applying).toBe(true);

			resolveRequest!();
			await promise;

			const state = get(guestPasswordStore);
			expect(state.applying).toBe(false);
			expect(state.status?.has_password).toBe(true);
		});

		it('rolls back has_password on failure', async () => {
			server.use(
				http.get('/api/networks/:networkId/guest', () =>
					HttpResponse.json({ enabled: true, name: 'Guest', has_password: false })
				)
			);
			await guestPasswordStore.fetch('network-123');

			server.use(
				http.put('/api/networks/:networkId/guest/password', () =>
					HttpResponse.json({ detail: 'Guest password must be 8-63 characters.' }, { status: 422 })
				)
			);

			await expect(guestPasswordStore.setPassword('network-123', 'short')).rejects.toThrow();

			const state = get(guestPasswordStore);
			expect(state.applying).toBe(false);
			expect(state.status?.has_password).toBe(false);
			expect(state.error).toBeTruthy();
		});
	});

	describe('clearPassword', () => {
		it('rolls back has_password on failure', async () => {
			server.use(
				http.get('/api/networks/:networkId/guest', () =>
					HttpResponse.json({ enabled: true, name: 'Guest', has_password: true })
				)
			);
			await guestPasswordStore.fetch('network-123');

			server.use(
				http.delete('/api/networks/:networkId/guest/password', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await expect(guestPasswordStore.clearPassword('network-123')).rejects.toThrow();

			const state = get(guestPasswordStore);
			expect(state.applying).toBe(false);
			expect(state.status?.has_password).toBe(true);
		});

		it('flips has_password to false on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/guest', () =>
					HttpResponse.json({ enabled: true, name: 'Guest', has_password: true })
				),
				http.delete('/api/networks/:networkId/guest/password', () =>
					HttpResponse.json({
						success: true,
						guest_network: { enabled: true, name: 'Guest', has_password: false }
					})
				)
			);
			await guestPasswordStore.fetch('network-123');

			await guestPasswordStore.clearPassword('network-123');

			expect(get(guestPasswordStore).status?.has_password).toBe(false);
		});
	});
});
