/**
 * Tests for the network password store (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 12).
 *
 * Coverage:
 * - setPassword/clearPassword resolve with the backend's response
 * - `applying` flips true while the request is in flight and resets after
 * - a 422 response surfaces as a rejected promise and records `error`
 * - clear reports `open_network: true`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { networkPasswordStore } from './networkPassword';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

describe('networkPasswordStore', () => {
	beforeEach(() => {
		networkPasswordStore.clear();
	});

	describe('setPassword', () => {
		it('resolves with the backend response and resets applying', async () => {
			const promise = networkPasswordStore.setPassword('network-123', 'correct-horse-battery');

			expect(get(networkPasswordStore).applying).toBe(true);

			const result = await promise;

			expect(result.changed).toBe(true);
			expect(result.reboot_expected).toBe(false);
			expect(get(networkPasswordStore).applying).toBe(false);
		});

		it('surfaces a 422 validation response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/password', () =>
					HttpResponse.json(
						{ detail: 'password must be 8-63 printable ASCII characters.' },
						{ status: 422 }
					)
				)
			);

			await expect(networkPasswordStore.setPassword('network-123', 'short')).rejects.toThrow();

			expect(get(networkPasswordStore).applying).toBe(false);
			expect(get(networkPasswordStore).error).toBeTruthy();
		});
	});

	describe('clearPassword', () => {
		it('resolves with open_network: true', async () => {
			const result = await networkPasswordStore.clearPassword('network-123');

			expect(result.open_network).toBe(true);
			expect(result.changed).toBe(true);
			expect(get(networkPasswordStore).applying).toBe(false);
		});

		it('surfaces a 429 rate-limit response as a rejected promise', async () => {
			server.use(
				http.delete('/api/networks/:networkId/password', () =>
					HttpResponse.json({ detail: 'Rate limit exceeded.' }, { status: 429 })
				)
			);

			await expect(networkPasswordStore.clearPassword('network-123')).rejects.toThrow();
			expect(get(networkPasswordStore).applying).toBe(false);
		});
	});
});
