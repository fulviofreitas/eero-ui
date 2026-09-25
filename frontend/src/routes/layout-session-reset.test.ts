/**
 * S1 (security fix pass): logout - and the `auth:unauthorized` 401 path, which drives
 * `isAuthenticated` through the exact same transition - must drop every cache that holds
 * account data, and the command palette (and its ⌘K/"?" shortcuts) must not exist for an
 * unauthenticated session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore, devicesStore } from '$stores';
import Layout from './+layout.svelte';

async function renderAuthenticatedLayout() {
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
		http.get('/api/devices', () =>
			HttpResponse.json([{ id: 'dev-1', mac: 'aa:bb:cc:dd:ee:ff', nickname: 'Laptop' }])
		),
		http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
	);

	render(Layout);

	await waitFor(() => expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument());
}

describe('root layout - session reset on logout', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		devicesStore.clear();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('clears the device store and localStorage caches, and hides the command palette', async () => {
		await renderAuthenticatedLayout();

		await devicesStore.fetch();
		expect(devicesStore).toBeDefined();

		localStorage.setItem('commandPalette:recent', JSON.stringify([{ id: 'device:dev-1' }]));
		localStorage.setItem('eero-ui:device-filters', JSON.stringify({ search: 'laptop' }));

		await fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

		await waitFor(() => expect(screen.getByText(/redirecting to login/i)).toBeInTheDocument());

		// Device data is gone.
		let devicesState: { devices: unknown[] } | undefined;
		devicesStore.subscribe((s) => (devicesState = s))();
		expect(devicesState?.devices).toEqual([]);

		// Session-scoped localStorage caches are gone.
		expect(localStorage.getItem('commandPalette:recent')).toBeNull();
		expect(localStorage.getItem('eero-ui:device-filters')).toBeNull();

		// The palette is unmounted - ⌘K does nothing now.
		await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
		expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
		expect(screen.queryByRole('button', { name: /search/i })).toBeNull();
	});
});
