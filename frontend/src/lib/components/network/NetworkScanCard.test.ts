/**
 * Tests for NetworkScanCard (phase-6.0-revamp.md § 7 WP6, deliverable 6).
 *
 * Coverage:
 * - renders scan entries once loaded
 * - error -> ErrorState with a working retry
 * - a 409 feature_unavailable response renders an inline note, not an error
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import NetworkScanCard from './NetworkScanCard.svelte';
import { server } from '../../../../tests/mocks/server';

describe('NetworkScanCard', () => {
	it('renders scan entries once loaded', async () => {
		server.use(
			http.get('/api/networks/:networkId/scan', () =>
				HttpResponse.json({ scan: [{ ssid: 'Neighbor-WiFi', channel: 6 }] })
			)
		);

		render(NetworkScanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Neighbor-WiFi')).toBeInTheDocument());
	});

	it('shows an error state with a working retry on failure', async () => {
		// GETs auto-retry twice on 5xx (client.ts) before the component surfaces
		// an error, so every attempt must fail here for the initial load to
		// land on the error state at all.
		server.use(
			http.get('/api/networks/:networkId/scan', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(NetworkScanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), {
			timeout: 5000
		});

		server.use(
			http.get('/api/networks/:networkId/scan', () =>
				HttpResponse.json({ scan: [{ ssid: 'Recovered-WiFi' }] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('Recovered-WiFi')).toBeInTheDocument());
	});

	it('renders an inline note (not an error) on a 409 feature_unavailable response', async () => {
		server.use(
			http.get('/api/networks/:networkId/scan', () =>
				HttpResponse.json(
					{ detail: 'Not available right now.', type: 'feature_unavailable' },
					{ status: 409 }
				)
			)
		);

		render(NetworkScanCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText(/not available on this network right now/i)).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});
});
