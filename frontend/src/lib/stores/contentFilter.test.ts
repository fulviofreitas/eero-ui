/**
 * Tests for the content-filter store (phase-6.0-revamp.md § 7 WP7, family 10).
 *
 * Coverage:
 * - fetch loads the allow/block lists
 * - a 402 is recorded as premiumRequired rather than error
 * - a 5xx is recorded as error
 * - allowDomain/unallowDomain/blockDomain/unblockDomain re-fetch on success
 * - allowDomainForProfiles/blockDomainForProfiles return the backend's
 *   `success` flag without touching allowedList/blockedList
 * - a 403 experimental_disabled response surfaces as a rejected promise
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { contentFilterStore } from './contentFilter';
import { server } from '../../../tests/mocks/server';

describe('contentFilterStore', () => {
	beforeEach(() => {
		contentFilterStore.clear();
	});

	it('loads the allow/block lists', async () => {
		await contentFilterStore.fetch('network-123');

		const state = get(contentFilterStore);
		expect(state.allowedList).toEqual(['allowed.example.com']);
		expect(state.blockedList).toEqual(['blocked.example.com']);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 402 as premiumRequired rather than error', async () => {
		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		await contentFilterStore.fetch('network-123');

		const state = get(contentFilterStore);
		expect(state.premiumRequired).toBe(true);
		expect(state.error).toBeNull();
	});

	it('records a 5xx as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await contentFilterStore.fetch('network-123');

		expect(get(contentFilterStore).error).toBeTruthy();
	});

	describe('allowDomain', () => {
		it('re-fetches the lists on success', async () => {
			await contentFilterStore.allowDomain('network-123', 'new.example.com');

			expect(get(contentFilterStore).applying).toBe(false);
			expect(get(contentFilterStore).allowedList.length).toBeGreaterThan(0);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/content-filter/allow', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				contentFilterStore.allowDomain('network-123', 'new.example.com')
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(contentFilterStore).applying).toBe(false);
		});
	});

	describe('unallowDomain', () => {
		it('re-fetches the lists on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/content-filter', () =>
					HttpResponse.json({ allowed_list: [], blocked_list: ['blocked.example.com'] })
				)
			);

			await contentFilterStore.unallowDomain('network-123', 'allowed.example.com');
			expect(get(contentFilterStore).allowedList).toEqual([]);
		});
	});

	describe('blockDomain', () => {
		it('re-fetches the lists on success', async () => {
			await contentFilterStore.blockDomain('network-123', 'new.example.com');
			expect(get(contentFilterStore).blockedList.length).toBeGreaterThan(0);
		});
	});

	describe('unblockDomain', () => {
		it('re-fetches the lists on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/content-filter', () =>
					HttpResponse.json({ allowed_list: ['allowed.example.com'], blocked_list: [] })
				)
			);

			await contentFilterStore.unblockDomain('network-123', 'blocked.example.com');
			expect(get(contentFilterStore).blockedList).toEqual([]);
		});
	});

	describe('allowDomainForProfiles', () => {
		it('returns the backend success flag without touching the lists', async () => {
			const before = get(contentFilterStore).allowedList;

			const success = await contentFilterStore.allowDomainForProfiles('network-123', {
				domain: 'new.example.com',
				profiles: ['profile-1']
			});

			expect(success).toBe(true);
			expect(get(contentFilterStore).allowedList).toBe(before);
			expect(get(contentFilterStore).applying).toBe(false);
		});
	});

	describe('blockDomainForProfiles', () => {
		it('returns the backend success flag without touching the lists', async () => {
			const success = await contentFilterStore.blockDomainForProfiles('network-123', {
				domain: 'new.example.com',
				profiles: ['profile-1']
			});

			expect(success).toBe(true);
			expect(get(contentFilterStore).applying).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/content-filter/block-for-profiles', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				contentFilterStore.blockDomainForProfiles('network-123', {
					domain: 'new.example.com',
					profiles: ['profile-1']
				})
			).rejects.toThrow('Experimental writes are disabled.');
		});
	});

	it('clear resets to the initial state', async () => {
		await contentFilterStore.fetch('network-123');
		expect(get(contentFilterStore).allowedList.length).toBeGreaterThan(0);

		contentFilterStore.clear();

		expect(get(contentFilterStore).allowedList).toEqual([]);
		expect(get(contentFilterStore).blockedList).toEqual([]);
	});
});
