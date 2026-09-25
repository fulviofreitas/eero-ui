/**
 * Power Saving Schedules Store
 *
 * A network's power-saving schedules (phase-6.0-revamp.md § 5, § 7 WP8,
 * family 8): `GET/POST /networks/{id}/power-saving/schedules`, `PUT/DELETE
 * /networks/{id}/power-saving/schedules/{schedule_id}`.
 *
 * These are deliberately NOT settings-class (unlike the power-saving
 * enable/schedule_enabled toggle itself, which lives in `securityWan.ts`
 * under `withSettingsLock`): their own sub-resource, no documented reboot
 * behaviour. Same policy as `profileSchedules.ts` - the list itself is a
 * verified read; every write (create/update/delete) is an unverified,
 * non-settings write (plan § 5): pessimistic, gated on
 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side, never retried
 * (`client.ts` passes `retries: 0`). The caller (the card component) is
 * responsible for the `ConfirmDialog` naming "not verified end-to-end" -
 * this store only performs the write and refreshes the list from the
 * read-back.
 */

import { writable } from 'svelte/store';
import { api } from '$api/client';
import type {
	PowerSavingSchedule,
	PowerSavingScheduleCreateRequest,
	PowerSavingScheduleUpdateRequest
} from '$api/types';

interface PowerSavingSchedulesState {
	schedules: PowerSavingSchedule[];
	loading: boolean;
	/** True while any write is in flight - pessimistic, shared per network. */
	applying: boolean;
	error: string | null;
}

const initialState: PowerSavingSchedulesState = {
	schedules: [],
	loading: false,
	applying: false,
	error: null
};

function createPowerSavingSchedulesStore() {
	const { subscribe, set, update } = writable<PowerSavingSchedulesState>(initialState);

	return {
		subscribe,

		async fetch(networkId: string): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const schedules = await api.networks.getPowerSavingSchedules(networkId);
				update((s) => ({ ...s, schedules, loading: false }));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load power-saving schedules'
				}));
			}
		},

		/** Create a power-saving schedule. Pessimistic - re-fetches the list on success. */
		async create(networkId: string, body: PowerSavingScheduleCreateRequest): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.createPowerSavingSchedule(networkId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Update a power-saving schedule. Pessimistic - re-fetches the list on success. */
		async update(
			networkId: string,
			scheduleId: string,
			body: PowerSavingScheduleUpdateRequest
		): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.updatePowerSavingSchedule(networkId, scheduleId, body);
				await this.fetch(networkId);
			} finally {
				update((s) => ({ ...s, applying: false }));
			}
		},

		/** Delete a power-saving schedule. Pessimistic - re-fetches the list on success. */
		async remove(networkId: string, scheduleId: string): Promise<void> {
			update((s) => ({ ...s, applying: true, error: null }));
			try {
				await api.networks.deletePowerSavingSchedule(networkId, scheduleId);
				await this.fetch(networkId);
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

export const powerSavingSchedulesStore = createPowerSavingSchedulesStore();
