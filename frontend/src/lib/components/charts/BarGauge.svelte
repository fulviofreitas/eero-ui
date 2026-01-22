<!--
  BarGauge Component
  
  Displays horizontal bar gauges for metrics like mesh quality, signal strength, etc.
  Inspired by Grafana's bar gauge visualization.
-->
<script lang="ts">
	interface GaugeItem {
		label: string;
		value: number;
		maxValue?: number;
		color?: string;
	}

	interface Props {
		title?: string;
		items?: GaugeItem[];
		maxValue?: number;
		showValue?: boolean;
		unit?: string;
		colorMode?: 'fixed' | 'threshold';
		thresholds?: { value: number; color: string }[];
	}

	let {
		title = '',
		items = [],
		maxValue = 100,
		showValue = true,
		unit = '',
		colorMode = 'threshold',
		thresholds = [
			{ value: 0, color: 'var(--color-danger)' },
			{ value: 40, color: 'var(--color-warning)' },
			{ value: 70, color: 'var(--color-success)' }
		]
	}: Props = $props();

	function getColor(value: number, itemMaxValue?: number): string {
		if (colorMode === 'fixed') {
			return 'var(--color-accent)';
		}

		const max = itemMaxValue ?? maxValue;
		const percentage = max > 0 ? (value / max) * 100 : 0;

		// Find the appropriate threshold color
		let color = thresholds[0]?.color ?? 'var(--color-accent)';
		for (const threshold of thresholds) {
			if (percentage >= threshold.value) {
				color = threshold.color;
			}
		}
		return color;
	}

	function getPercentage(value: number, itemMaxValue?: number): number {
		const max = itemMaxValue ?? maxValue;
		return max > 0 ? Math.min((value / max) * 100, 100) : 0;
	}
</script>

<div class="bar-gauge">
	{#if title}
		<h4 class="gauge-title">{title}</h4>
	{/if}

	<div class="gauge-items">
		{#each items as item}
			<div class="gauge-item">
				<div class="gauge-header">
					<span class="gauge-label">{item.label}</span>
					{#if showValue}
						<span class="gauge-value">
							{item.value}{unit}
						</span>
					{/if}
				</div>
				<div class="gauge-bar-container">
					<div
						class="gauge-bar"
						style="width: {getPercentage(item.value, item.maxValue)}%; background-color: {getColor(
							item.value,
							item.maxValue
						)};"
					></div>
				</div>
			</div>
		{/each}

		{#if items.length === 0}
			<div class="gauge-empty">No data available</div>
		{/if}
	</div>
</div>

<style>
	.bar-gauge {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.gauge-title {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.gauge-items {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.gauge-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.gauge-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.gauge-label {
		font-size: 0.8125rem;
		color: var(--color-text);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.gauge-value {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
	}

	.gauge-bar-container {
		height: 8px;
		background-color: var(--color-bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.gauge-bar {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
		min-width: 2px;
	}

	.gauge-empty {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		text-align: center;
		padding: var(--space-4);
	}
</style>
