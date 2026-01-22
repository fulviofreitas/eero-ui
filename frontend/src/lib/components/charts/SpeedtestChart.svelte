<!--
  SpeedtestChart Component
  
  Displays speedtest history (download and upload speeds) over time.
  Includes time range selector for 24h, 7d, or 30d views.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import { getSpeedtestHistory } from '$lib/api/metrics';

	interface Props {
		networkId: string;
	}

	// networkId will be used in future for network-specific filtering
	let { networkId: _networkId }: Props = $props();

	let timeRange: '24h' | '7d' | '30d' = $state('24h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let downloadData: Array<{ x: number; y: number }> = $state([]);
	let uploadData: Array<{ x: number; y: number }> = $state([]);

	const datasets = $derived([
		{
			label: 'Download',
			data: downloadData,
			borderColor: 'rgb(75, 192, 192)',
			backgroundColor: 'rgba(75, 192, 192, 0.1)',
			fill: true
		},
		{
			label: 'Upload',
			data: uploadData,
			borderColor: 'rgb(255, 99, 132)',
			backgroundColor: 'rgba(255, 99, 132, 0.1)',
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

			const data = await getSpeedtestHistory(start.toISOString(), now.toISOString(), step);

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
		<div class="time-range-selector">
			<button class:active={timeRange === '24h'} onclick={() => setTimeRange('24h')}> 24h </button>
			<button class:active={timeRange === '7d'} onclick={() => setTimeRange('7d')}> 7d </button>
			<button class:active={timeRange === '30d'} onclick={() => setTimeRange('30d')}> 30d </button>
		</div>
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

	.time-range-selector {
		display: flex;
		gap: var(--space-1);
	}

	.time-range-selector button {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		background: var(--color-bg-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.time-range-selector button:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	.time-range-selector button.active {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}
</style>
