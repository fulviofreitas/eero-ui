<!--
  TimeSeriesChart Component

  Base chart component for time-series data visualization using Chart.js.
  Used as the foundation for SpeedtestChart, ClientCountChart and BandwidthChart.

  Registration and theme-aware options come from `$lib/charts/defaults.ts` — see that module
  for why (single register call, canvas cannot parse `var()`, one palette).
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Chart as ChartJS } from 'chart.js';
	import { registerCharts, lineChartOptions, onThemeChange } from '$lib/charts/defaults';

	registerCharts();

	interface DataPoint {
		x: number;
		y: number;
	}

	interface Dataset {
		label: string;
		data: DataPoint[];
		borderColor: string;
		backgroundColor?: string;
		fill?: boolean;
	}

	interface Props {
		title?: string;
		datasets?: Dataset[];
		yAxisLabel?: string;
		loading?: boolean;
		error?: string | null;
	}

	let {
		title = '',
		datasets = [],
		yAxisLabel = '',
		loading = false,
		error = null
	}: Props = $props();

	let canvasElement: HTMLCanvasElement | null = null;
	let chart: ChartJS | null = null;

	const hasData = $derived(datasets.length > 0 && datasets.some((ds) => ds.data.length > 0));

	// Deep clone datasets to avoid Svelte 5 reactivity conflicts with Chart.js
	// Chart.js uses Object.defineProperty which conflicts with $state proxies
	function cloneDatasets() {
		return datasets.map((ds) => ({
			label: ds.label,
			data: ds.data.map((point) => ({ x: point.x, y: point.y })),
			borderColor: ds.borderColor,
			backgroundColor: ds.backgroundColor,
			fill: ds.fill,
			tension: 0.3,
			pointRadius: 2,
			borderWidth: 2
		}));
	}

	function createChart(canvas: HTMLCanvasElement) {
		if (chart) {
			chart.destroy();
			chart = null;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new ChartJS(ctx, {
			type: 'line',
			data: {
				datasets: cloneDatasets()
			},
			options: lineChartOptions({ title, yAxisLabel })
		});
	}

	function updateChart() {
		if (!chart) return;

		chart.data.datasets = cloneDatasets();
		chart.options = lineChartOptions({ title, yAxisLabel });
		chart.update('none');
	}

	// Handle canvas binding - create chart when canvas becomes available
	function handleCanvas(node: HTMLCanvasElement) {
		canvasElement = node;
		createChart(node);

		return {
			destroy() {
				if (chart) {
					chart.destroy();
					chart = null;
				}
				canvasElement = null;
			}
		};
	}

	// Update chart when datasets change
	$effect(() => {
		// Access datasets to track changes
		const _datasets = datasets;
		if (chart && canvasElement) {
			updateChart();
		}
	});

	const unsubscribeTheme = onThemeChange(() => updateChart());

	onDestroy(() => {
		unsubscribeTheme();
		if (chart) {
			chart.destroy();
			chart = null;
		}
	});
</script>

<div class="chart-container">
	{#if loading}
		<div class="chart-loading">
			<span class="loading-spinner"></span>
			<span>Loading chart data...</span>
		</div>
	{:else if error}
		<div class="chart-error">
			<span>Error: {error}</span>
		</div>
	{:else if !hasData}
		<div class="chart-empty">
			<span>No data available for the selected time range</span>
		</div>
	{:else}
		<canvas use:handleCanvas></canvas>
	{/if}
</div>

<style>
	.chart-container {
		position: relative;
		height: 300px;
		width: 100%;
	}

	.chart-loading,
	.chart-error,
	.chart-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--space-2);
		color: var(--color-text-muted);
	}

	.chart-error {
		color: var(--color-danger);
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}
</style>
