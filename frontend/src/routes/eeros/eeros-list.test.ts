/**
 * Tests for the eeros list view after the DataTable migration
 * (phase-6.0-revamp.md § 6.2 Tier 2 / § 7 WP3).
 *
 * The block view is untouched by this migration; these tests target the list view's DataTable:
 * default sort (location asc, per lessons-learned.md's alphabetical house rule), keyboard-driven
 * sort cycling with `aria-sort`, and the empty state. Uses MSW's default 2-eero fixture
 * (Bedroom, Living Room - already alphabetical) from tests/mocks/handlers.ts.
 *
 * The eeros table is row-clickable (`onRowClick`, navigates to the eero detail page), which
 * gives every body `<tr>` an explicit `role="button"` for keyboard accessibility - that
 * intentionally overrides its implicit `row` role, so body rows must be read via `querySelector`
 * rather than `getAllByRole('row')` (which would only ever find the header row).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import Page from './+page.svelte';

function bodyRowFirstCellText() {
	return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
		row.querySelector('.eero-location')?.textContent?.trim()
	);
}

async function renderListView() {
	render(Page);
	await waitFor(() => expect(screen.getByText('Living Room')).toBeInTheDocument());
	await fireEvent.click(screen.getByTitle('List view'));
	await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
}

describe('eeros page - list view', () => {
	beforeEach(() => {
		server.resetHandlers();
	});

	it('defaults to sorting by location ascending', async () => {
		await renderListView();

		const locationHeader = screen.getByRole('columnheader', { name: /^Eero/ });
		expect(locationHeader).toHaveAttribute('aria-sort', 'ascending');
		expect(bodyRowFirstCellText()).toEqual(['Bedroom', 'Living Room']);
	});

	it('cycles aria-sort on the Clients header via keyboard activation', async () => {
		await renderListView();

		const clientsHeader = () => screen.getByRole('columnheader', { name: /^Clients/ });
		const sortButton = () => within(clientsHeader()).getByRole('button');

		expect(clientsHeader()).toHaveAttribute('aria-sort', 'none');

		await fireEvent.click(sortButton());
		expect(clientsHeader()).toHaveAttribute('aria-sort', 'ascending');
		// Bedroom has 3 clients, Living Room has 8 - ascending puts Bedroom first.
		expect(bodyRowFirstCellText()).toEqual(['Bedroom', 'Living Room']);

		await fireEvent.click(sortButton());
		expect(clientsHeader()).toHaveAttribute('aria-sort', 'descending');
		expect(bodyRowFirstCellText()).toEqual(['Living Room', 'Bedroom']);
	});

	it('shows an empty state when there are no eero nodes', async () => {
		server.use(http.get('/api/eeros', () => HttpResponse.json([])));
		render(Page);

		await waitFor(() => expect(screen.getByText('No eero nodes found.')).toBeInTheDocument());
	});

	// Skeleton-first loading (phase-6.0-revamp.md § 6.1/6.2 Tier 3, WP9).
	it('shows a table-rows skeleton, not the empty state, before the first fetch resolves', async () => {
		server.use(
			http.get('/api/eeros', async () => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				return HttpResponse.json([
					{
						id: 'eero-1',
						url: '/eeros/eero-1',
						serial: 'SERIAL1',
						mac_address: 'AA:BB:CC:00:00:01',
						model: 'eero Pro 6E',
						status: 'green',
						location: 'Living Room',
						is_gateway: true,
						is_primary: true,
						connected_clients_count: 8,
						firmware_version: '7.0.0',
						ip_address: '192.168.1.1',
						mesh_quality_bars: 4,
						led_on: true,
						wired: true
					}
				]);
			})
		);

		render(Page);

		expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		expect(screen.queryByText('No eero nodes found.')).toBeNull();

		await waitFor(() => expect(screen.getByText('Living Room')).toBeInTheDocument());
		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
	});

	it('keeps showing existing eeros while a manual refresh is in flight', async () => {
		await renderListView();
		expect(screen.getByText('Living Room')).toBeInTheDocument();

		let resolveRefetch: (() => void) | undefined;
		server.use(
			http.get('/api/eeros', () => {
				return new Promise((resolve) => {
					resolveRefetch = () =>
						resolve(
							HttpResponse.json([
								{
									id: 'eero-1',
									url: '/eeros/eero-1',
									serial: 'SERIAL1',
									mac_address: 'AA:BB:CC:00:00:01',
									model: 'eero Pro 6E',
									status: 'green',
									location: 'Living Room',
									is_gateway: true,
									is_primary: true,
									connected_clients_count: 8,
									firmware_version: '7.0.0',
									ip_address: '192.168.1.1',
									mesh_quality_bars: 4,
									led_on: true,
									wired: true
								}
							])
						);
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

		expect(screen.getByText('Living Room')).toBeInTheDocument();
		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();

		resolveRefetch?.();
		await waitFor(() => expect(screen.getByText('Living Room')).toBeInTheDocument());
	});
});
