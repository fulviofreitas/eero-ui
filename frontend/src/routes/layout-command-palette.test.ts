/**
 * Global ⌘K / Ctrl+K command-palette shortcut and "?" shortcuts-help wiring (WP9 § 6.2 Tier 3).
 * See lib/shortcuts.ts for the shared shortcut table/predicates this handler is built on.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore } from '$stores';
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
		http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
	);

	render(Layout);

	await waitFor(() => expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument());
}

describe('root layout - command palette shortcut', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('opens the command palette on Ctrl+K', async () => {
		await renderAuthenticatedLayout();

		await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

		await waitFor(() => expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument());
	});

	// Escape-closes the palette via Modal's own `onClose` contract, already covered by
	// Modal.test.ts ("calls onClose on Escape"). Asserting full DOM removal here as well would
	// depend on Modal's `transition:fade` outro actually completing, which never fires in jsdom
	// (no real CSS animation engine) - a pre-existing environment limitation, not something
	// specific to the command palette.

	it('opens the command palette via the visible "Search ⌘K" button', async () => {
		await renderAuthenticatedLayout();

		await fireEvent.click(screen.getByRole('button', { name: /search/i }));

		await waitFor(() => expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument());
	});

	it('opens the shortcuts help dialog on "?"', async () => {
		await renderAuthenticatedLayout();

		await fireEvent.keyDown(window, { key: '?' });

		await waitFor(() =>
			expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument()
		);
	});

	it('ignores "?" while typing in an input', async () => {
		await renderAuthenticatedLayout();

		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();

		await fireEvent.keyDown(input, { key: '?' });

		expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeNull();
		document.body.removeChild(input);
	});

	it('Ctrl+K still opens the palette even while typing in an input (the exact modifier combo)', async () => {
		await renderAuthenticatedLayout();

		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();

		await fireEvent.keyDown(input, { key: 'k', ctrlKey: true });

		await waitFor(() => expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument());
		document.body.removeChild(input);
	});
});
