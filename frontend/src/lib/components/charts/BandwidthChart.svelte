<!--
  BandwidthChart Component (Signal Strength History)
  
  Displays device signal strength history over time.
  Note: eero-prometheus-exporter doesn't provide bandwidth metrics per device,
  so this shows signal quality metrics instead which are more useful for
  understanding device connectivity.
  
  Includes time range selector for 1h, 6h, or 24h views.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import { getDeviceSignalHistory } from '$lib/api/metrics';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';

	interface Props {
		deviceMac: string;
	}

	let { deviceMac }: Props = $props();

	type BandwidthTimeRange = '1h' | '6h' | '24h';

	let timeRange: BandwidthTimeRange = $state('1h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let signalData: Array<{ x: number; y: number }> = $state([]);

	const timeRangeOptions: { value: BandwidthTimeRange; label: string }[] = [
		{ value: '1h', label: '1h' },
		{ value: '6h', label: '6h' },
		{ value: '24h', label: '24h' }
	];

	const datasets = $derived([
		{
			label: 'Signal Strength',
			data: signalData,
			borderColor: seriesColor(4),
			backgroundColor: withAlpha(seriesColor(4), 0.1),
			fill: true
		}
	]);

	function getStartTime(range: string, now: Date): Date {
		const timestamp = now.getTime();
		switch (range) {
			case '1h':
				return new Date(timestamp - 1 * 60 * 60 * 1000);
			case '6h':
				return new Date(timestamp - 6 * 60 * 60 * 1000);
			case '24h':
				return new Date(timestamp - 24 * 60 * 60 * 1000);
			default:
				return new Date(timestamp - 1 * 60 * 60 * 1000);
		}
	}

	function getStep(range: string): string {
		switch (range) {
			case '1h':
				return '1m';
			case '6h':
				return '5m';
			case '24h':
				return '15m';
			default:
				return '1m';
		}
	}

	async function loadData() {
		loading = true;
		error = null;

		try {
			const now = new Date();
			const start = getStartTime(timeRange, now);
			const step = getStep(timeRange);

			const data = await getDeviceSignalHistory(
				deviceMac,
				start.toISOString(),
				now.toISOString(),
				step
			);

			signalData = data.signalStrength;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load signal data';
		} finally {
			loading = false;
		}
	}

	function setTimeRange(range: '1h' | '6h' | '24h') {
		timeRange = range;
		loadData();
	}

	onMount(() => {
		loadData();
	});
</script>

<div class="bandwidth-chart">
	<div class="chart-header">
		<h3>Signal Strength History</h3>
		<TimeRangeSelector
			options={timeRangeOptions}
			value={timeRange}
			onChange={setTimeRange}
			label="Signal strength history time range"
		/>
	</div>

	<TimeSeriesChart title="" {datasets} yAxisLabel="dBm" {loading} {error} />
</div>

<style>
	.bandwidth-chart {
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
