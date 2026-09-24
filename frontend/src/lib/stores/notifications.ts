/**
 * Notifications Store
 *
 * Notification settings, the unread flag, and paginated history for a
 * network (phase-6.0-revamp.md § 7 WP6, deliverable 13: `GET
 * /networks/{id}/notifications` and `/notifications/history`). Single
 * per-network store (Advanced tab only mounts one at a time). "Load older"
 * pagination mirrors `events.ts`'s cursor pattern: the last-loaded history
 * entry's own timestamp field is passed as the next page's cursor.
 *
 * Editing `settings` (`PUT /networks/{id}/notifications`) is gated behind
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` and lands in WP7 - this store only
 * reads.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';

interface NotificationsState {
	settings: Record<string, boolean>;
	hasUnread: boolean | null;
	history: Record<string, unknown>[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	/** `false` once a page comes back with no timestamp to page further on. */
	hasMore: boolean;
}

const initialState: NotificationsState = {
	settings: {},
	hasUnread: null,
	history: [],
	loading: false,
	loadingMore: false,
	error: null,
	hasMore: true
};

/** Best-effort extraction of a history entry's own timestamp field, mirroring `events.ts`. */
function timestampOf(entry: Record<string, unknown>): string | null {
	const value = entry.timestamp ?? entry.time ?? entry.created_at;
	return typeof value === 'string' ? value : null;
}

function createNotificationsStore() {
	const { subscribe, set, update } = writable<NotificationsState>(initialState);

	return {
		subscribe,

		/** Fetch settings/unread and the first history page, replacing any previous state. */
		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [notifications, history] = await Promise.all([
					api.networks.getNotifications(networkId),
					api.networks.getNotificationHistory(networkId)
				]);
				const last = history.history[history.history.length - 1];
				update((s) => ({
					...s,
					settings: notifications.settings,
					hasUnread: notifications.has_unread,
					history: history.history,
					loading: false,
					hasMore: history.history.length > 0 && !!(last && timestampOf(last))
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load notifications'
				}));
			}
		},

		/** Load the next (older) history page, appending to `history`. */
		async loadMore(networkId: string): Promise<void> {
			let cursor: string | null = null;
			update((s) => {
				const last = s.history[s.history.length - 1];
				cursor = last ? timestampOf(last) : null;
				return { ...s, loadingMore: true, error: null };
			});
			if (!cursor) {
				update((s) => ({ ...s, loadingMore: false, hasMore: false }));
				return;
			}
			try {
				const result = await api.networks.getNotificationHistory(networkId, { timestamp: cursor });
				const last = result.history[result.history.length - 1];
				update((s) => ({
					...s,
					history: [...s.history, ...result.history],
					loadingMore: false,
					hasMore: result.history.length > 0 && !!(last && timestampOf(last))
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loadingMore: false,
					error: error instanceof Error ? error.message : 'Failed to load older notifications'
				}));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const notificationsStore = createNotificationsStore();
