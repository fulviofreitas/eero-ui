/**
 * Tests for the network rename control's experimental-writes gate
 * (phase-6.0-revamp.md § 7 WP7 follow-up: the rename route
 * (`PUT /networks/{id}/name`) was retrofitted with `_NETWORK_NAME_GATE` by a
 * BACKEND-SME security-review pass, 2026-09-24 - this control now needs the
 * same `ExperimentalGate` every other unverified-write control gets).
 *
 * Coverage:
 * - gate-off hides the Rename button entirely
 * - gate-on shows it
 * - a 403 `experimental_disabled` response (gate flipped off server-side
 *   after the client already believed it was on) surfaces as an error toast,
 *   not a thrown crash
 *
 * `$app/stores`'s `page` is mocked here to supply a route param, since the
 * shared stub in tests/mocks/app-stores.ts always resolves `params` to `{}`.
 * The full network detail page mounts a large card tree, so every wait below
 * uses a generous timeout rather than the 5s default.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { readable, get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { entitlementsStore, uiStore, networksStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/network/network-123'),
		params: { id: 'network-123' },
		route: { id: '/network/[id]' },
		status: 200,
		error: null,
		data: {},
		form: null
	})
}));

function mockEntitlements(experimentalWrites: boolean) {
	server.use(
		http.get('/api/networks/:networkId/entitlements', () =>
			HttpResponse.json({
				features: [],
				upsell_features: [],
				is_premium: null,
				premium_status: null,
				capabilities: [],
				experimental_writes: experimentalWrites
			})
		)
	);
}

async function importPage() {
	return (await import('./+page.svelte')).default;
}

async function waitForHeading() {
	await waitFor(
		() =>
			expect(screen.getByRole('heading', { level: 1, name: 'Home Network' })).toBeInTheDocument(),
		{ timeout: 15000 }
	);
}

describe('network detail page - rename gate', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		networksStore.clear();
		uiStore.closeConfirm();
	});

	it('hides the Rename button when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		const Page = await importPage();
		render(Page);
		await waitForHeading();

		expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
	}, 20000);

	it('shows the Rename button when the experimental-writes gate is on', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		const Page = await importPage();
		render(Page);
		await waitForHeading();

		expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
	}, 20000);

	it('toasts a 403 experimental_disabled response rather than crashing', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');
		server.use(
			http.put('/api/networks/:networkId/name', () =>
				HttpResponse.json(
					{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
					{ status: 403 }
				)
			)
		);

		const Page = await importPage();
		render(Page);
		await waitForHeading();

		await fireEvent.click(screen.getByRole('button', { name: /rename/i }));
		await fireEvent.input(screen.getByLabelText('New name'), { target: { value: 'New Name' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true), {
			timeout: 15000
		});
	}, 20000);
});
