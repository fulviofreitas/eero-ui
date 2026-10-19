<!--
  WanThroughputCard

  Live WAN download/upload throughput (eero-ui#458), `GET /metrics/network/wan` via
  `wanThroughputStore`. Network Diagnostics tab, full width, above the manual speed-test history.

  States, in precedence order: error without data (retry) -> first load -> not enabled on the
  server -> enabled but no samples ("unavailable", never "0 Mbps": an absent reading is unknown,
  not zero) -> data. Gaps are never zero-filled.
-->
<script lang="ts">
	import { wanThroughputStore, WAN_RANGE_OPTIONS } from '#lib/stores/wanThroughput.js';
	import Card from '#lib/components/common/Card.svelte';
	import ErrorState from '#lib/components/common/ErrorState.svelte';
	import TimeRangeSelector from '#lib/components/common/TimeRangeSelector.svelte';
	import TimeSeriesChart from '#lib/components/charts/TimeSeriesChart.svelte';
	import { seriesColor, withAlpha } from '#lib/charts/defaults.js';
	import { formatRelativeTime } from '#lib/utils/format-datetime.js';
	import { formatMbps } from '#lib/utils/wan-throughput.js';

	/** A latest reading older than this is shown muted, with a "Last reported" caption. */
	const STALE_AFTER_MS = 2 * 60 * 1000;

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let wanState = $derived($wanThroughputStore);
	let download = $derived(wanState.data?.download ?? []);
	let upload = $derived(wanState.data?.upload ?? []);
	let hasPoints = $derived(download.length > 0 || upload.length > 0);

	let latestDownload = $derived(download.at(-1) ?? null);
	let latestUpload = $derived(upload.at(-1) ?? null);
	let latestTimestamp = $derived(Math.max(latestDownload?.x ?? 0, latestUpload?.x ?? 0));

	// Wall-clock reference for staleness; refreshed whenever new data lands.
	let now = $derived.by(() => {
		void wanState.lastUpdated;
		return Date.now();
	});
	let isStale = $derived(hasPoints && now - latestTimestamp > STALE_AFTER_MS);
	let lastReported = $derived(
		isStale ? formatRelativeTime(new Date(latestTimestamp).toISOString(), now) : null
	);

	const chartDatasets = $derived([
		{
			label: 'Download',
			data: download,
			borderColor: seriesColor(0),
			backgroundColor: withAlpha(seriesColor(0), 0.1),
			fill: true
		},
		{
			label: 'Upload',
			data: upload,
			borderColor: seriesColor(3),
			backgroundColor: withAlpha(seriesColor(3), 0.1),
			fill: true
		}
	]);

	$effect(() => {
		wanThroughputStore.fetch(networkId);
	});

	function retry() {
		wanThroughputStore.fetch(networkId);
	}
</script>

<Card title="WAN Throughput">
	{#snippet actions()}
		<TimeRangeSelector
			options={WAN_RANGE_OPTIONS}
			value={wanState.range}
			onChange={(range) => wanThroughputStore.setRange(range)}
			label="WAN throughput time range"
		/>
	{/snippet}

	{#if wanState.error && !wanState.data}
		<ErrorState message={wanState.error} onRetry={retry} />
	{:else if !wanState.data}
		<TimeSeriesChart title="WAN throughput" loading={true} />
	{:else if wanState.enabled === false}
		<p class="text-muted text-sm state-message" role="status">
			WAN throughput is not enabled on this server.
			<a
				href="https://github.com/fulviofreitas/eero-ui/wiki/Configuration"
				target="_blank"
				rel="noopener noreferrer">Configuration</a
			>
		</p>
	{:else if !hasPoints}
		<p class="text-muted text-sm state-message" role="status">
			WAN throughput is unavailable. The collector has not reported a total for this network in the
			selected range.
		</p>
	{:else}
		{#if wanState.error}
			<ErrorState message={wanState.error} onRetry={retry} />
		{/if}
		<div class="wan-latest" class:stale={isStale} data-stale={isStale ? 'true' : 'false'}>
			<dl class="wan-summary">
				<div>
					<dt class="text-muted text-sm">Download</dt>
					<dd>{formatMbps(latestDownload?.y)}</dd>
				</div>
				<div>
					<dt class="text-muted text-sm">Upload</dt>
					<dd>{formatMbps(latestUpload?.y)}</dd>
				</div>
			</dl>
			{#if lastReported}
				<p class="text-muted text-sm last-reported">Last reported {lastReported}</p>
			{/if}
		</div>
		<TimeSeriesChart
			title="WAN throughput"
			datasets={chartDatasets}
			yAxisLabel="Mbps"
			loading={wanState.loading}
		/>
	{/if}
</Card>

<style>
	.state-message {
		margin: var(--space-4) 0 0;
	}

	.state-message a {
		color: var(--color-accent);
	}

	.wan-latest {
		margin-bottom: var(--space-4);
	}

	.wan-latest.stale {
		opacity: 0.6;
	}

	.wan-summary {
		display: flex;
		gap: var(--space-6);
		margin: 0;
	}

	.wan-summary dd {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.last-reported {
		margin: var(--space-2) 0 0;
	}
</style>
