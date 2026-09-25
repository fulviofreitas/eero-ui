/**
 * Tests for the entitlements store (plan § 7 WP6, "first" commit).
 *
 * Coverage:
 * - fetch loads entitlements and derives isPremium/experimentalWrites
 * - fetch failure leaves entitlements null (fail-closed) and records an error
 * - hasFeature is defensive against string / {name|id|feature} / unknown
 *   element shapes (features element shape is undocumented upstream)
 * - premiumRequired is false while loading/unknown, true only once the
 *   network is confirmed non-premium
 * - clear resets to initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	entitlementsStore,
	isPremium,
	experimentalWrites,
	premiumRequired,
	hasFeature
} from './entitlements';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

describe('entitlementsStore', () => {
	beforeEach(() => {
		entitlementsStore.clear();
	});

	describe('fetch', () => {
		it('loads entitlements and derives premium/experimental flags', async () => {
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({
						features: ['insights'],
						upsell_features: [],
						is_premium: true,
						premium_status: { active: true, eero_plus: true, premium_dns: true },
						capabilities: [],
						experimental_writes: true
					})
				)
			);

			await entitlementsStore.fetch('network-123');

			const state = get(entitlementsStore);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
			expect(get(isPremium)).toBe(true);
			expect(get(experimentalWrites)).toBe(true);
			expect(get(premiumRequired)).toBe(false);
		});

		it('records an error and leaves entitlements null on failure (fail closed)', async () => {
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await entitlementsStore.fetch('network-123');

			const state = get(entitlementsStore);
			expect(state.entitlements).toBeNull();
			expect(state.error).toBeTruthy();
			expect(get(isPremium)).toBeNull();
			expect(get(experimentalWrites)).toBe(false);
			// Unknown, not "confirmed non-premium" - must not render an upsell.
			expect(get(premiumRequired)).toBe(false);
		});

		it('derives premiumRequired=true once a non-premium network resolves', async () => {
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({
						features: [],
						upsell_features: ['insights'],
						is_premium: false,
						premium_status: null,
						capabilities: [],
						experimental_writes: false
					})
				)
			);

			await entitlementsStore.fetch('network-123');

			expect(get(isPremium)).toBe(false);
			expect(get(premiumRequired)).toBe(true);
		});
	});

	describe('hasFeature / entitlementsStore.hasFeature', () => {
		const withFeatures = (features: unknown[]) =>
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({
						features,
						upsell_features: [],
						is_premium: true,
						premium_status: null,
						capabilities: [],
						experimental_writes: false
					})
				)
			);

		it('matches a bare string element', async () => {
			withFeatures(['guest_network']);
			await entitlementsStore.fetch('network-123');
			expect(entitlementsStore.hasFeature('guest_network')).toBe(true);
			expect(hasFeature(get(entitlementsStore).entitlements?.features, 'guest_network')).toBe(true);
		});

		it('matches an object element under name/id/feature keys', async () => {
			withFeatures([{ id: 'thread' }, { feature: 'mlo' }, { name: 'sqm' }]);
			await entitlementsStore.fetch('network-123');
			expect(entitlementsStore.hasFeature('thread')).toBe(true);
			expect(entitlementsStore.hasFeature('mlo')).toBe(true);
			expect(entitlementsStore.hasFeature('sqm')).toBe(true);
		});

		it('does not match an unrecognised element shape or a missing feature', async () => {
			withFeatures([{ unrelated: 'value' }, 42, null]);
			await entitlementsStore.fetch('network-123');
			expect(entitlementsStore.hasFeature('sqm')).toBe(false);
		});

		it('returns false when entitlements have not loaded', () => {
			expect(entitlementsStore.hasFeature('sqm')).toBe(false);
			expect(hasFeature(undefined, 'sqm')).toBe(false);
		});
	});

	describe('clear', () => {
		it('resets to initial state', async () => {
			server.use(
				http.get('/api/networks/:networkId/entitlements', () =>
					HttpResponse.json({
						features: [],
						upsell_features: [],
						is_premium: true,
						premium_status: null,
						capabilities: [],
						experimental_writes: true
					})
				)
			);
			await entitlementsStore.fetch('network-123');

			entitlementsStore.clear();

			const state = get(entitlementsStore);
			expect(state.entitlements).toBeNull();
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
		});
	});
});
