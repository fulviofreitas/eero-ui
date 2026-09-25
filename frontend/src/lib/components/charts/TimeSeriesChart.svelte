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
	import Skeleton from '$components/common/Skeleton.svelte';

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

	// A8: accessible label for the canvas, since Chart.js draws to a <canvas> with no text content
	// for assistive tech to read. Reports the most recent point across all datasets (the value an
	// operator glancing at the chart cares about most).
	function getLatestPoint(ds: Dataset[]): DataPoint | null {
		let latest: DataPoint | null = null;
		for (const dataset of ds) {
			for (const point of dataset.data) {
				if (!latest || point.x > latest.x) {
					latest = point;
				}
			}
		}
		return latest;
	}

	const ariaLabel = $derived.by(() => {
		const latest = getLatestPoint(datasets);
		if (!latest) return `${title}: no data`;
		const time = new Date(latest.x).toLocaleTimeString();
		return `${title}: latest ${latest.y} at ${time}`;
	});

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
	{#if loading && !hasData}
		<Skeleton variant="card" height="100%" />
	{:else if error && !hasData}
		<div class="chart-error">
			<span>Error: {error}</span>
		</div>
	{:else if !hasData}
		<div class="chart-empty">
			<span>No data available for the selected time range</span>
		</div>
	{:else}
		<!-- A8: canvas has no implicit role; role="img" + aria-label is the documented MDN
		     pattern for giving a <canvas> chart an accessible name. Svelte's a11y check flags
		     it as a noninteractive-role-on-non-interactive-element false positive. -->
		<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
		<canvas use:handleCanvas role="img" aria-label={ariaLabel}></canvas>
		{#if loading}
			<span class="chart-refreshing" role="status" aria-label="Refreshing chart data">
				<span class="loading-spinner"></span>
			</span>
		{/if}
	{/if}
</div>

<style>
	.chart-container {
		position: relative;
		height: 300px;
		width: 100%;
	}

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

	.chart-refreshing {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		display: inline-flex;
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}
</style>
