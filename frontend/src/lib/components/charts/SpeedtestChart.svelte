<!--
  SpeedtestChart Component
  
  Displays speedtest history (download and upload speeds) over time.
  Includes time range selector for 24h, 7d, or 30d views.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import { getSpeedtestHistory } from '$lib/api/metrics';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	type SpeedtestTimeRange = '24h' | '7d' | '30d';

	let timeRange: SpeedtestTimeRange = $state('24h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let downloadData: Array<{ x: number; y: number }> = $state([]);
	let uploadData: Array<{ x: number; y: number }> = $state([]);

	const timeRangeOptions: { value: SpeedtestTimeRange; label: string }[] = [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: '30d', label: '30d' }
	];

	const datasets = $derived([
		{
			label: 'Download',
			data: downloadData,
			borderColor: seriesColor(0),
			backgroundColor: withAlpha(seriesColor(0), 0.1),
			fill: true
		},
		{
			label: 'Upload',
			data: uploadData,
			borderColor: seriesColor(3),
			backgroundColor: withAlpha(seriesColor(3), 0.1),
			fill: true
		}
	]);

	function getStartTime(range: string, now: Date): Date {
		const timestamp = now.getTime();
		switch (range) {
			case '24h':
				return new Date(timestamp - 24 * 60 * 60 * 1000);
			case '7d':
				return new Date(timestamp - 7 * 24 * 60 * 60 * 1000);
			case '30d':
				return new Date(timestamp - 30 * 24 * 60 * 60 * 1000);
			default:
				return new Date(timestamp - 24 * 60 * 60 * 1000);
		}
	}

	function getStep(range: string): string {
		switch (range) {
			case '24h':
				return '5m';
			case '7d':
				return '1h';
			case '30d':
				return '6h';
			default:
				return '5m';
		}
	}

	async function loadData() {
		loading = true;
		error = null;

		try {
			const now = new Date();
			const start = getStartTime(timeRange, now);
			const step = getStep(timeRange);

			const data = await getSpeedtestHistory(
				start.toISOString(),
				now.toISOString(),
				step,
				networkId
			);

			downloadData = data.download;
			uploadData = data.upload;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load speedtest data';
		} finally {
			loading = false;
		}
	}

	function setTimeRange(range: '24h' | '7d' | '30d') {
		timeRange = range;
		loadData();
	}

	onMount(() => {
		loadData();
	});
</script>

<div class="speedtest-chart">
	<div class="chart-header">
		<h3>Speedtest History</h3>
		<TimeRangeSelector
			options={timeRangeOptions}
			value={timeRange}
			onChange={setTimeRange}
			label="Speedtest history time range"
		/>
	</div>

	<TimeSeriesChart title="" {datasets} yAxisLabel="Mbps" {loading} {error} />
</div>

<style>
	.speedtest-chart {
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
