/**
 * Tests for the security/WAN store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 12).
 *
 * Coverage:
 * - fetch loads security/subnets/multistaticip/advanced together
 * - a transport failure on any one call records error
 * - clear resets to the initial state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { securityWanStore } from './securityWan';
import { server } from '../../../tests/mocks/server';

describe('securityWanStore', () => {
	beforeEach(() => {
		securityWanStore.clear();
	});

	it('loads security/subnets/multistaticip/advanced together', async () => {
		await securityWanStore.fetch('network-123');

		const state = get(securityWanStore);
		expect(state.security?.wpa3).toBe(true);
		expect(state.subnets?.subnets).toHaveLength(1);
		expect(state.multistaticip?.configured).toBe(false);
		expect(state.advanced?.connection_mode).toBe('router');
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a transport failure on any one call as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/subnets', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await securityWanStore.fetch('network-123');

		const state = get(securityWanStore);
		expect(state.error).toBeTruthy();
		expect(state.loading).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		await securityWanStore.fetch('network-123');
		expect(get(securityWanStore).security).not.toBeNull();

		securityWanStore.clear();

		const state = get(securityWanStore);
		expect(state.security).toBeNull();
		expect(state.subnets).toBeNull();
	});
});
