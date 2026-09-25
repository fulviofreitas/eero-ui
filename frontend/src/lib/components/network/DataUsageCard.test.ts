/**
 * Tests for DataUsageCard (phase-6.0-revamp.md § 7 WP6, deliverable 7).
 *
 * Coverage:
 * - loads and renders totals on mount at the default range (7d)
 * - switching the range selector re-fetches totals/breakdown/devices
 * - a 402 renders the upsell notice, not an error
 * - a 5xx (after both GET retries) renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import DataUsageCard from './DataUsageCard.svelte';
import { dataUsageStore } from '$stores/dataUsage';
import { server } from '../../../../tests/mocks/server';

function usageResponse(download: number, upload: number) {
	return {
		download_bytes: download,
		upload_bytes: upload,
		values: [{ time: '2026-01-01T00:00:00Z', download, upload }],
		raw: {}
	};
}

describe('DataUsageCard', () => {
	beforeEach(() => {
		dataUsageStore.clearAll();
	});

	it('loads on mount at the default range (7d) and renders totals', async () => {
		let seenCadence: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/data-usage', ({ request }) => {
				seenCadence = new URL(request.url).searchParams.get('cadence');
				return HttpResponse.json(usageResponse(1073741824, 104857600));
			})
		);

		render(DataUsageCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(seenCadence).toBe('daily'));
		await waitFor(() => expect(screen.getByText('1.0 GB')).toBeInTheDocument());
		expect(screen.getByText('100.0 MB')).toBeInTheDocument();
	});

	it('re-fetches with the new range when the selector changes', async () => {
		const seenCadences: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/data-usage', ({ request }) => {
				seenCadences.push(new URL(request.url).searchParams.get('cadence') ?? '');
				return HttpResponse.json(usageResponse(1000, 100));
			}),
			http.get('/api/networks/:networkId/data-usage/breakdown', () =>
				HttpResponse.json(usageResponse(0, 0))
			),
			http.get('/api/networks/:networkId/data-usage/devices', () =>
				HttpResponse.json(usageResponse(0, 0))
			)
		);

		render(DataUsageCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(seenCadences).toContain('daily'));

		await fireEvent.click(screen.getByRole('button', { name: '24h' }));

		await waitFor(() => expect(seenCadences).toContain('hourly'));
	});

	it('renders an upsell notice — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(DataUsageCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Data usage requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(DataUsageCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/data-usage', () =>
				HttpResponse.json(usageResponse(500, 50))
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('500 B')).toBeInTheDocument());
	});
});
