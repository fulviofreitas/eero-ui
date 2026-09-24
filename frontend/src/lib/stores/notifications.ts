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
 * Editing `settings` (`PUT /networks/{id}/notifications`) and marking
 * notifications read (`POST .../notifications/mark-read`) are unverified,
 * non-settings writes (phase-6.0-revamp.md § 7 WP7, family 3, plan § 5):
 * pessimistic, gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side,
 * never retried (`client.ts` passes `retries: 0`), re-read on success. The
 * settings write's own response carries no top-level `changed` flag (unlike
 * `updateDdns`/`updateBackupInternet`) - `updateSettings` below detects a
 * no-op by comparing the requested keys against what it already had.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';

interface NotificationsState {
	settings: Record<string, boolean>;
	hasUnread: boolean | null;
	history: Record<string, unknown>[];
	loading: boolean;
	loadingMore: boolean;
	/** True while a settings write or mark-read is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
	/** `false` once a page comes back with no timestamp to page further on. */
	hasMore: boolean;
	/**
	 * Incremented after every `updateSettings` attempt (success or failure).
	 * A checkbox's native DOM `checked` state flips on click before the
	 * confirm/write round trip resolves; if the requested value turns out to
	 * equal what the store already had (a no-op, or a failed write that
	 * left `settings` unchanged), a plain `checked={enabled}` binding never
	 * re-assigns the DOM property, leaving the checkbox visually wrong. The
	 * card includes this counter in its `{#each}` key to force a fresh
	 * `<input>` after every attempt, regardless of whether the value itself
	 * changed.
	 */
	revision: number;
}

const initialState: NotificationsState = {
	settings: {},
	hasUnread: null,
	history: [],
	loading: false,
	loadingMore: false,
	applying: false,
	error: null,
	hasMore: true,
	revision: 0
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

		/**
		 * Update the network's notification settings. Pessimistic - sends the
		 * full settings map (read-first from the store, merged with the
		 * caller's change) and applies the read-back on success. Returns
		 * `true` when any requested key actually differed from what the
		 * store already had, `false` for a no-op.
		 */
		async updateSettings(networkId: string, settings: Record<string, boolean>): Promise<boolean> {
			let previous: Record<string, boolean> = {};
			update((s) => {
				previous = s.settings;
				return { ...s, applying: true, error: null };
			});
			try {
				const result = await api.networks.updateNotificationSettings(networkId, settings);
				const changed = Object.entries(settings).some(([key, value]) => previous[key] !== value);
				update((s) => ({
					...s,
					settings: result.settings,
					hasUnread: result.has_unread ?? s.hasUnread
				}));
				return changed;
			} finally {
				update((s) => ({ ...s, applying: false, revision: s.revision + 1 }));
			}
		},

		/** Mark the network's notifications read. Pessimistic - clears `hasUnread` on success. */
		async markRead(networkId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.markNotificationsRead(networkId);
				update((s) => ({ ...s, hasUnread: false }));
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Clear store (e.g. on network switch / logout). */
		clear(): void {
			set(initialState);
		}
	};
}

export const notificationsStore = createNotificationsStore();
