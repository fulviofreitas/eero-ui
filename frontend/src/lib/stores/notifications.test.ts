/**
 * Tests for the notifications store (phase-6.0-revamp.md § 7 WP6,
 * deliverable 13).
 *
 * Coverage:
 * - fetch loads settings/unread and the first history page
 * - a 5xx is recorded as error
 * - loadMore appends older history using the last entry's timestamp as cursor
 * - clear resets to the initial state
 * - updateSettings (phase-6.0-revamp.md § 7 WP7, family 3) sends the full
 *   settings map and applies the read-back; detects a no-op by comparing
 *   requested keys against what it already had (the backend response
 *   carries no top-level `changed` flag for this route)
 * - markRead clears `hasUnread` on success
 * - a 403 experimental_disabled response surfaces as a rejected promise
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { notificationsStore } from './notifications';
import { server } from '../../../tests/mocks/server';

function historyEntries(n: number, offset = 0) {
	return Array.from({ length: n }, (_, i) => ({
		timestamp: new Date(Date.now() - (i + offset) * 60 * 60 * 1000).toISOString(),
		message: `Entry ${i + offset}`
	}));
}

describe('notificationsStore', () => {
	beforeEach(() => {
		notificationsStore.clear();
	});

	it('loads settings/unread and the first history page', async () => {
		await notificationsStore.fetch('network-123');

		const state = get(notificationsStore);
		expect(state.settings.device_connected).toBe(true);
		expect(state.hasUnread).toBe(true);
		expect(state.history).toHaveLength(2);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 5xx as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await notificationsStore.fetch('network-123');

		const state = get(notificationsStore);
		expect(state.error).toBeTruthy();
	});

	it('loadMore appends older history using the last entry timestamp as cursor', async () => {
		let seenTimestamp: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ settings: {}, has_unread: false })
			),
			http.get('/api/networks/:networkId/notifications/history', ({ request }) => {
				const cursor = new URL(request.url).searchParams.get('timestamp');
				if (!cursor) {
					return HttpResponse.json({ history: historyEntries(2, 0) });
				}
				seenTimestamp = cursor;
				return HttpResponse.json({ history: historyEntries(2, 10) });
			})
		);

		await notificationsStore.fetch('network-123');
		const firstPage = get(notificationsStore).history;
		expect(firstPage).toHaveLength(2);

		await notificationsStore.loadMore('network-123');

		expect(seenTimestamp).toBe(firstPage[firstPage.length - 1].timestamp);
		const state = get(notificationsStore);
		expect(state.history).toHaveLength(4);
		expect(state.loadingMore).toBe(false);
	});

	it('clear resets to the initial state', async () => {
		await notificationsStore.fetch('network-123');
		expect(get(notificationsStore).history).toHaveLength(2);

		notificationsStore.clear();

		const state = get(notificationsStore);
		expect(state.history).toEqual([]);
		expect(state.hasMore).toBe(true);
	});

	describe('updateSettings', () => {
		it('returns true and applies the read-back when a requested key differs', async () => {
			await notificationsStore.fetch('network-123');

			const changed = await notificationsStore.updateSettings('network-123', {
				device_connected: true,
				device_disconnected: true
			});

			expect(changed).toBe(true);
			expect(get(notificationsStore).settings.device_disconnected).toBe(true);
			expect(get(notificationsStore).applying).toBe(false);
		});

		it('returns false when every requested key already matched', async () => {
			await notificationsStore.fetch('network-123');

			const changed = await notificationsStore.updateSettings('network-123', {
				device_connected: true
			});

			expect(changed).toBe(false);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.put('/api/networks/:networkId/notifications', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				notificationsStore.updateSettings('network-123', { device_connected: false })
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(notificationsStore).applying).toBe(false);
		});
	});

	describe('markRead', () => {
		it('clears hasUnread on success', async () => {
			await notificationsStore.fetch('network-123');
			expect(get(notificationsStore).hasUnread).toBe(true);

			await notificationsStore.markRead('network-123');

			expect(get(notificationsStore).hasUnread).toBe(false);
			expect(get(notificationsStore).applying).toBe(false);
		});
	});
});
