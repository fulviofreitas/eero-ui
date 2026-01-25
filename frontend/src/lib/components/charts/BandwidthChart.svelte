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
	import { getDeviceSignalHistory } from '$lib/api/metrics';

	interface Props {
		deviceMac: string;
	}

	let { deviceMac }: Props = $props();

	let timeRange: '1h' | '6h' | '24h' = $state('1h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let signalData: Array<{ x: number; y: number }> = $state([]);

	const datasets = $derived([
		{
			label: 'Signal Strength',
			data: signalData,
			borderColor: 'rgb(99, 102, 241)',
			backgroundColor: 'rgba(99, 102, 241, 0.1)',
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
		<div class="time-range-selector">
			<button class:active={timeRange === '1h'} onclick={() => setTimeRange('1h')}> 1h </button>
			<button class:active={timeRange === '6h'} onclick={() => setTimeRange('6h')}> 6h </button>
			<button class:active={timeRange === '24h'} onclick={() => setTimeRange('24h')}> 24h </button>
		</div>
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
