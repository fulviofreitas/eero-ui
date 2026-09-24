/**
 * Tests for NotificationsCard (phase-6.0-revamp.md § 7 WP6, deliverable 13).
 *
 * Coverage:
 * - loads and renders settings (disabled), unread flag and history on mount
 * - a 5xx renders ErrorState with a working retry
 * - "Load older" pages using the last history entry's timestamp as cursor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import NotificationsCard from './NotificationsCard.svelte';
import { notificationsStore } from '$stores/notifications';
import { server } from '../../../../tests/mocks/server';

describe('NotificationsCard', () => {
	beforeEach(() => {
		notificationsStore.clear();
	});

	it('loads and renders settings (disabled), unread flag and history on mount', async () => {
		render(NotificationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());
		expect(screen.getByText('Unread notifications')).toBeInTheDocument();
		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		expect(checkbox.disabled).toBe(true);
		expect(checkbox.checked).toBe(true);
		expect(screen.getByText('New device connected')).toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(NotificationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ settings: {}, has_unread: false })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('All caught up')).toBeInTheDocument());
	});

	it('"Load older" pages using the last history entry timestamp as cursor', async () => {
		let seenTimestamp: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/notifications/history', ({ request }) => {
				const cursor = new URL(request.url).searchParams.get('timestamp');
				if (!cursor) {
					return HttpResponse.json({
						history: [
							{ timestamp: '2026-01-02T00:00:00Z', message: 'newer' },
							{ timestamp: '2026-01-01T00:00:00Z', message: 'older' }
						]
					});
				}
				seenTimestamp = cursor;
				return HttpResponse.json({
					history: [{ timestamp: '2025-12-31T00:00:00Z', message: 'oldest' }]
				});
			})
		);

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('newer')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: /load older/i }));

		await waitFor(() => expect(screen.getByText('oldest')).toBeInTheDocument());
		expect(seenTimestamp).toBe('2026-01-01T00:00:00Z');
	});
});
