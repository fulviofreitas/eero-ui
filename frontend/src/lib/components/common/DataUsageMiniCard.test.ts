/**
 * Tests for DataUsageMiniCard (phase-6.0-revamp.md § 7 WP6, deliverable 7) -
 * the per-device/eero/profile variant of DataUsageCard.
 *
 * Coverage:
 * - loads and renders totals on mount for a device entity
 * - switching the range selector re-fetches with the new range
 * - a 402 renders the upsell notice, not an error
 * - a 5xx (after both GET retries) renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import DataUsageMiniCard from './DataUsageMiniCard.svelte';
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

describe('DataUsageMiniCard', () => {
	beforeEach(() => {
		dataUsageStore.clearAll();
	});

	it('loads on mount and renders totals for a device entity', async () => {
		let seenCadence: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/data-usage/devices/:mac', ({ request }) => {
				seenCadence = new URL(request.url).searchParams.get('cadence');
				return HttpResponse.json(usageResponse(2000, 200));
			})
		);

		render(DataUsageMiniCard, {
			props: { networkId: 'network-123', entity: 'device', entityId: 'aa:bb:cc:dd:ee:01' }
		});

		await waitFor(() => expect(seenCadence).toBe('daily'));
		await waitFor(() => expect(screen.getByText('2.0 KB')).toBeInTheDocument());
	});

	it('re-fetches with the new range when the selector changes', async () => {
		const seenCadences: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/data-usage/eeros/:eeroId', ({ request }) => {
				seenCadences.push(new URL(request.url).searchParams.get('cadence') ?? '');
				return HttpResponse.json(usageResponse(1000, 100));
			})
		);

		render(DataUsageMiniCard, {
			props: { networkId: 'network-123', entity: 'eero', entityId: 'eero-1' }
		});
		await waitFor(() => expect(seenCadences).toContain('daily'));

		await fireEvent.click(screen.getByRole('button', { name: '30d' }));

		await waitFor(() => expect(seenCadences).toContain('daily'));
		expect(seenCadences.length).toBeGreaterThan(1);
	});

	it('renders an upsell notice — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage/profiles/:profileId', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(DataUsageMiniCard, {
			props: { networkId: 'network-123', entity: 'profile', entityId: 'profile-1' }
		});

		await waitFor(() =>
			expect(screen.getByText('Data usage requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/data-usage/devices/:mac', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(DataUsageMiniCard, {
			props: { networkId: 'network-123', entity: 'device', entityId: 'aa:bb:cc:dd:ee:01' }
		});

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/data-usage/devices/:mac', () =>
				HttpResponse.json(usageResponse(300, 30))
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('300 B')).toBeInTheDocument());
	});
});
