<!--
  DataUsageMiniCard

  Per-entity data-usage card (phase-6.0-revamp.md § 7 WP6, deliverable 7):
  totals + time series for a single device (`/data-usage/devices/{mac}`),
  eero (`/data-usage/eeros/{id}`) or profile (`/data-usage/profiles/{id}`).
  Shares the totals/chart-or-list rendering with `DataUsageCard`, without the
  breakdown/top-devices sections that only make sense at network scope.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dataUsageFor, dataUsageStore, type DataUsageRange } from '$stores/dataUsage';
	import Card from './Card.svelte';
	import TimeRangeSelector from './TimeRangeSelector.svelte';
	import ErrorState from './ErrorState.svelte';
	import Skeleton from './Skeleton.svelte';
	import GenericRecordList from './GenericRecordList.svelte';
	import Icon from './Icon.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';
	import { formatBytes } from '$lib/utils/format-bytes';
	import { deriveTimeSeries } from '$lib/utils/data-usage';

	interface Props {
		networkId: string;
		entity: 'device' | 'eero' | 'profile';
		/** MAC for `entity="device"`; id for `entity="eero"`/`"profile"`. */
		entityId: string;
		title?: string;
	}

	let { networkId, entity, entityId, title = 'Data Usage' }: Props = $props();

	const rangeOptions: { value: DataUsageRange; label: string }[] = [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: '30d', label: '30d' }
	];

	const slotKey = $derived(`${entity}:${entityId}`);
	const usage = $derived(dataUsageFor(slotKey));
	let cardState = $derived($usage);

	const timeSeries = $derived.by(() => {
		if (!cardState.data) return null;
		return deriveTimeSeries(cardState.data.values);
	});

	const chartDatasets = $derived.by(() => {
		if (!timeSeries) return [];
		return [
			{
				label: 'Download',
				data: timeSeries.download,
				borderColor: seriesColor(0),
				backgroundColor: withAlpha(seriesColor(0), 0.1),
				fill: true
			},
			{
				label: 'Upload',
				data: timeSeries.upload,
				borderColor: seriesColor(3),
				backgroundColor: withAlpha(seriesColor(3), 0.1),
				fill: true
			}
		];
	});

	function load(range: DataUsageRange = cardState.range) {
		if (entity === 'device') dataUsageStore.fetchDevice(networkId, entityId, range);
		else if (entity === 'eero') dataUsageStore.fetchEero(networkId, entityId, range);
		else dataUsageStore.fetchProfile(networkId, entityId, range);
	}

	onMount(() => {
		load();
	});
</script>

<Card {title}>
	{#snippet actions()}
		<TimeRangeSelector options={rangeOptions} value={cardState.range} onChange={(r) => load(r)} />
	{/snippet}

	{#if cardState.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Data usage requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={() => load()} />
	{:else if cardState.loading && !cardState.data}
		<Skeleton variant="card" height="200px" />
	{:else}
		<div class="totals">
			<div class="total">
				<span class="total-label text-muted">Download</span>
				<span class="total-value">{formatBytes(cardState.data?.download_bytes)}</span>
			</div>
			<div class="total">
				<span class="total-label text-muted">Upload</span>
				<span class="total-value">{formatBytes(cardState.data?.upload_bytes)}</span>
			</div>
		</div>

		{#if timeSeries}
			<TimeSeriesChart datasets={chartDatasets} loading={cardState.loading} />
		{:else if cardState.data && cardState.data.values.length > 0}
			<GenericRecordList
				records={cardState.data.values}
				emptyTitle="No usage data"
				recordLabel={(_r, i) => `Entry ${i + 1}`}
			/>
		{/if}
	{/if}
</Card>

<style>
	.totals {
		display: flex;
		gap: var(--space-6);
		margin-bottom: var(--space-4);
	}

	.total {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.total-label {
		font-size: var(--text-sm);
	}

	.total-value {
		font-size: var(--text-xl, 1.25rem);
		font-weight: 600;
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
