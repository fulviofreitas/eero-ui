/**
 * Tests for ChannelUtilizationCard (phase-6.0-revamp.md § 7 WP6,
 * deliverable 8).
 *
 * Coverage:
 * - loads and renders on mount at the default range (24h)
 * - switching the range selector re-fetches with the new range
 * - the band selector re-fetches with the selected band
 * - a 409 feature_unavailable renders the unavailable note, not an error
 * - a 5xx (after both GET retries) renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import ChannelUtilizationCard from './ChannelUtilizationCard.svelte';
import { channelUtilizationStore } from '$stores/channelUtilization';
import { server } from '../../../../tests/mocks/server';

describe('ChannelUtilizationCard', () => {
	beforeEach(() => {
		channelUtilizationStore.clear();
		server.use(http.get('/api/eeros', () => HttpResponse.json([])));
	});

	it('loads on mount at the default range (24h)', async () => {
		let seenGranularity: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', ({ request }) => {
				seenGranularity = new URL(request.url).searchParams.get('granularity');
				return HttpResponse.json({ series: [{ channel: 1, utilization: 0.3 }] });
			})
		);

		render(ChannelUtilizationCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(seenGranularity).toBe('5'));
		await waitFor(() => expect(screen.getByText('0.3')).toBeInTheDocument());
	});

	it('re-fetches with the new range when the selector changes', async () => {
		const seenGranularities: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', ({ request }) => {
				seenGranularities.push(new URL(request.url).searchParams.get('granularity') ?? '');
				return HttpResponse.json({ series: [] });
			})
		);

		render(ChannelUtilizationCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(seenGranularities).toContain('5'));

		await fireEvent.click(screen.getByRole('button', { name: '7d' }));

		await waitFor(() => expect(seenGranularities).toContain('60'));
	});

	it('re-fetches with the selected band', async () => {
		const seenBands: (string | null)[] = [];
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', ({ request }) => {
				seenBands.push(new URL(request.url).searchParams.get('band'));
				return HttpResponse.json({ series: [] });
			})
		);

		render(ChannelUtilizationCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(seenBands).toContain(null));

		await fireEvent.change(screen.getByLabelText('Band'), { target: { value: 'band_6GHz' } });

		await waitFor(() => expect(seenBands).toContain('band_6GHz'));
	});

	it('renders the unavailable note — not an error — on a 409 feature_unavailable', async () => {
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ detail: 'not available', type: 'feature_unavailable' }, { status: 409 })
			)
		);

		render(ChannelUtilizationCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(
				screen.getByText('Channel utilisation is not available on this network right now.')
			).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(ChannelUtilizationCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/channel-utilization', () =>
				HttpResponse.json({ series: [{ channel: 6, utilization: 0.7 }] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('0.7')).toBeInTheDocument());
	});
});
