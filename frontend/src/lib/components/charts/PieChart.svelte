<!--
  PieChart Component
  
  Displays data as a donut/pie chart using Chart.js.
  Used for distribution visualizations like connection types, WiFi bands, etc.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Chart as ChartJS,
		ArcElement,
		DoughnutController,
		Title,
		Tooltip,
		Legend
	} from 'chart.js';

	// Register Chart.js components
	ChartJS.register(ArcElement, DoughnutController, Title, Tooltip, Legend);

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

	function createChart(canvas: HTMLCanvasElement) {
		if (chart) {
			chart.destroy();
			chart = null;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new ChartJS(ctx, {
			type: 'doughnut',
			data: {
				labels: data.map((d) => d.label),
				datasets: [
					{
						data: data.map((d) => d.value),
						backgroundColor: data.map((d) => d.color),
						borderColor: 'var(--color-bg-secondary)',
						borderWidth: 2,
						hoverOffset: 4
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: cutout,
				plugins: {
					legend: {
						display: showLegend,
						position: 'bottom',
						labels: {
							padding: 12,
							usePointStyle: true,
							pointStyle: 'circle'
						}
					},
					title: {
						display: false
					},
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

		chart.data.labels = data.map((d) => d.label);
		chart.data.datasets[0].data = data.map((d) => d.value);
		chart.data.datasets[0].backgroundColor = data.map((d) => d.color);
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

	onDestroy(() => {
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
		{#if loading}
			<div class="chart-loading">
				<span class="loading-spinner"></span>
			</div>
		{:else if !hasData}
			<div class="chart-empty">
				<span>No data available</span>
			</div>
		{:else}
			<canvas use:handleCanvas></canvas>
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

	.chart-loading,
	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}
</style>
