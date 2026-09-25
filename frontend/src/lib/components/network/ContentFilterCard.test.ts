/**
 * Tests for ContentFilterCard (phase-6.0-revamp.md § 7 WP7, family 10).
 *
 * Coverage:
 * - loads and renders the allow/block lists on mount
 * - a 402 renders the premium upsell note, not an error
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides the add/remove domain controls
 * - gate-on: allowing a domain goes through ConfirmDialog naming "not
 *   verified end-to-end" before any POST fires
 * - a successful allow confirmation re-fetches
 * - a failed allow surfaces an error toast
 * - an invalid domain (with a scheme) is rejected client-side before any
 *   confirm dialog opens
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import ContentFilterCard from './ContentFilterCard.svelte';
import { contentFilterStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

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

describe('ContentFilterCard', () => {
	beforeEach(() => {
		contentFilterStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders the allow/block lists on mount', async () => {
		render(ContentFilterCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());
		expect(screen.getByText('blocked.example.com')).toBeInTheDocument();
	});

	it('renders the premium upsell note — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(ContentFilterCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Content filtering requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(ContentFilterCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({ allowed_list: [], blocked_list: [] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('No domains allowed.')).toBeInTheDocument());
	});

	it('hides the add/remove domain controls when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(ContentFilterCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());
		expect(screen.queryByPlaceholderText('example.com')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
	});

	it('gate-on: allowing a domain goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ContentFilterCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());

		let postCalls = 0;
		server.use(
			http.post('/api/networks/:networkId/content-filter/allow', () => {
				postCalls++;
				return HttpResponse.json({
					allowed_list: ['allowed.example.com', 'new.example.com'],
					blocked_list: ['blocked.example.com']
				});
			})
		);

		const allowInput = screen.getAllByPlaceholderText('example.com')[0];
		await fireEvent.input(allowInput, { target: { value: 'new.example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(postCalls).toBe(0);
	});

	it('a successful allow confirmation re-fetches', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ContentFilterCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());

		server.use(
			http.get('/api/networks/:networkId/content-filter', () =>
				HttpResponse.json({
					allowed_list: ['allowed.example.com', 'new.example.com'],
					blocked_list: ['blocked.example.com']
				})
			)
		);

		const allowInput = screen.getAllByPlaceholderText('example.com')[0];
		await fireEvent.input(allowInput, { target: { value: 'new.example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByText('new.example.com')).toBeInTheDocument());
	});

	it('surfaces a failed allow as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ContentFilterCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());

		server.use(
			http.post('/api/networks/:networkId/content-filter/allow', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		const allowInput = screen.getAllByPlaceholderText('example.com')[0];
		await fireEvent.input(allowInput, { target: { value: 'new.example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('rejects an invalid domain client-side before any confirm dialog opens', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ContentFilterCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('allowed.example.com')).toBeInTheDocument());

		const allowInput = screen.getAllByPlaceholderText('example.com')[0];
		await fireEvent.input(allowInput, { target: { value: 'https://example.com/path' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		expect(get(confirmDialog)).toBeNull();
		expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true);
	});
});
