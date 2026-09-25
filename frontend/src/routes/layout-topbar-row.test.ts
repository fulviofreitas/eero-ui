/**
 * Tests the top-bar layout fix (maintainer feedback, 6.0.0): the network selector, the
 * Search (⌘K) button, the status dot, the theme toggle and Sign out used to be split across
 * three stacked rows inside `.top-bar-right` ("Search ⌘K • Sign out" on one row, the theme
 * toggle on a second, "• iFulvio@House ▾" on a third). They must now render as one row.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore } from '$stores';
import Layout from './+layout.svelte';

describe('root layout - top-bar row', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		vi.clearAllMocks();
	});

	it('renders the network selector, search, status dot, theme toggle and sign-out as one flex row', async () => {
		server.use(
			http.get('/api/auth/status', () =>
				HttpResponse.json({
					authenticated: true,
					preferred_network_id: 'network-123',
					user_email: 'operator@example.com',
					user_name: 'Operator',
					user_phone: null,
					user_role: 'owner',
					account_id: 'acct-1',
					premium_status: null
				})
			),
			http.get('/api/networks', () =>
				HttpResponse.json([{ id: 'network-123', name: 'House', status: 'online' }])
			),
			http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
		);

		render(Layout);

		await waitFor(() =>
			expect(screen.getByRole('combobox', { name: /network/i })).toBeInTheDocument()
		);

		const networkSelect = screen.getByRole('combobox', { name: /network/i });
		const searchButton = screen.getByRole('button', { name: /search/i });
		const themeButton = screen.getByRole('button', { name: /switch to (light|dark) theme/i });
		const signOutButton = screen.getByRole('button', { name: /sign out/i });

		const row = networkSelect.closest('.top-bar-right');
		expect(row).not.toBeNull();
		// Every control lives in the same row-level container, not split across nested rows.
		expect(row?.contains(searchButton)).toBe(true);
		expect(row?.contains(themeButton)).toBe(true);
		expect(row?.contains(signOutButton)).toBe(true);
		expect(row?.querySelector('.status-dot')).not.toBeNull();

		// DOM order (mirrors the visual left-to-right order once right-aligned): network, search,
		// status dot, theme, sign-out.
		const children = Array.from(row?.children ?? []);
		const indexOf = (el: Element | null) =>
			el ? children.indexOf(el.closest('.top-bar-right > *')!) : -1;
		expect(indexOf(networkSelect)).toBeLessThan(indexOf(searchButton));
		expect(indexOf(searchButton)).toBeLessThan(indexOf(themeButton));
		expect(indexOf(themeButton)).toBeLessThan(indexOf(signOutButton));
	});
});
