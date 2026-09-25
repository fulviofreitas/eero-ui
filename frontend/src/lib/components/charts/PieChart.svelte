<!--
  PieChart Component

  Displays data as a donut/pie chart using Chart.js.
  Used for distribution visualizations like connection types, WiFi bands, etc.

  Registration and theme-aware options come from `$lib/charts/defaults.ts`. Previously this
  component passed `var(--color-bg-secondary)` straight into the canvas border colour
  (PieChart.svelte:66 pre-refactor) — canvas cannot parse CSS custom properties, so the border
  silently rendered as nothing. `doughnutChartOptions()`/`readThemeColors()` resolve the token
  to an actual colour via `getComputedStyle` before it reaches Chart.js.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Chart as ChartJS } from 'chart.js';
	import {
		registerCharts,
		doughnutChartOptions,
		readThemeColors,
		onThemeChange
	} from '$lib/charts/defaults';
	import Skeleton from '$components/common/Skeleton.svelte';

	registerCharts();

	interface DataItem {
		label: string;
		value: number;
		color: string;
	}

	interface Props {
		title?: string;
		data?: DataItem[];
		loading?: boolean;
		showLegend?: boolean;
		cutout?: string;
	}

	let {
		title = '',
		data = [],
		loading = false,
		showLegend = true,
		cutout = '60%'
	}: Props = $props();

	let canvasElement: HTMLCanvasElement | null = null;
	let chart: ChartJS | null = null;

	const hasData = $derived(data.length > 0 && data.some((d) => d.value > 0));
	const total = $derived(data.reduce((sum, d) => sum + d.value, 0));

	// A8: accessible label for the canvas, since Chart.js draws to a <canvas> with no text content
	// for assistive tech to read. Built from the same data driving the chart, so it stays in sync.
	const ariaLabel = $derived.by(() => {
		if (!hasData) return `${title}: no data`;
		return `${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`;
	});

	function createChart(canvas: HTMLCanvasElement) {
		if (chart) {
			chart.destroy();
			chart = null;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const colors = readThemeColors();

		chart = new ChartJS(ctx, {
			type: 'doughnut',
			data: {
				labels: data.map((d) => d.label),
				datasets: [
					{
						data: data.map((d) => d.value),
						backgroundColor: data.map((d) => d.color),
						borderColor: colors.surface,
						borderWidth: 2,
						hoverOffset: 4
					}
				]
			},
			options: {
				...doughnutChartOptions({ cutout, showLegend, colors }),
				plugins: {
					...doughnutChartOptions({ cutout, showLegend, colors }).plugins,
					tooltip: {
						callbacks: {
							label: (context) => {
								const value = context.raw as number;
								const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
								return `${context.label}: ${value} (${percentage}%)`;
							}
						}
					}
				}
			}
		});
	}

	function updateChart() {
		if (!chart) return;

		const colors = readThemeColors();
		chart.data.labels = data.map((d) => d.label);
		chart.data.datasets[0].data = data.map((d) => d.value);
		chart.data.datasets[0].backgroundColor = data.map((d) => d.color);
		chart.data.datasets[0].borderColor = colors.surface;
		chart.update('none');
	}

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

	$effect(() => {
		const _data = data;
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

<div class="pie-chart">
	{#if title}
		<h4 class="chart-title">{title}</h4>
	{/if}

	<div class="chart-container">
		{#if loading && !hasData}
			<Skeleton variant="card" height="100%" />
		{:else if !hasData}
			<div class="chart-empty">
				<span>No data available</span>
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
</div>

<style>
	.pie-chart {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.chart-title {
		margin: 0 0 var(--space-3) 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.chart-container {
		position: relative;
		flex: 1;
		min-height: 200px;
	}

	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
		font-size: 0.875rem;
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
