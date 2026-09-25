/**
 * Tests for EventsCard (phase-6.0-revamp.md § 7 WP6, deliverable 8).
 *
 * Coverage:
 * - loads and renders events on mount
 * - a 409 feature_unavailable renders the unavailable note, not an error
 * - a 5xx (after both GET retries) renders ErrorState with a working retry
 * - "Load older" pages using the last event's timestamp as cursor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import EventsCard from './EventsCard.svelte';
import { eventsStore } from '$stores/events';
import { server } from '../../../../tests/mocks/server';

describe('EventsCard', () => {
	beforeEach(() => {
		eventsStore.clear();
	});

	it('loads and renders events on mount', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({
					events: [{ timestamp: '2026-01-02T00:00:00Z', type: 'device_connected' }]
				})
			)
		);

		render(EventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());
	});

	it('renders the unavailable note — not an error — on a 409 feature_unavailable', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({ detail: 'not available', type: 'feature_unavailable' }, { status: 409 })
			)
		);

		render(EventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(
				screen.getByText('Events are not available on this network right now.')
			).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(EventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/events', () =>
				HttpResponse.json({ events: [{ timestamp: '2026-01-01T00:00:00Z', type: 'recovered' }] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('recovered')).toBeInTheDocument());
	});

	it('"Load older" pages using the last event timestamp as cursor', async () => {
		let seenTimestamp: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/events', ({ request }) => {
				const cursor = new URL(request.url).searchParams.get('timestamp');
				if (!cursor) {
					return HttpResponse.json({
						events: [
							{ timestamp: '2026-01-02T00:00:00Z', type: 'newer' },
							{ timestamp: '2026-01-01T00:00:00Z', type: 'older' }
						]
					});
				}
				seenTimestamp = cursor;
				return HttpResponse.json({
					events: [{ timestamp: '2025-12-31T00:00:00Z', type: 'oldest' }]
				});
			})
		);

		render(EventsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('newer')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: /load older/i }));

		await waitFor(() => expect(screen.getByText('oldest')).toBeInTheDocument());
		expect(seenTimestamp).toBe('2026-01-01T00:00:00Z');
	});
});
