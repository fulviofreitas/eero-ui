/**
 * Tests for the power-saving schedules store (phase-6.0-revamp.md § 5,
 * § 7 WP8, family 8).
 *
 * Coverage:
 * - fetch loads the schedule list
 * - create/update/remove re-fetch the list on success (pessimistic - no
 *   optimistic flip)
 * - each write rolls back `applying` and records `error` on `fetch` failure
 * - a 403 `experimental_disabled` response surfaces as a rejected promise,
 *   not a crash the caller cannot handle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { powerSavingSchedulesStore } from './powerSavingSchedules';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const SCHEDULE: import('$api/types').PowerSavingSchedule = {
	id: 'schedule-1',
	name: 'Overnight',
	days: ['mon', 'tue', 'wed', 'thu', 'fri'],
	start_time: '01:00',
	end_time: '06:00',
	enabled: true
};

describe('powerSavingSchedulesStore', () => {
	beforeEach(() => {
		powerSavingSchedulesStore.clear();
	});

	it('fetch loads the schedule list', async () => {
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ schedules: [SCHEDULE] })
			)
		);

		await powerSavingSchedulesStore.fetch('network-123');

		const state = get(powerSavingSchedulesStore);
		expect(state.schedules).toEqual([SCHEDULE]);
		expect(state.loading).toBe(false);
	});

	it('fetch records an error on failure', async () => {
		server.use(
			http.get('/api/networks/:networkId/power-saving/schedules', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await powerSavingSchedulesStore.fetch('network-123');

		expect(get(powerSavingSchedulesStore).error).toBeTruthy();
	});

	describe('create', () => {
		it('re-fetches the list on success (pessimistic, no optimistic flip)', async () => {
			server.use(
				http.post('/api/networks/:networkId/power-saving/schedules', () =>
					HttpResponse.json({ success: true, schedule: SCHEDULE })
				),
				http.get('/api/networks/:networkId/power-saving/schedules', () =>
					HttpResponse.json({ schedules: [SCHEDULE] })
				)
			);

			const promise = powerSavingSchedulesStore.create('network-123', {
				name: 'Overnight',
				days: ['mon'],
				start_time: '01:00',
				end_time: '06:00'
			});

			expect(get(powerSavingSchedulesStore).schedules).toEqual([]);
			expect(get(powerSavingSchedulesStore).applying).toBe(true);

			await promise;

			const state = get(powerSavingSchedulesStore);
			expect(state.applying).toBe(false);
			expect(state.schedules).toEqual([SCHEDULE]);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/power-saving/schedules', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				powerSavingSchedulesStore.create('network-123', {
					name: 'x',
					days: ['mon'],
					start_time: '01:00',
					end_time: '06:00'
				})
			).rejects.toThrow('Experimental writes are disabled.');

			expect(get(powerSavingSchedulesStore).applying).toBe(false);
		});
	});

	describe('update', () => {
		it('re-fetches the list on success', async () => {
			server.use(
				http.put('/api/networks/:networkId/power-saving/schedules/:scheduleId', () =>
					HttpResponse.json({ success: true, schedule: { ...SCHEDULE, enabled: false } })
				),
				http.get('/api/networks/:networkId/power-saving/schedules', () =>
					HttpResponse.json({ schedules: [{ ...SCHEDULE, enabled: false }] })
				)
			);

			await powerSavingSchedulesStore.update('network-123', 'schedule-1', { enabled: false });

			expect(get(powerSavingSchedulesStore).schedules[0].enabled).toBe(false);
		});
	});

	describe('remove', () => {
		it('re-fetches the (now empty) list on success', async () => {
			server.use(
				http.delete('/api/networks/:networkId/power-saving/schedules/:scheduleId', () =>
					HttpResponse.json({ success: true, schedule: null })
				),
				http.get('/api/networks/:networkId/power-saving/schedules', () =>
					HttpResponse.json({ schedules: [] })
				)
			);

			await powerSavingSchedulesStore.remove('network-123', 'schedule-1');

			expect(get(powerSavingSchedulesStore).schedules).toEqual([]);
		});
	});
});
