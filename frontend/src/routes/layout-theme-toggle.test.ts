/**
 * Tests that the theme toggle is not gated behind having networks (see
 * .claude/tasks/phase-6.0-revamp.md § 6.2 Tier 1 — "move the theme toggle out of the networks
 * guard so it exists on /login and on empty accounts").
 *
 * Previously the toggle lived inside `{#if $networksStore.networks.length > 0}`, so it vanished
 * for an authenticated account with zero networks and never existed on /login at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore } from '$stores';
import Layout from './+layout.svelte';

// $app/stores and $app/navigation resolve to the stubs aliased in vitest.config.ts, whose
// default `page.url` is http://localhost/ - matching the "not on /login" branch this test needs.

describe('root layout - theme toggle placement', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		vi.clearAllMocks();
	});

	it('renders the theme toggle for an authenticated account with zero networks', async () => {
		server.use(
			http.get('/api/auth/status', () =>
				HttpResponse.json({
					authenticated: true,
					preferred_network_id: null,
					user_email: 'operator@example.com',
					user_name: 'Operator',
					user_phone: null,
					user_role: 'owner',
					account_id: 'acct-1',
					premium_status: null
				})
			),
			http.get('/api/networks', () => HttpResponse.json([])),
			http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
		);

		render(Layout);

		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: /switch to (light|dark) theme/i })
			).toBeInTheDocument()
		);

		// The network selector itself must still be absent - there is nothing to select.
		expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
	});
});
