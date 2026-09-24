/**
 * Tests for EeroConnectionsCard (phase-6.0-revamp.md § 7 WP6, deliverable 5).
 *
 * Coverage:
 * - loading -> Skeleton, then renders connections via GenericRecordList
 * - empty connections list -> EmptyState
 * - error -> ErrorState with a working retry
 * - a 409 feature_unavailable response renders an inline note, not an error
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import EeroConnectionsCard from './EeroConnectionsCard.svelte';
import { server } from '../../../../tests/mocks/server';

describe('EeroConnectionsCard', () => {
	it('renders connections once loaded', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({ connections: [{ mac: 'AA:BB:CC:DD:EE:01', band: '5GHz' }] })
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('AA:BB:CC:DD:EE:01')).toBeInTheDocument());
		expect(screen.getByText('5GHz')).toBeInTheDocument();
	});

	it('shows an empty state when there are no connections', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () => HttpResponse.json({ connections: [] }))
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('No connections')).toBeInTheDocument());
	});

	it('shows an error state with a working retry on failure', async () => {
		// GETs auto-retry twice on 5xx (client.ts) before the component surfaces
		// an error, so every attempt must fail here for the initial load to
		// land on the error state at all.
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), {
			timeout: 5000
		});

		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({ connections: [{ mac: 'AA:BB:CC:DD:EE:02' }] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('AA:BB:CC:DD:EE:02')).toBeInTheDocument());
	});

	it('renders an inline note (not an error) on a 409 feature_unavailable response', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json(
					{ detail: 'Not available right now.', type: 'feature_unavailable' },
					{ status: 409 }
				)
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() =>
			expect(screen.getByText(/not available on this eero right now/i)).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});
});
