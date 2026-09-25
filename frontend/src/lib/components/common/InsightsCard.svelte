<!--
  InsightsCard

  Shared card for network/device/profile insights (phase-6.0-revamp.md § 7 WP6,
  deliverable 6: `GET /{networks,devices,profiles}/{id}/insights`). One
  component, parameterized by `scope`+`id`, mounted on the network Overview
  tab, the device detail page and the profile detail page - each wrapped in
  its own `<PremiumGate feature="...">` by the caller. Also renders its own
  upsell notice on a 402 (`insightsStore` records that as `premiumRequired`
  rather than `error`), since this card can be used - or tested - standalone,
  independent of the entitlements snapshot `PremiumGate` reads.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { InsightType } from '$api/types';
	import { insightsFor, insightsStore, type InsightRange } from '$stores/insights';
	import type { InsightScope } from '$api/types';
	import Card from './Card.svelte';
	import Tabs from './Tabs.svelte';
	import TimeRangeSelector from './TimeRangeSelector.svelte';
	import ErrorState from './ErrorState.svelte';
	import EmptyState from './EmptyState.svelte';
	import Skeleton from './Skeleton.svelte';
	import Icon from './Icon.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';

	interface Props {
		scope: InsightScope;
		id: string;
	}

	let { scope, id }: Props = $props();

	const rangeOptions: { value: InsightRange; label: string }[] = [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: '30d', label: '30d' }
	];

	const insightTabs: { id: InsightType; label: string }[] = [
		{ id: 'blocked', label: 'Blocked' },
		{ id: 'adblock', label: 'Ad Block' },
		{ id: 'inspected', label: 'Inspected' }
	];

	// The keyed store instance depends on `scope`/`id`, which can change while
	// this component stays mounted (e.g. a parent switching devices) - recompute
	// it whenever either prop changes, then auto-subscribe to whichever instance
	// is current.
	let store = $derived(insightsFor(scope, id));
	let cardState = $derived($store);

	const activeSeries = $derived(
		cardState.series.find((s) => s.insight_type === cardState.insightType) ??
			cardState.series[0] ??
			null
	);

	const chartDatasets = $derived.by(() => {
		if (!activeSeries) return [];
		const points = activeSeries.values
			.filter((v) => v.time && v.value !== null)
			.map((v) => ({ x: Date.parse(v.time!), y: v.value! }));
		return [
			{
				label:
					insightTabs.find((t) => t.id === cardState.insightType)?.label ?? cardState.insightType,
				data: points,
				borderColor: seriesColor(1),
				backgroundColor: withAlpha(seriesColor(1), 0.15),
				fill: true
			}
		];
	});

	function load(
		range: InsightRange = cardState.range,
		insightType: InsightType = cardState.insightType
	) {
		insightsStore.fetch(scope, id, { range, insightType });
	}

	onMount(() => {
		load();
	});
</script>

<Card title="Insights">
	{#snippet actions()}
		<TimeRangeSelector options={rangeOptions} value={cardState.range} onChange={(r) => load(r)} />
	{/snippet}

	<Tabs
		tabs={insightTabs}
		value={cardState.insightType}
		onChange={(t) => load(cardState.range, t as InsightType)}
		label="Insight type"
	/>

	<div
		class="insights-body"
		role="tabpanel"
		id="tabpanel-{cardState.insightType}"
		aria-labelledby="tab-{cardState.insightType}"
	>
		{#if cardState.premiumRequired}
			<div class="premium-note" role="note">
				<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
				<div>
					<p class="premium-note-title">Insights requires eero Plus/Secure</p>
					<p class="premium-note-description text-muted">
						Upgrade the network's subscription to unlock this card.
					</p>
				</div>
			</div>
		{:else if cardState.error}
			<ErrorState message={cardState.error} onRetry={() => load()} />
		{:else if cardState.loading && cardState.series.length === 0}
			<Skeleton variant="card" height="220px" />
		{:else if !activeSeries || activeSeries.values.length === 0}
			<EmptyState
				title="No insights data"
				description="No data was recorded for this range and type."
			/>
		{:else}
			{#if activeSeries.sum !== null}
				<p class="insights-sum">
					Total: <strong>{activeSeries.sum.toLocaleString()}</strong>
				</p>
			{/if}
			<TimeSeriesChart datasets={chartDatasets} loading={cardState.loading} />
		{/if}
	</div>
</Card>

<style>
	.insights-body {
		margin-top: var(--space-4);
	}

	.insights-sum {
		margin: 0 0 var(--space-2);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.premium-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}

	.premium-note-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.premium-note-title {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}

	.premium-note-description {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
