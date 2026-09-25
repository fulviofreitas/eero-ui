/**
 * Tests for the forwards & reservations store (phase-6.0-revamp.md § 7 WP7,
 * family 8).
 *
 * Coverage:
 * - fetch loads forwards and reservations together
 * - a 5xx on either call records error
 * - clear resets to the initial state
 * - create/update/delete (either resource) re-fetch both lists on success
 *   (pessimistic - no optimistic flip)
 * - a 403 experimental_disabled response surfaces as a rejected promise
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { forwardsReservationsStore } from './forwardsReservations';
import { server } from '../../../tests/mocks/server';

describe('forwardsReservationsStore', () => {
	beforeEach(() => {
		forwardsReservationsStore.clear();
	});

	it('loads forwards and reservations together', async () => {
		await forwardsReservationsStore.fetch('network-123');

		const state = get(forwardsReservationsStore);
		expect(state.forwards).toHaveLength(1);
		expect(state.reservations).toHaveLength(1);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('records a 5xx on either call as error', async () => {
		server.use(
			http.get('/api/networks/:networkId/forwards', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await forwardsReservationsStore.fetch('network-123');

		expect(get(forwardsReservationsStore).error).toBeTruthy();
	});

	it('clear resets to the initial state', async () => {
		await forwardsReservationsStore.fetch('network-123');
		expect(get(forwardsReservationsStore).forwards).toHaveLength(1);

		forwardsReservationsStore.clear();

		const state = get(forwardsReservationsStore);
		expect(state.forwards).toEqual([]);
		expect(state.reservations).toEqual([]);
	});

	describe('createForward', () => {
		it('re-fetches both lists on success (pessimistic, no optimistic flip)', async () => {
			const promise = forwardsReservationsStore.createForward('network-123', {
				client_port: 8080,
				gateway_port: 80,
				ip: '192.168.1.50',
				protocol: 'tcp'
			});

			expect(get(forwardsReservationsStore).forwards).toEqual([]);
			expect(get(forwardsReservationsStore).applying).toBe(true);

			await promise;

			const state = get(forwardsReservationsStore);
			expect(state.applying).toBe(false);
			expect(state.forwards).toHaveLength(1);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.post('/api/networks/:networkId/forwards', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				forwardsReservationsStore.createForward('network-123', {
					client_port: 8080,
					gateway_port: 80,
					ip: '192.168.1.50',
					protocol: 'tcp'
				})
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(forwardsReservationsStore).applying).toBe(false);
		});
	});

	describe('updateForward', () => {
		it('re-fetches both lists on success', async () => {
			await forwardsReservationsStore.updateForward('network-123', 'forward-1', {
				enabled: false
			});

			expect(get(forwardsReservationsStore).applying).toBe(false);
			expect(get(forwardsReservationsStore).forwards).toHaveLength(1);
		});
	});

	describe('deleteForward', () => {
		it('re-fetches the (now empty) forwards list on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/forwards', () => HttpResponse.json({ forwards: [] }))
			);

			await forwardsReservationsStore.deleteForward('network-123', 'forward-1');

			expect(get(forwardsReservationsStore).forwards).toEqual([]);
		});
	});

	describe('createReservation', () => {
		it('re-fetches both lists on success', async () => {
			await forwardsReservationsStore.createReservation('network-123', {
				ip: '192.168.1.60',
				mac: 'aa:bb:cc:dd:ee:ff'
			});

			expect(get(forwardsReservationsStore).applying).toBe(false);
			expect(get(forwardsReservationsStore).reservations).toHaveLength(1);
		});
	});

	describe('updateReservation', () => {
		it('re-fetches both lists on success', async () => {
			await forwardsReservationsStore.updateReservation('network-123', 'reservation-1', {
				description: 'Renamed'
			});

			expect(get(forwardsReservationsStore).applying).toBe(false);
			expect(get(forwardsReservationsStore).reservations).toHaveLength(1);
		});
	});

	describe('deleteReservation', () => {
		it('re-fetches the (now empty) reservations list on success', async () => {
			server.use(
				http.get('/api/networks/:networkId/reservations', () =>
					HttpResponse.json({ reservations: [] })
				)
			);

			await forwardsReservationsStore.deleteReservation('network-123', 'reservation-1', true);

			expect(get(forwardsReservationsStore).reservations).toEqual([]);
		});

		it('surfaces a 403 experimental_disabled response as a rejected promise', async () => {
			server.use(
				http.delete('/api/networks/:networkId/reservations/:reservationId', () =>
					HttpResponse.json(
						{ detail: 'Experimental writes are disabled.', type: 'experimental_disabled' },
						{ status: 403 }
					)
				)
			);

			await expect(
				forwardsReservationsStore.deleteReservation('network-123', 'reservation-1')
			).rejects.toThrow('Experimental writes are disabled.');
			expect(get(forwardsReservationsStore).applying).toBe(false);
		});
	});
});
