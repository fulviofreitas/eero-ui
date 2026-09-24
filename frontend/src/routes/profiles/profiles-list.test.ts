/**
 * Tests for the profiles list view after the DataTable migration
 * (phase-6.0-revamp.md § 6.2 Tier 2 / § 7 WP3).
 *
 * MSW's default fixture (tests/mocks/handlers.ts) returns profiles in API order "Kids", "Guests"
 * - deliberately non-alphabetical, so a passing default-sort assertion proves DataTable (not the
 * fixture) is doing the sorting, per lessons-learned.md's alphabetical-by-name house rule.
 *
 * The profiles table is row-clickable (`onRowClick`, navigates to the profile detail page),
 * which gives every body `<tr>` an explicit `role="button"` for keyboard accessibility - that
 * intentionally overrides its implicit `row` role, so body rows must be read via
 * `querySelector` rather than `getAllByRole('row')` (which would only ever find the header row).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import Page from './+page.svelte';

function bodyRowFirstCellText() {
	return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
		row.querySelector('td')?.textContent?.trim()
	);
}

async function renderListView() {
	render(Page);
	await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
	await fireEvent.click(screen.getByTitle('List view'));
	await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
}

describe('profiles page - list view', () => {
	beforeEach(() => {
		server.resetHandlers();
	});

	it('defaults to sorting by name ascending', async () => {
		await renderListView();

		const nameHeader = screen.getByRole('columnheader', { name: /^Profile/ });
		expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
		// API order is Kids, Guests - ascending-by-name flips it to Guests, Kids.
		expect(bodyRowFirstCellText()).toEqual(['Guests', 'Kids']);
	});

	it('cycles aria-sort on the Devices header via keyboard activation', async () => {
		await renderListView();

		const devicesHeader = () => screen.getByRole('columnheader', { name: /^Devices/ });
		const sortButton = () => within(devicesHeader()).getByRole('button');

		expect(devicesHeader()).toHaveAttribute('aria-sort', 'none');

		await fireEvent.click(sortButton());
		expect(devicesHeader()).toHaveAttribute('aria-sort', 'ascending');
		// Guests has 0 devices, Kids has 3 - ascending puts Guests first.
		expect(bodyRowFirstCellText()).toEqual(['Guests', 'Kids']);

		await fireEvent.click(sortButton());
		expect(devicesHeader()).toHaveAttribute('aria-sort', 'descending');
		expect(bodyRowFirstCellText()).toEqual(['Kids', 'Guests']);
	});

	it('shows an empty state when there are no profiles', async () => {
		server.use(http.get('/api/profiles', () => HttpResponse.json([])));
		render(Page);

		await waitFor(() => expect(screen.getByText('No profiles found.')).toBeInTheDocument());
	});
});
