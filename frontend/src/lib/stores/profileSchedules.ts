/**
 * Profile Schedules Store
 *
 * A profile's scheduled pauses (phase-6.0-revamp.md § 7 WP7, family 1):
 * `GET/POST/DELETE /profiles/{id}/schedules`, `PUT/DELETE
 * /profiles/{id}/schedules/{schedule_id}`, `POST /profiles/{id}/bedtime`.
 *
 * The list itself is a verified read. Every write (create/update/delete/
 * clear/bedtime) is an unverified, non-settings write (plan § 5): pessimistic
 * (no optimistic flip - the UI shows a per-row/per-action `applying` state
 * and waits for the read-back), gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`
 * server-side, and never retried (`client.ts` passes `retries: 0`). The
 * caller (the card component) is responsible for the `ConfirmDialog` naming
 * "not verified end-to-end" - this store only performs the write and
 * refreshes the list from the read-back.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type {
	BedtimeCreateRequest,
	ProfileSchedule,
	ScheduleCreateRequest,
	ScheduleUpdateRequest
} from '$api/types';

interface ProfileSchedulesState {
	schedules: ProfileSchedule[];
	loading: boolean;
	/** True while any write is in flight - pessimistic, shared per profile. */
	applying: boolean;
	error: string | null;
}

const initialState: ProfileSchedulesState = {
	schedules: [],
	loading: false,
	applying: false,
	error: null
};

function createProfileSchedulesStore() {
	const { subscribe, set, update } = writable<ProfileSchedulesState>(initialState);

	return {
		subscribe,

		async fetch(profileId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const schedules = await api.profiles.getSchedules(profileId);
				update((s) => ({ ...s, schedules, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load schedules'
				}));
			}
		},

		/** Create a scheduled pause. Pessimistic - re-fetches the list on success. */
		async create(profileId: string, body: ScheduleCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.profiles.createSchedule(profileId, body);
				await this.fetch(profileId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Update a scheduled pause. Pessimistic - re-fetches the list on success. */
		async update(
			profileId: string,
			scheduleId: string,
			body: ScheduleUpdateRequest
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.profiles.updateSchedule(profileId, scheduleId, body);
				await this.fetch(profileId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Delete a single scheduled pause. Pessimistic - re-fetches the list on success. */
		async remove(profileId: string, scheduleId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.profiles.deleteSchedule(profileId, scheduleId);
				await this.fetch(profileId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Delete every scheduled pause. Pessimistic - re-fetches the list on success. */
		async clearAll(profileId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.profiles.clearSchedules(profileId);
				await this.fetch(profileId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Bedtime quick-add. Pessimistic - re-fetches the list on success. */
		async createBedtime(profileId: string, body: BedtimeCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.profiles.createBedtime(profileId, body);
				await this.fetch(profileId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Clear store (e.g. on profile switch). */
		clear(): void {
			set(initialState);
		}
	};
}

export const profileSchedulesStore = createProfileSchedulesStore();
