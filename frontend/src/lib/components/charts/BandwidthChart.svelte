<!--
  BandwidthChart Component
  
  Displays device bandwidth history (RX and TX rates) over time.
  Includes time range selector for 1h, 6h, or 24h views.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import { getDeviceBandwidth } from '$lib/api/metrics';

	interface Props {
		deviceMac: string;
	}

	let { deviceMac }: Props = $props();

	let timeRange: '1h' | '6h' | '24h' = $state('1h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let rxData: Array<{ x: number; y: number }> = $state([]);
	let txData: Array<{ x: number; y: number }> = $state([]);

	const datasets = $derived([
		{
			label: 'Receive (RX)',
			data: rxData,
			borderColor: 'rgb(54, 162, 235)',
			backgroundColor: 'rgba(54, 162, 235, 0.1)',
			fill: true
		},
		{
			label: 'Transmit (TX)',
			data: txData,
			borderColor: 'rgb(255, 159, 64)',
			backgroundColor: 'rgba(255, 159, 64, 0.1)',
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

			const data = await getDeviceBandwidth(
				deviceMac,
				start.toISOString(),
				now.toISOString(),
				step
			);

			rxData = data.rx;
			txData = data.tx;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load bandwidth data';
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
		<h3>Bandwidth History</h3>
		<div class="time-range-selector">
			<button class:active={timeRange === '1h'} onclick={() => setTimeRange('1h')}> 1h </button>
			<button class:active={timeRange === '6h'} onclick={() => setTimeRange('6h')}> 6h </button>
			<button class:active={timeRange === '24h'} onclick={() => setTimeRange('24h')}> 24h </button>
		</div>
	</div>

	<TimeSeriesChart title="" {datasets} yAxisLabel="Mbps" {loading} {error} />
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
