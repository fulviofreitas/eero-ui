/**
 * Tests for SpeedTestHistoryCard (phase-6.0-revamp.md § 7 WP6, deliverable 1).
 *
 * Coverage:
 * - loads and renders history rows on mount (default limit 10)
 * - switching the limit selector re-fetches with the new limit
 * - an error with no cached results renders ErrorState with a working retry
 * - a compact one-line date+time (never the full toLocaleString() form) for the timestamp column
 * - an all-null history renders one muted message and skips the chart, instead of a table of
 *   dashes plus an empty-looking chart
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import SpeedTestHistoryCard from './SpeedTestHistoryCard.svelte';
import { speedTestHistoryStore } from '$stores';
import { server } from '../../../../tests/mocks/server';

function resultAt(offsetHours: number) {
	return {
		download_mbps: 100 - offsetHours,
		upload_mbps: 20 - offsetHours,
		latency_ms: 10 + offsetHours,
		timestamp: new Date(Date.now() - offsetHours * 60 * 60 * 1000).toISOString()
	};
}

describe('SpeedTestHistoryCard', () => {
	beforeEach(() => {
		speedTestHistoryStore.clear();
	});

	it('loads history on mount at the default limit (10)', async () => {
		let requestedLimit: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/speedtests', ({ request }) => {
				requestedLimit = new URL(request.url).searchParams.get('limit');
				return HttpResponse.json([resultAt(0), resultAt(1)]);
			})
		);

		render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(requestedLimit).toBe('10'));
		await waitFor(() => expect(screen.getByText('100.0 Mbps')).toBeInTheDocument());
	});

	it('re-fetches with the new limit when the selector changes', async () => {
		const seenLimits: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/speedtests', ({ request }) => {
				seenLimits.push(new URL(request.url).searchParams.get('limit') ?? '');
				return HttpResponse.json([resultAt(0)]);
			})
		);

		render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(seenLimits).toContain('10'));

		await fireEvent.click(screen.getByRole('button', { name: '25' }));

		await waitFor(() => expect(seenLimits).toContain('25'));
	});

	it('shows an error state with a working retry when there are no cached results', async () => {
		// GETs auto-retry twice on 5xx (client.ts) before the store surfaces an
		// error, so every attempt must fail here for the initial load to land
		// on the error state at all.
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), {
			timeout: 5000
		});

		server.use(
			http.get('/api/networks/:networkId/speedtests', () => HttpResponse.json([resultAt(0)]))
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('100.0 Mbps')).toBeInTheDocument());
	});

	it('renders a compact one-line date+time for each row, never a clipped full timestamp', async () => {
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json([
					{
						download_mbps: 480.2,
						upload_mbps: 95.6,
						latency_ms: 12,
						timestamp: '2026-09-25T11:45:38.000Z'
					}
				])
			)
		);

		render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('480.2 Mbps')).toBeInTheDocument());
		// Full toLocaleString() output includes seconds ("11:45:38 AM") - the compact
		// formatter must not.
		expect(screen.queryByText(/:45:38/)).not.toBeInTheDocument();
	});

	it('shows one muted message and no chart when every row has all-null measurements', async () => {
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json([
					{
						download_mbps: null,
						upload_mbps: null,
						latency_ms: null,
						timestamp: '2026-09-25T11:45:38.000Z'
					}
				])
			)
		);

		const { container } = render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('No speed-test measurements in these entries.')).toBeInTheDocument()
		);
		expect(container.querySelector('canvas')).toBeNull();
		expect(container.querySelector('table')).toBeNull();
	});

	it('renders the chart and table when at least one row has a numeric value', async () => {
		server.use(
			http.get('/api/networks/:networkId/speedtests', () =>
				HttpResponse.json([
					{
						download_mbps: null,
						upload_mbps: null,
						latency_ms: null,
						timestamp: resultAt(1).timestamp
					},
					{ download_mbps: 50, upload_mbps: 10, latency_ms: 20, timestamp: resultAt(0).timestamp }
				])
			)
		);

		const { container } = render(SpeedTestHistoryCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('50.0 Mbps')).toBeInTheDocument());
		expect(container.querySelector('canvas')).not.toBeNull();
		expect(
			screen.queryByText('No speed-test measurements in these entries.')
		).not.toBeInTheDocument();
	});
});
