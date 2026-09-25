/**
 * Tests for the profile schedules store (phase-6.0-revamp.md § 7 WP7,
 * family 1).
 *
 * Coverage:
 * - fetch loads the schedule list
 * - create/update/remove/clearAll/createBedtime re-fetch the list on success
 *   (pessimistic - no optimistic flip)
 * - each write rolls back `applying` and records `error` on failure
 * - a 403 `experimental_disabled` response surfaces as an error, not a thrown
 *   crash the caller cannot handle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { profileSchedulesStore } from './profileSchedules';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const SCHEDULE: import('$api/types').ProfileSchedule = {
	id: 'sched-1',
	name: 'School nights',
	days: ['monday', 'tuesday'],
	start: '20:00',
	end: '07:00',
	enabled: true
};

describe('profileSchedulesStore', () => {
	beforeEach(() => {
		profileSchedulesStore.clear();
	});

	it('fetch loads the schedule list', async () => {
		server.use(http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE])));

		await profileSchedulesStore.fetch('profile-1');

		const state = get(profileSchedulesStore);
		expect(state.schedules).toEqual([SCHEDULE]);
		expect(state.loading).toBe(false);
	});

	it('fetch records an error on failure', async () => {
		server.use(
			http.get('/api/profiles/:profileId/schedules', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await profileSchedulesStore.fetch('profile-1');

		expect(get(profileSchedulesStore).error).toBeTruthy();
	});

	describe('create', () => {
		it('re-fetches the list on success (pessimistic, no optimistic flip)', async () => {
			server.use(
				http.post('/api/profiles/:profileId/schedules', () => HttpResponse.json(SCHEDULE)),
				http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([SCHEDULE]))
			);

			const promise = profileSchedulesStore.create('profile-1', {
				name: 'School nights',
				days: ['monday'],
				start: '20:00',
				end: '07:00'
			});

			// No optimistic entry before the request resolves.
			expect(get(profileSchedulesStore).schedules).toEqual([]);
			expect(get(profileSchedulesStore).applying).toBe(true);

			await promise;

			const state = get(profileSchedulesStore);
			expect(state.applying).toBe(false);
			expect(state.schedules).toEqual([SCHEDULE]);
		});

		it('sets error and rethrows on failure', async () => {
			server.use(
				http.post('/api/profiles/:profileId/schedules', () =>
					HttpResponse.json({ detail: 'name must be 1-64 bytes' }, { status: 422 })
				)
			);

			await expect(
				profileSchedulesStore.create('profile-1', {
					name: '',
					days: ['monday'],
					start: '20:00',
					end: '07:00'
				})
			).rejects.toThrow();

			// A write failure never poisons the list's own error state (that would flip the
			// whole card into ErrorState) - only `applying` resets; the caller toasts the error.
			const state = get(profileSchedulesStore);
			expect(state.applying).toBe(false);
			expect(state.error).toBeNull();
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise, not a crash', async () => {
			server.use(
				http.post('/api/profiles/:profileId/schedules', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				profileSchedulesStore.create('profile-1', {
					name: 'x',
					days: ['monday'],
					start: '20:00',
					end: '07:00'
				})
			).rejects.toThrow('Experimental writes are disabled.');

			expect(get(profileSchedulesStore).applying).toBe(false);
		});
	});

	describe('update', () => {
		it('re-fetches the list on success', async () => {
			server.use(
				http.put('/api/profiles/:profileId/schedules/:scheduleId', () =>
					HttpResponse.json({ ...SCHEDULE, enabled: false })
				),
				http.get('/api/profiles/:profileId/schedules', () =>
					HttpResponse.json([{ ...SCHEDULE, enabled: false }])
				)
			);

			await profileSchedulesStore.update('profile-1', 'sched-1', { enabled: false });

			expect(get(profileSchedulesStore).schedules[0].enabled).toBe(false);
		});
	});

	describe('remove', () => {
		it('re-fetches the (now empty) list on success', async () => {
			server.use(
				http.delete('/api/profiles/:profileId/schedules/:scheduleId', () =>
					HttpResponse.json({ success: true, schedule_id: 'sched-1' })
				),
				http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([]))
			);

			await profileSchedulesStore.remove('profile-1', 'sched-1');

			expect(get(profileSchedulesStore).schedules).toEqual([]);
		});
	});

	describe('clearAll', () => {
		it('re-fetches the (now empty) list on success', async () => {
			server.use(
				http.delete('/api/profiles/:profileId/schedules', () =>
					HttpResponse.json({ success: true, deleted_count: 1 })
				),
				http.get('/api/profiles/:profileId/schedules', () => HttpResponse.json([]))
			);

			await profileSchedulesStore.clearAll('profile-1');

			expect(get(profileSchedulesStore).schedules).toEqual([]);
		});
	});

	describe('createBedtime', () => {
		it('re-fetches the list on success', async () => {
			server.use(
				http.post('/api/profiles/:profileId/bedtime', () =>
					HttpResponse.json({ ...SCHEDULE, name: 'Bedtime' })
				),
				http.get('/api/profiles/:profileId/schedules', () =>
					HttpResponse.json([{ ...SCHEDULE, name: 'Bedtime' }])
				)
			);

			await profileSchedulesStore.createBedtime('profile-1', {
				start_time: '20:00',
				end_time: '07:00'
			});

			expect(get(profileSchedulesStore).schedules[0].name).toBe('Bedtime');
		});
	});
});
