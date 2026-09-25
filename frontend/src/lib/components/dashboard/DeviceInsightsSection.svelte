<!--
  DeviceInsightsSection

  Dashboard "Device Insights" section (connection type / wifi band / top manufacturers).
  Extracted from routes/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import PieChart from '$lib/components/charts/PieChart.svelte';
	import BarGauge from '$lib/components/charts/BarGauge.svelte';

	interface ChartDatum {
		label: string;
		value: number;
		color: string;
	}

	interface BarItem {
		label: string;
		value: number;
		maxValue: number;
	}

	interface Props {
		connectionTypeData: ChartDatum[];
		wifiBandData: ChartDatum[];
		topManufacturers: BarItem[];
	}

	let { connectionTypeData, wifiBandData, topManufacturers }: Props = $props();
</script>

<section class="dashboard-section">
	<h2 class="section-title">Device Insights</h2>
	<div class="insights-grid">
		<div class="card chart-card">
			<PieChart title="Connection Type" data={connectionTypeData} cutout="55%" />
		</div>

		<div class="card chart-card">
			<PieChart title="WiFi Band" data={wifiBandData} cutout="55%" />
		</div>

		<div class="card chart-card manufacturers-card">
			<BarGauge
				title="Top Manufacturers"
				items={topManufacturers}
				showValue={true}
				unit=""
				colorMode="fixed"
			/>
		</div>
	</div>
</section>

<style>
	.dashboard-section {
		margin-bottom: var(--space-8);
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
		color: var(--color-text);
	}

	.insights-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
	}

	.chart-card {
		padding: var(--space-4);
		min-height: 280px;
	}

	.manufacturers-card {
		min-height: 280px;
	}

	@media (max-width: 1024px) {
		.insights-grid {
			grid-template-columns: 1fr 1fr;
		}

		.insights-grid .manufacturers-card {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 768px) {
		.insights-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
