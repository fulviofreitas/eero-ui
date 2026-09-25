/**
 * Tests for the eero detail page's location rename control
 * (phase-6.0-revamp.md § 7 WP7 follow-up (c): `PUT /eeros/{id}/location`).
 *
 * Coverage:
 * - gate-off hides the rename control
 * - gate-on: renaming goes through ConfirmDialog naming "not verified
 *   end-to-end" before any PUT fires
 * - a successful confirmation updates the page's own `eero.location`
 * - `changed: false` (no-op) surfaces as an info toast, not success
 * - a failed write surfaces an error toast
 *
 * `$app/stores`'s `page` is mocked here to supply a route param, since the
 * shared stub in tests/mocks/app-stores.ts always resolves `params` to `{}`.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { readable, get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { entitlementsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/eeros/eero-1'),
		params: { id: 'eero-1' },
		route: { id: '/eeros/[id]' },
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

// The page's module graph (charts, cards) is transformed once here, outside any timed
// test, so the first test does not pay the cold transform cost under load.
let Page: (typeof import('./+page.svelte'))['default'];
beforeAll(async () => {
	Page = (await import('./+page.svelte')).default;
}, 60000);

async function waitForEeroHeading() {
	await waitFor(
		() =>
			expect(screen.getByRole('heading', { level: 1, name: 'Living Room' })).toBeInTheDocument(),
		{ timeout: 15000 }
	);
}

describe('eero detail page - location rename', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		uiStore.closeConfirm();
		for (const toast of get(uiStore).toasts) uiStore.removeToast(toast.id);
	});

	it('hides the rename control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(Page);
		await waitForEeroHeading();

		expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
	}, 20000);

	it('gate-on: renaming goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(Page);
		await waitForEeroHeading();

		let putCalls = 0;
		server.use(
			http.put('/api/eeros/:eeroId/location', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, location: 'Kitchen' });
			})
		);

		await fireEvent.input(screen.getByLabelText('Location'), {
			target: { value: 'Kitchen' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	}, 20000);

	it('a successful confirmation updates the page and toasts success', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(Page);
		await waitForEeroHeading();

		server.use(
			http.put('/api/eeros/:eeroId/location', () =>
				HttpResponse.json({ success: true, changed: true, location: 'Kitchen' })
			)
		);

		await fireEvent.input(screen.getByLabelText('Location'), {
			target: { value: 'Kitchen' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(
			() => expect(screen.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeInTheDocument(),
			{ timeout: 15000 }
		);
		expect(get(uiStore).toasts.some((t) => t.type === 'success')).toBe(true);
	}, 20000);

	it('changed:false surfaces as an info toast, not success', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(Page);
		await waitForEeroHeading();

		server.use(
			http.put('/api/eeros/:eeroId/location', () =>
				HttpResponse.json({ success: true, changed: false, location: 'Living Room' })
			)
		);

		await fireEvent.input(screen.getByLabelText('Location'), {
			target: { value: 'Living Room' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'info')).toBe(true), {
			timeout: 15000
		});
		expect(get(uiStore).toasts.some((t) => t.type === 'success')).toBe(false);
	}, 20000);

	it('surfaces a failed write as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(Page);
		await waitForEeroHeading();

		server.use(
			http.put('/api/eeros/:eeroId/location', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.input(screen.getByLabelText('Location'), {
			target: { value: 'Kitchen' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true), {
			timeout: 15000
		});
	}, 20000);
});
