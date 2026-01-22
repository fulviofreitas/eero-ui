<!--
  ClientCountChart Component
  
  Displays connected client count over time as a time series chart.
  Shows total connected devices with time range selector.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import TimeSeriesChart from './TimeSeriesChart.svelte';
	import { getClientCountHistory } from '$lib/api/metrics';

	let timeRange: '6h' | '24h' | '7d' = $state('24h');
	let loading = $state(true);
	let error: string | null = $state(null);
	let clientData: Array<{ x: number; y: number }> = $state([]);

	const datasets = $derived([
		{
			label: 'Connected Clients',
			data: clientData,
			borderColor: 'rgb(99, 102, 241)',
			backgroundColor: 'rgba(99, 102, 241, 0.1)',
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

			clientData = await getClientCountHistory(start.toISOString(), now.toISOString(), step);
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
		<div class="time-range-selector">
			<button class:active={timeRange === '6h'} onclick={() => setTimeRange('6h')}> 6h </button>
			<button class:active={timeRange === '24h'} onclick={() => setTimeRange('24h')}> 24h </button>
			<button class:active={timeRange === '7d'} onclick={() => setTimeRange('7d')}> 7d </button>
		</div>
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
