/**
 * Tests for SecurityWanCard (phase-6.0-revamp.md § 7 WP6, deliverable 12).
 *
 * Coverage:
 * - loads and renders every family section with its `data-family` attribute
 * - a controls snippet renders inside its named section (WP8 seam)
 * - a 5xx renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { createRawSnippet } from 'svelte';
import SecurityWanCard from './SecurityWanCard.svelte';
import { securityWanStore } from '$stores/securityWan';
import { server } from '../../../../tests/mocks/server';

describe('SecurityWanCard', () => {
	beforeEach(() => {
		securityWanStore.clear();
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
});
