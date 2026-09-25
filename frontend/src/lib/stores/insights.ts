/**
 * Insights Store
 *
 * Network/device/profile insights time series (phase-6.0-revamp.md § 7 WP6,
 * deliverable 6: `GET /{networks,devices,profiles}/{id}/insights`). One store
 * keyed by `scope:id` (plan § 7 WP6) since InsightsCard is mounted up to
 * three times at once (network Overview tab, device detail, profile detail),
 * each tracking its own insight type / time range independently - the same
 * keyed-map pattern as `speedTestFor` in stores/networks.ts.
 *
 * Premium-gated: a 402 is recorded as `premiumRequired` rather than `error`,
 * so InsightsCard can render the same upsell notice as `PremiumGate` even
 * when used standalone (e.g. in a test, or if entitlements are stale).
 */

import { writable, derived, get } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
import type { InsightScope, InsightSeries, InsightType, InsightCadence } from '$api/types';

export type InsightRange = '24h' | '7d' | '30d';

export interface InsightsFetchParams {
	range: InsightRange;
	insightType: InsightType;
}

interface InsightsState {
	series: InsightSeries[];
	range: InsightRange;
	insightType: InsightType;
	loading: boolean;
	error: string | null;
	premiumRequired: boolean;
}

function defaultInsightsState(): InsightsState {
	return {
		series: [],
		range: '7d',
		insightType: 'blocked',
		loading: false,
		error: null,
		premiumRequired: false
	};
}

function keyOf(scope: InsightScope, id: string): string {
	return `${scope}:${id}`;
}

/** `range` -> {cadence, windowMs}, per the plan's stated widget behaviour. */
function windowFor(range: InsightRange): { cadence: InsightCadence; windowMs: number } {
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

function callFor(scope: InsightScope) {
	switch (scope) {
		case 'device':
			return api.devices.getInsights;
		case 'profile':
			return api.profiles.getInsights;
		case 'network':
		default:
			return api.networks.getInsights;
	}
}

function createInsightsStore() {
	const states = writable<Map<string, InsightsState>>(new Map());

	function patch(key: string, partial: Partial<InsightsState>): void {
		states.update((map) => {
			const next = new Map(map);
			next.set(key, { ...(next.get(key) ?? defaultInsightsState()), ...partial });
			return next;
		});
	}

	return {
		subscribe: states.subscribe,

		/** Fetch (or re-fetch, on a range/type change) insights for one scope+id. */
		async fetch(scope: InsightScope, id: string, params: InsightsFetchParams): Promise<void> {
			const key = keyOf(scope, id);
			const { range, insightType } = params;
			patch(key, {
				range,
				insightType,
				loading: true,
				error: null,
				premiumRequired: false
			});

			const { cadence, windowMs } = windowFor(range);
			const end = new Date();
			const start = new Date(end.getTime() - windowMs);

			try {
				const call = callFor(scope);
				const result = await call(id, {
					start: start.toISOString(),
					end: end.toISOString(),
					insightType,
					cadence
				});
				patch(key, { series: result.series, loading: false });
			} catch (error) {
				if (error instanceof ApiClientError && error.type === 'premium_required') {
					patch(key, { loading: false, premiumRequired: true, series: [] });
					return;
				}
				patch(key, {
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load insights'
				});
			}
		},

		/** Clear one scope+id's state (e.g. on unmount/network switch). */
		clear(scope: InsightScope, id: string): void {
			const key = keyOf(scope, id);
			states.update((map) => {
				const next = new Map(map);
				next.delete(key);
				return next;
			});
		},

		/** Clear every tracked scope+id (e.g. on logout). */
		clearAll(): void {
			states.set(new Map());
		},

		/** Internal: exposed for the `insightsFor` export below. */
		_states: states
	};
}

export const insightsStore = createInsightsStore();

/** Insights state for one scope+id - keyed, since more than one can be tracked at once. */
export function insightsFor(scope: InsightScope, id: string) {
	const key = keyOf(scope, id);
	return derived(insightsStore._states, ($map) => $map.get(key) ?? defaultInsightsState());
}

/** Snapshot read, for tests/imperative callers that don't want a subscription. */
export function currentInsightsFor(scope: InsightScope, id: string): InsightsState {
	return get(insightsStore._states).get(keyOf(scope, id)) ?? defaultInsightsState();
}
