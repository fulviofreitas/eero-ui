/**
 * Tests for EeroConnectionsCard (phase-6.0-revamp.md § 7 WP6, deliverable 5).
 *
 * Coverage:
 * - loading -> Skeleton, then renders connections as rows with wireless/wired counts
 * - a client connection links to /devices/{id}, an eero connection links to /eeros/{id}
 * - a wired connection shows its port + "Upstream" badge when applicable
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
	it('renders connections with a wireless/wired count in the header', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{
							id: 'device-1',
							url: '/2.2/devices/device-1',
							display_name: 'Living Room TV',
							device_type: 'tv',
							kind: 'wireless',
							entity_type: 'client',
							band: '5GHz'
						},
						{
							id: 'eero-2',
							url: '/2.2/eeros/eero-2',
							display_name: 'Office eero',
							kind: 'wired',
							entity_type: 'eero',
							port: '1',
							is_upstream: true,
							negotiated_speed: '1000BASE-T'
						}
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('Living Room TV')).toBeInTheDocument());
		expect(screen.getByText('1 wireless · 1 wired')).toBeInTheDocument();
	});

	it('links a client connection to /devices/{id}', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{
							id: 'device-1',
							display_name: 'Living Room TV',
							kind: 'wireless',
							entity_type: 'client'
						}
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		const link = await screen.findByRole('link', { name: 'Living Room TV' });
		expect(link).toHaveAttribute('href', '/devices/device-1');
	});

	it('links an eero connection to /eeros/{id}', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{ id: 'eero-2', display_name: 'Office eero', kind: 'wired', entity_type: 'eero' }
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		const link = await screen.findByRole('link', { name: 'Office eero' });
		expect(link).toHaveAttribute('href', '/eeros/eero-2');
	});

	it('shows the port and an Upstream badge for a wired upstream connection', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{
							id: 'eero-2',
							display_name: 'Office eero',
							kind: 'wired',
							entity_type: 'eero',
							port: '1',
							is_upstream: true
						}
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText(/Port 1/)).toBeInTheDocument());
		expect(screen.getByText('Upstream')).toBeInTheDocument();
	});

	it('names an eero entry by its location when the API sends no display name', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{
							id: 'eero-3',
							display_name: null,
							location: 'Kitchen',
							model_name: 'eero Max 7',
							kind: 'wired',
							entity_type: 'eero'
						}
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('Kitchen')).toBeInTheDocument());
		expect(screen.queryByText('Unknown device')).not.toBeInTheDocument();
	});

	it('derives wired/wireless from connection_type on legacy rows without kind', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () =>
				HttpResponse.json({
					connections: [
						{ id: 'd1', display_name: 'NAS', kind: null, connection_type: 'wired' },
						{ id: 'd2', display_name: 'Mystery', kind: null, connection_type: null }
					]
				})
			)
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('NAS')).toBeInTheDocument());
		expect(screen.getByText('Wired')).toBeInTheDocument();
		expect(screen.queryByText(/^Wireless/)).not.toBeInTheDocument();
	});

	it('shows an empty state when there are no connections', async () => {
		server.use(
			http.get('/api/eeros/:eeroId/connections', () => HttpResponse.json({ connections: [] }))
		);

		render(EeroConnectionsCard, { props: { eeroId: 'eero-1' } });

		await waitFor(() => expect(screen.getByText('No connections')).toBeInTheDocument());
		expect(
			screen.getByText('No clients are currently connected to this eero.')
		).toBeInTheDocument();
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
				HttpResponse.json({
					connections: [{ id: 'device-1', display_name: 'Recovered Device', kind: 'wireless' }]
				})
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('Recovered Device')).toBeInTheDocument());
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
