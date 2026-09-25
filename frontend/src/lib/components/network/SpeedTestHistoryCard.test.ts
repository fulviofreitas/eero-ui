/**
 * Tests for SpeedTestHistoryCard (phase-6.0-revamp.md § 7 WP6, deliverable 1).
 *
 * Coverage:
 * - loads and renders history rows on mount (default limit 10)
 * - switching the limit selector re-fetches with the new limit
 * - an error with no cached results renders ErrorState with a working retry
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
});
