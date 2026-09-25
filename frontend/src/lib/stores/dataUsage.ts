/**
 * Data Usage Store
 *
 * Network/device/eero/profile data usage (phase-6.0-revamp.md § 7 WP6,
 * deliverable 7: `GET /networks/{id}/data-usage[...]`). One store keyed by a
 * caller-chosen slot name (`'network'`, `'breakdown'`, `'devices'`,
 * `device:<mac>`, `eero:<id>`, `profile:<id>`) so the network Overview card
 * and any number of per-entity detail-page cards can each track their own
 * loading/error/range state independently, same keyed-map pattern as
 * `speedTestFor` in stores/networks.ts.
 *
 * Premium-gated: a 402 is recorded as `premiumRequired` rather than `error`.
 */

import { writable, derived, get } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type { DataUsageCadence, DataUsageResponse } from '$api/types';

export type DataUsageRange = '24h' | '7d' | '30d';

interface DataUsageState {
	data: DataUsageResponse | null;
	range: DataUsageRange;
	loading: boolean;
	error: string | null;
	premiumRequired: boolean;
}

function defaultDataUsageState(): DataUsageState {
	return { data: null, range: '7d', loading: false, error: null, premiumRequired: false };
}

/** `range` -> {cadence, windowMs}, mirroring `insights.ts`'s `windowFor`. */
function windowFor(range: DataUsageRange): { cadence: DataUsageCadence; windowMs: number } {
	switch (range) {
		case '24h':
			return { cadence: 'hourly', windowMs: 24 * 60 * 60 * 1000 };
		case '30d':
			return { cadence: 'daily', windowMs: 30 * 24 * 60 * 60 * 1000 };
		case '7d':
		default:
			return { cadence: 'daily', windowMs: 7 * 24 * 60 * 60 * 1000 };
	}
}

function timezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}

function createDataUsageStore() {
	const states = writable<Map<string, DataUsageState>>(new Map());

	function patch(key: string, partial: Partial<DataUsageState>): void {
		states.update((map) => {
			const next = new Map(map);
			next.set(key, { ...(next.get(key) ?? defaultDataUsageState()), ...partial });
			return next;
		});
	}

	async function run(
		key: string,
		range: DataUsageRange,
		call: (
			start: string,
			end: string,
			cadence: DataUsageCadence,
			tz: string
		) => Promise<DataUsageResponse>
	): Promise<void> {
		patch(key, { range, loading: true, error: null, premiumRequired: false });
		const { cadence, windowMs } = windowFor(range);
		const end = new Date();
		const start = new Date(end.getTime() - windowMs);

		try {
			const data = await call(start.toISOString(), end.toISOString(), cadence, timezone());
			patch(key, { data, loading: false });
		} catch (error) {
			if (error instanceof ApiClientError && error.type === 'premium_required') {
				patch(key, { loading: false, premiumRequired: true, data: null });
				return;
			}
			patch(key, {
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load data usage'
			});
		}
	}

	return {
		subscribe: states.subscribe,

		async fetchNetwork(networkId: string, range: DataUsageRange = '7d'): Promise<void> {
			await run('network', range, (start, end, cadence, tz) =>
				api.networks.getDataUsage(networkId, { start, end, cadence, timezone: tz })
			);
		},

		async fetchBreakdown(networkId: string, range: DataUsageRange = '7d'): Promise<void> {
			await run('breakdown', range, (start, end, cadence, tz) =>
				api.networks.getDataUsageBreakdown(networkId, { start, end, cadence, timezone: tz })
			);
		},

		async fetchDevices(networkId: string, range: DataUsageRange = '7d'): Promise<void> {
			await run('devices', range, (start, end, cadence, tz) =>
				api.networks.getDevicesDataUsage(networkId, { start, end, cadence, timezone: tz })
			);
		},

		async fetchDevice(networkId: string, mac: string, range: DataUsageRange = '7d'): Promise<void> {
			await run(`device:${mac}`, range, (start, end, cadence, tz) =>
				api.networks.getDeviceDataUsage(networkId, mac, { start, end, cadence, timezone: tz })
			);
		},

		async fetchEero(
			networkId: string,
			eeroId: string,
			range: DataUsageRange = '7d'
		): Promise<void> {
			await run(`eero:${eeroId}`, range, (start, end, cadence, tz) =>
				api.networks.getEeroDataUsage(networkId, eeroId, { start, end, cadence, timezone: tz })
			);
		},

		async fetchProfile(
			networkId: string,
			profileId: string,
			range: DataUsageRange = '7d'
		): Promise<void> {
			await run(`profile:${profileId}`, range, (start, end, cadence, tz) =>
				api.networks.getProfileDataUsage(networkId, profileId, {
					start,
					end,
					cadence,
					timezone: tz
				})
			);
		},

		/** Clear one slot's state. */
		clear(key: string): void {
			states.update((map) => {
				const next = new Map(map);
				next.delete(key);
				return next;
			});
		},

		/** Clear every tracked slot (e.g. on logout). */
		clearAll(): void {
			states.set(new Map());
		},

		/** Internal: exposed for the `dataUsageFor` export below. */
		_states: states
	};
}

export const dataUsageStore = createDataUsageStore();

/** Data-usage state for one slot - keyed, since more than one can be tracked at once. */
export function dataUsageFor(key: string) {
	return derived(dataUsageStore._states, ($map) => $map.get(key) ?? defaultDataUsageState());
}

/** Snapshot read, for tests/imperative callers that don't want a subscription. */
export function currentDataUsageFor(key: string): DataUsageState {
	return get(dataUsageStore._states).get(key) ?? defaultDataUsageState();
}
