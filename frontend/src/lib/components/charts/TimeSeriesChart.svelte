<!--
  TimeSeriesChart Component
  
  Base chart component for time-series data visualization using Chart.js.
  Used as the foundation for SpeedtestChart and BandwidthChart.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart as ChartJS,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		Title,
		Tooltip,
		Legend,
		TimeScale,
		Filler
	} from 'chart.js';
	import 'chartjs-adapter-date-fns';

	// Register Chart.js components
	ChartJS.register(
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		Title,
		Tooltip,
		Legend,
		TimeScale,
		Filler
	);

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

	let canvas: HTMLCanvasElement;
	let chart: ChartJS | null = null;

	function createChart() {
		if (!canvas || chart) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		chart = new ChartJS(ctx, {
			type: 'line',
			data: {
				datasets: datasets.map((ds) => ({
					...ds,
					tension: 0.3,
					pointRadius: 2,
					borderWidth: 2
				}))
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false
				},
				plugins: {
					legend: {
						position: 'top'
					},
					title: {
						display: !!title,
						text: title
					},
					tooltip: {
						callbacks: {
							label: (context) => {
								const value = context.parsed.y;
								if (value === null || value === undefined) return '';
								return `${context.dataset.label}: ${value.toFixed(2)} ${yAxisLabel}`;
							}
						}
					}
				},
				scales: {
					x: {
						type: 'time',
						time: {
							tooltipFormat: 'PPpp',
							displayFormats: {
								hour: 'HH:mm',
								day: 'MMM d'
							}
						},
						title: {
							display: true,
							text: 'Time'
						}
					},
					y: {
						beginAtZero: true,
						title: {
							display: !!yAxisLabel,
							text: yAxisLabel
						}
					}
				}
			}
		});
	}

	function updateChart() {
		if (!chart) return;

		chart.data.datasets = datasets.map((ds) => ({
			...ds,
			tension: 0.3,
			pointRadius: 2,
			borderWidth: 2
		}));
		chart.update('none');
	}

	function destroyChart() {
		if (chart) {
			chart.destroy();
			chart = null;
		}
	}

	onMount(() => {
		createChart();
	});

	onDestroy(() => {
		destroyChart();
	});

	// Reactive update when datasets change
	$effect(() => {
		if (chart && datasets) {
			updateChart();
		}
	});

	const hasData = $derived(datasets.length > 0 && datasets.some((ds) => ds.data.length > 0));
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
		<canvas bind:this={canvas}></canvas>
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
