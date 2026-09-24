/**
 * Tests for BackupInternetCard (phase-6.0-revamp.md § 7 WP6, deliverable 11).
 *
 * Coverage:
 * - loads and renders status and access points on mount
 * - a 402 renders the premium upsell note, not an error
 * - a 5xx renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import BackupInternetCard from './BackupInternetCard.svelte';
import { backupInternetStore } from '$stores/backupInternet';
import { server } from '../../../../tests/mocks/server';

describe('BackupInternetCard', () => {
	beforeEach(() => {
		backupInternetStore.clear();
	});

	it('loads and renders status and access points on mount', async () => {
		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('Backup-5G')).toBeInTheDocument());
		expect(screen.getByText('Enabled', { selector: '.badge' })).toBeInTheDocument();
	});

	it('renders the premium upsell note — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Backup internet requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(BackupInternetCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/backup-internet', () =>
				HttpResponse.json({ enabled: false, cellular_usage: null, cellular_events: [] })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
	});
});
