/**
 * Tests for the profile-devices table after the DataTable migration
 * (phase-6.0-revamp.md § 6.2 Tier 2 / § 7 WP3).
 *
 * `$app/stores`'s `page` is mocked here to supply a route param, since the shared stub in
 * tests/mocks/app-stores.ts always resolves `params` to `{}` (see that file's own comment).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../tests/mocks/server';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/profiles/profile-1'),
		params: { id: 'profile-1' },
		route: { id: '/profiles/[id]' },
		status: 200,
		error: null,
		data: {},
		form: null
	})
}));

const baseDevices = [
	{
		id: 'dev-1',
		url: '/devices/dev-1',
		mac: 'AA:BB:CC:00:00:01',
		ip: '10.0.5.10',
		nickname: null,
		hostname: 'zulu-laptop',
		display_name: 'Zulu Laptop',
		manufacturer: 'Acme',
		connected: true,
		wireless: true,
		paused: false
	},
	{
		id: 'dev-2',
		url: '/devices/dev-2',
		mac: 'AA:BB:CC:00:00:02',
		ip: '10.0.5.20',
		nickname: null,
		hostname: 'alpha-phone',
		display_name: 'Alpha Phone',
		manufacturer: 'Acme',
		connected: false,
		wireless: true,
		paused: true
	}
];

async function importPage() {
	return (await import('./+page.svelte')).default;
}

// R2 (WP5 reviewer fix): the row no longer carries `onRowClick`/`role="button"` - a nested
// <button> (the device-name link) inside an interactive row is invalid a11y. Body rows are
// still read via `querySelector` (not `getAllByRole('row')`) purely because that's simplest
// given the existing helper shape, not because of any residual role override.
function bodyRowFirstCellText() {
	return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
		row.querySelector('.device-name-link')?.textContent?.trim()
	);
}

describe('profile detail page - devices list view', () => {
	beforeEach(() => {
		server.resetHandlers();
		server.use(
			http.get('/api/profiles/:profileId', ({ params }) =>
				HttpResponse.json({
					id: params.profileId,
					url: `/profiles/${params.profileId}`,
					name: 'Kids',
					paused: false,
					device_count: 2,
					device_ids: ['dev-1', 'dev-2'],
					devices: baseDevices
				})
			)
		);
	});

	async function renderListView() {
		const Page = await importPage();
		render(Page);
		await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
		await fireEvent.click(screen.getByTitle('List view'));
		await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
	}

	// 15s timeout (default 5s): the profile detail page now also pulls in
	// InsightsCard/DataUsageMiniCard (phase-6.0-revamp.md § 7 WP6, deliverable
	// 6/7), which transitively load Chart.js - the first cold transform of
	// that tree inside this test's dynamic `importPage()` can exceed 5s.
	it('defaults to sorting by name ascending', async () => {
		await renderListView();

		const nameHeader = screen.getByRole('columnheader', { name: /^Device/ });
		expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
		// API order is Zulu, Alpha - ascending-by-name flips it to Alpha, Zulu.
		expect(bodyRowFirstCellText()).toEqual(['Alpha Phone', 'Zulu Laptop']);
	}, 15000);

	it('shows an empty state when the profile has no devices', async () => {
		server.use(
			http.get('/api/profiles/:profileId', ({ params }) =>
				HttpResponse.json({
					id: params.profileId,
					url: `/profiles/${params.profileId}`,
					name: 'Guests',
					paused: false,
					device_count: 0,
					device_ids: [],
					devices: []
				})
			)
		);

		const Page = await importPage();
		render(Page);

		await waitFor(() =>
			expect(screen.getByText('No devices found for this profile.')).toBeInTheDocument()
		);
	}, 15000);
});
