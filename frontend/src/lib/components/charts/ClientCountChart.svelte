<!--
  ClientCountChart Component
  
  Displays connected client count over time as a time series chart.
  Shows total, wireless, and wired connected devices with time range selector.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import { getClientCountHistory } from '$lib/api/metrics';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';

	type ClientCountTimeRange = '6h' | '24h' | '7d';

	let timeRange: ClientCountTimeRange = $state('24h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let totalData: Array<{ x: number; y: number }> = $state([]);
	let wirelessData: Array<{ x: number; y: number }> = $state([]);
	let wiredData: Array<{ x: number; y: number }> = $state([]);

	const timeRangeOptions: { value: ClientCountTimeRange; label: string }[] = [
		{ value: '6h', label: '6h' },
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' }
	];

	const datasets = $derived([
		{
			label: 'Total',
			data: totalData,
			borderColor: seriesColor(4),
			backgroundColor: withAlpha(seriesColor(4), 0.1),
			fill: false
		},
		{
			label: 'Wireless',
			data: wirelessData,
			borderColor: seriesColor(0),
			backgroundColor: withAlpha(seriesColor(0), 0.1),
			fill: true
		},
		{
			label: 'Wired',
			data: wiredData,
			borderColor: seriesColor(2),
			backgroundColor: withAlpha(seriesColor(2), 0.1),
			fill: true
		}
	]);

	function getStartTime(range: string, now: Date): Date {
		const timestamp = now.getTime();
		switch (range) {
			case '6h':
				return new Date(timestamp - 6 * 60 * 60 * 1000);
			case '24h':
				return new Date(timestamp - 24 * 60 * 60 * 1000);
			case '7d':
				return new Date(timestamp - 7 * 24 * 60 * 60 * 1000);
			default:
				return new Date(timestamp - 24 * 60 * 60 * 1000);
		}
	}

	function getStep(range: string): string {
		switch (range) {
			case '6h':
				return '5m';
			case '24h':
				return '15m';
			case '7d':
				return '1h';
			default:
				return '15m';
		}
	}

	async function loadData() {
		loading = true;
		error = null;

		try {
			const now = new Date();
			const start = getStartTime(timeRange, now);
			const step = getStep(timeRange);

			const data = await getClientCountHistory(start.toISOString(), now.toISOString(), step);
			totalData = data.total;
			wirelessData = data.wireless;
			wiredData = data.wired;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load client count data';
		} finally {
			loading = false;
		}
	}

	function setTimeRange(range: '6h' | '24h' | '7d') {
		timeRange = range;
		loadData();
	}

	onMount(() => {
		loadData();
	});
</script>

<div class="client-count-chart">
	<div class="chart-header">
		<h3>Connected Clients</h3>
		<TimeRangeSelector
			options={timeRangeOptions}
			value={timeRange}
			onChange={setTimeRange}
			label="Connected clients time range"
		/>
	</div>

	<TimeSeriesChart title="" {datasets} yAxisLabel="Devices" {loading} {error} />
</div>

<style>
	.client-count-chart {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-4);
	}

	.chart-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
</style>
