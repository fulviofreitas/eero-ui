/**
 * Tests for MembersCard (phase-6.0-revamp.md § 7 WP6, deliverable 10).
 *
 * Coverage:
 * - loads and renders role, permissions, members and invites on mount
 * - the partial note renders when any one source reports partial:true
 * - a 5xx renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import MembersCard from './MembersCard.svelte';
import { membersStore } from '$stores/members';
import { server } from '../../../../tests/mocks/server';

describe('MembersCard', () => {
	beforeEach(() => {
		membersStore.clear();
	});

	it('loads and renders role, permissions, members and invites on mount', async () => {
		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getAllByText('owner').length).toBeGreaterThan(0));
		expect(screen.getByText('can_manage_devices')).toBeInTheDocument();
		expect(screen.getByText('Alice')).toBeInTheDocument();
		expect(screen.getByText('pending')).toBeInTheDocument();
	});

	it('renders the partial note when any one source reports partial:true', async () => {
		server.use(
			http.get('/api/networks/:networkId/invites', () =>
				HttpResponse.json({ invites: [], partial: true })
			)
		);

		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Some data unavailable for this account.')).toBeInTheDocument()
		);
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/permissions', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(MembersCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/permissions', () =>
				HttpResponse.json({ permissions: {}, role: 'recovered', partial: false })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('recovered')).toBeInTheDocument());
	});
});
