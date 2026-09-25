/**
 * Mobile sidebar keyboard behaviour (phase-6.0-revamp.md § 7 WP9, "audit leftovers").
 *
 * On mobile the sidebar is an overlay, not a persistent layout element, so it needs the usual
 * overlay keyboard contract: Escape closes it, opening moves focus into the sidebar (first nav
 * link) and closing returns focus to the toggle that opened it. On desktop none of this fires -
 * the sidebar is part of the page layout and stealing focus on every toggle would be disruptive
 * there (see the `isMobileViewport()` guard in +layout.svelte).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore, uiStore } from '$stores';
import Layout from './+layout.svelte';

function setViewportWidth(width: number) {
	Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

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
		http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
	);

	render(Layout);

	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Toggle navigation' })).toBeInTheDocument()
	);
}

describe('root layout - mobile sidebar', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		uiStore.closeSidebar();
		localStorage.clear();
		vi.clearAllMocks();
		setViewportWidth(390);
	});

	afterEach(() => {
		setViewportWidth(1024);
	});

	it('marks the toggle aria-expanded, opens on click, and moves focus to the first nav link', async () => {
		await renderAuthenticatedLayout();

		const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await waitFor(() => expect(screen.getByRole('link', { name: /dashboard/i })).toHaveFocus());
	});

	it('closes on Escape and returns focus to the toggle', async () => {
		await renderAuthenticatedLayout();

		const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
		await fireEvent.click(toggle);
		await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));

		await fireEvent.keyDown(window, { key: 'Escape' });

		await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
		await waitFor(() => expect(toggle).toHaveFocus());
	});

	it('does not react to Escape on desktop viewports', async () => {
		setViewportWidth(1280);
		await renderAuthenticatedLayout();

		// Desktop defaults the sidebar open (getInitialSidebarOpen, ui.ts).
		const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
		await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));

		await fireEvent.keyDown(window, { key: 'Escape' });

		// Desktop sidebar is a persistent layout element - Escape is a no-op here.
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
	});
});
