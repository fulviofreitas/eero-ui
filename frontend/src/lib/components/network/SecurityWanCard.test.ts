/**
 * Tests for SecurityWanCard (phase-6.0-revamp.md § 7 WP6, deliverable 12).
 *
 * Coverage:
 * - loads and renders every family section with its `data-family` attribute
 * - a controls snippet renders inside its named section (WP8 seam)
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides the DDNS toggle button
 * - gate-on: the DDNS toggle goes through ConfirmDialog naming
 *   "not verified end-to-end" before any PUT fires
 * - a successful toggle confirmation re-fetches
 * - a backend `changed:false` renders an informational message, not a
 *   success toast
 * - a failed toggle surfaces an error toast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { createRawSnippet } from 'svelte';
import SecurityWanCard from './SecurityWanCard.svelte';
import { securityWanStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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

describe('SecurityWanCard', () => {
	beforeEach(() => {
		securityWanStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders every family section with its data-family attribute', async () => {
		const { container } = render(SecurityWanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());

		for (const family of [
			'wifi-security',
			'network',
			'power-thread',
			'updates',
			'subnets',
			'wan'
		]) {
			expect(container.querySelector(`[data-family="${family}"]`)).toBeInTheDocument();
		}
	});

	it('renders a controls snippet inside its named section', async () => {
		const controls = createRawSnippet(() => ({
			render: () => `<button>Edit WAN</button>`
		}));

		render(SecurityWanCard, {
			props: { networkId: 'network-123', wanControls: controls }
		});

		await waitFor(() => expect(screen.getByText('Edit WAN')).toBeInTheDocument());
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: false,
					band_steering: false,
					upnp: false,
					ipv6: null,
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: null,
					updates: null
				})
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());
	});

	it('hides the DDNS toggle button when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(SecurityWanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: /dynamic dns/i })).not.toBeInTheDocument();
	});

	it('gate-on: the DDNS toggle goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/ddns', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, ddns: { enabled: true } });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it('a successful toggle confirmation re-fetches the security/WAN state', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ success: true, changed: true, ddns: { enabled: true } })
			),
			http.get('/api/networks/:networkId/advanced', () =>
				HttpResponse.json({
					dhcp: { starting_address: '10.0.0.10', ending_address: '10.0.0.254' },
					connection_mode: 'router',
					power_saving: false,
					ddns: { enabled: true }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /disable dynamic dns/i })).toBeInTheDocument()
		);
	});

	it('shows an informational message, not a success toast, when the backend reports changed:false', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ success: true, changed: false, ddns: { enabled: false } })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('surfaces a failed toggle as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('router')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});
});
