/**
 * Tests for the blocked-applications store (phase-6.0-revamp.md § 7 WP7,
 * family 10).
 *
 * Coverage:
 * - fetch loads the profile's blocked-application list
 * - a 402 is recorded as premiumRequired rather than error
 * - a 5xx is recorded as error
 * - setApplications stores the response's read-back list
 * - a 403 experimental_disabled response surfaces as a rejected promise
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { blockedApplicationsStore } from './blockedApplications';
import { server } from '../../../tests/mocks/server';

describe('blockedApplicationsStore', () => {
	beforeEach(() => {
		blockedApplicationsStore.clear();
	});

	it("loads the profile's blocked-application list", async () => {
		await blockedApplicationsStore.fetch('profile-1');

		const state = get(blockedApplicationsStore);
		expect(state.applications).toEqual(['com.example.app']);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 402 as premiumRequired rather than error', async () => {
		server.use(
			http.get('/api/profiles/:profileId/blocked-applications', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		await blockedApplicationsStore.fetch('profile-1');

		const state = get(blockedApplicationsStore);
		expect(state.premiumRequired).toBe(true);
		expect(state.error).toBeNull();
	});

	it('records a 5xx as error', async () => {
		server.use(
			http.get('/api/profiles/:profileId/blocked-applications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await blockedApplicationsStore.fetch('profile-1');

		expect(get(blockedApplicationsStore).error).toBeTruthy();
	});

	describe('setApplications', () => {
		it("stores the response's read-back list", async () => {
			await blockedApplicationsStore.setApplications('profile-1', ['com.a', 'com.b']);

			const state = get(blockedApplicationsStore);
			expect(state.applications).toEqual(['com.a', 'com.b']);
			expect(state.applying).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/profiles/:profileId/blocked-applications', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				blockedApplicationsStore.setApplications('profile-1', ['com.a'])
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(blockedApplicationsStore).applying).toBe(false);
		});
	});

	it('clear resets to the initial state', async () => {
		await blockedApplicationsStore.fetch('profile-1');
		expect(get(blockedApplicationsStore).applications).toEqual(['com.example.app']);

		blockedApplicationsStore.clear();

		expect(get(blockedApplicationsStore).applications).toEqual([]);
	});
});
