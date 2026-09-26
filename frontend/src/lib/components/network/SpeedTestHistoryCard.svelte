<!--
  SpeedTestHistoryCard

  Network Diagnostics tab card (phase-6.0-revamp.md § 7 WP6, deliverable 1). Shows past
  speed-test results (`GET /networks/{id}/speedtests?limit=10|25|50`) as a DataTable plus a
  line chart, with the existing "Run Test" action (NetworkSpeedTestCard) reused unchanged - this
  card is read-only history alongside it, not a replacement.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { SpeedTestResult } from '$api/types';
	import { speedTestHistoryStore, type SpeedTestHistoryLimit } from '$stores';
	import Card from '$components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';
	import { formatShortDateTime } from '$lib/utils/format-datetime';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	// TimeRangeSelector is generic over `string` values (its options double as time-range
	// literals elsewhere), so the numeric limit is round-tripped through a string here.
	const limitOptions: { value: string; label: string }[] = [
		{ value: '10', label: '10' },
		{ value: '25', label: '25' },
		{ value: '50', label: '50' }
	];

	let cardState = $derived($speedTestHistoryStore);
	let results = $derived(cardState.results);

	const columns: DataTableColumn<SpeedTestResult>[] = [
		{
			key: 'timestamp',
			header: 'Time',
			sortable: true,
			required: true,
			width: '160px',
			accessor: (row) => row.timestamp,
			render: timestampCell
		},
		{
			key: 'download_mbps',
			header: 'Download',
			sortable: true,
			align: 'right',
			width: '110px',
			accessor: (row) => row.download_mbps,
			render: downloadCell
		},
		{
			key: 'upload_mbps',
			header: 'Upload',
			sortable: true,
			align: 'right',
			width: '110px',
			accessor: (row) => row.upload_mbps,
			render: uploadCell
		},
		{
			key: 'latency_ms',
			header: 'Latency',
			sortable: true,
			align: 'right',
			width: '100px',
			accessor: (row) => row.latency_ms,
			render: latencyCell
		}
	];

	/** True when every row has all three numeric measurements null - a "no measurements" fixture
	 * or history window rather than a real reading with some fields simply unpopulated. */
	let hasAnyMeasurement = $derived(
		results.some(
			(row) => row.download_mbps !== null || row.upload_mbps !== null || row.latency_ms !== null
		)
	);

	function getRowId(row: SpeedTestResult): string {
		return row.timestamp ?? String(results.indexOf(row));
	}

	const chartDatasets = $derived.by(() => {
		// Chronological order (API returns newest-first) so the line chart reads left-to-right.
		const chronological = [...results].reverse();
		const points = (accessor: (r: SpeedTestResult) => number | null) =>
			chronological
				.filter((r) => r.timestamp && accessor(r) !== null)
				.map((r) => ({ x: Date.parse(r.timestamp!), y: accessor(r)! }));

		return [
			{
				label: 'Download',
				data: points((r) => r.download_mbps),
				borderColor: seriesColor(0),
				backgroundColor: withAlpha(seriesColor(0), 0.1),
				fill: true
			},
			{
				label: 'Upload',
				data: points((r) => r.upload_mbps),
				borderColor: seriesColor(3),
				backgroundColor: withAlpha(seriesColor(3), 0.1),
				fill: true
			}
		];
	});

	function load(limit: SpeedTestHistoryLimit = cardState.limit) {
		speedTestHistoryStore.fetch(networkId, limit);
	}

	onMount(() => {
		load();
	});
</script>

{#snippet timestampCell(row: SpeedTestResult)}
	{formatShortDateTime(row.timestamp)}
{/snippet}

{#snippet downloadCell(row: SpeedTestResult)}
	{row.download_mbps !== null ? `${row.download_mbps.toFixed(1)} Mbps` : '—'}
{/snippet}

{#snippet uploadCell(row: SpeedTestResult)}
	{row.upload_mbps !== null ? `${row.upload_mbps.toFixed(1)} Mbps` : '—'}
{/snippet}

{#snippet latencyCell(row: SpeedTestResult)}
	{row.latency_ms !== null ? `${row.latency_ms.toFixed(0)} ms` : '—'}
{/snippet}

<Card title="Speed Test History">
	{#snippet actions()}
		<TimeRangeSelector
			options={limitOptions}
			value={String(cardState.limit)}
			onChange={(limit) => load(Number(limit) as SpeedTestHistoryLimit)}
			label="Number of results"
		/>
	{/snippet}

	{#if cardState.error && results.length === 0}
		<ErrorState message={cardState.error} onRetry={() => load()} />
	{:else if results.length > 0 && !hasAnyMeasurement && !cardState.loading}
		<p class="text-muted text-sm no-measurements">No speed-test measurements in these entries.</p>
	{:else}
		{#if hasAnyMeasurement || cardState.loading}
			<TimeSeriesChart
				datasets={chartDatasets}
				yAxisLabel="Mbps"
				loading={cardState.loading && results.length === 0}
			/>
		{/if}
		<div class="speedtest-history-table">
			<DataTable
				id="speedtest-history"
				{columns}
				rows={results}
				{getRowId}
				loading={cardState.loading}
				emptyTitle="No speed test history"
				emptyDescription="Run a speed test to start building history."
				showColumnToggle={false}
			/>
		</div>
	{/if}
</Card>

<style>
	.speedtest-history-table {
		margin-top: var(--space-4);
	}

	/* Column widths are set per-column via DataTableColumn.width, but the underlying <table> also
	   needs its own min-width - otherwise a narrow card (this card is a half-column by default)
	   still squeezes the Time column and clips the date (maintainer screenshot showed the date cut
	   off, leaving only ", 11:45:38 AM"). */
	.speedtest-history-table :global(.data-table) {
		min-width: 480px;
	}

	.no-measurements {
		margin: var(--space-4) 0 0;
	}
</style>
