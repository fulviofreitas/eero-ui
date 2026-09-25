<!--
  EeroHealthSection

  Dashboard "Eero Health" section (status summary / clients per eero / mesh quality).
  Extracted from routes/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroSummary } from '$api/types';
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
		eeros: EeroSummary[];
		statusCounts: { online: number; warning: number; offline: number };
		clientsPerEeroData: ChartDatum[];
		meshQualityItems: BarItem[];
	}

	let { eeros, statusCounts, clientsPerEeroData, meshQualityItems }: Props = $props();
</script>

<section class="dashboard-section">
	<h2 class="section-title">Eero Health</h2>
	<div class="eero-health-grid">
		<div class="card stat-card eero-status-summary">
			<div class="stat-header">
				<span class="stat-label">Eero Status</span>
			</div>
			<div class="eero-status-grid">
				<div class="status-item online">
					<span class="status-count">{statusCounts.online}</span>
					<span class="status-label">Online</span>
				</div>
				{#if statusCounts.warning > 0}
					<div class="status-item warning">
						<span class="status-count">{statusCounts.warning}</span>
						<span class="status-label">Warning</span>
					</div>
				{/if}
				{#if statusCounts.offline > 0}
					<div class="status-item offline">
						<span class="status-count">{statusCounts.offline}</span>
						<span class="status-label">Offline</span>
					</div>
				{/if}
			</div>
			<div class="eero-list-compact">
				{#each eeros as eero}
					<a href="/eeros/{eero.id}" class="eero-item-compact">
						<span
							class="status-dot small"
							class:online={eero.status === 'online' || eero.status === 'green'}
							class:warning={eero.status === 'warning' || eero.status === 'yellow'}
							class:offline={eero.status === 'offline' || eero.status === 'red'}
						></span>
						<span class="eero-name">{eero.location || eero.model}</span>
						{#if eero.is_gateway}
							<span class="badge badge-info badge-sm">GW</span>
						{/if}
						<span class="eero-clients mono">{eero.connected_clients_count}</span>
					</a>
				{/each}
			</div>
		</div>

		<div class="card chart-card">
			<PieChart title="Clients per Eero" data={clientsPerEeroData} cutout="50%" />
		</div>

		<div class="card chart-card mesh-quality-card">
			<BarGauge
				title="Mesh Quality"
				items={meshQualityItems}
				maxValue={5}
				showValue={true}
				unit=" bars"
				thresholds={[
					{ value: 0, color: 'var(--color-danger)' },
					{ value: 40, color: 'var(--color-warning)' },
					{ value: 70, color: 'var(--color-success)' }
				]}
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

	.stat-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.chart-card {
		padding: var(--space-4);
		min-height: 280px;
	}

	.eero-health-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--space-4);
	}

	.eero-status-summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.eero-status-grid {
		display: flex;
		gap: var(--space-4);
		padding: var(--space-3);
		background: var(--color-surface-elevated);
		border-radius: var(--radius-md);
	}

	.status-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.status-count {
		font-size: 1.5rem;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.status-item.online .status-count {
		color: var(--color-success);
	}

	.status-item.warning .status-count {
		color: var(--color-warning);
	}

	.status-item.offline .status-count {
		color: var(--color-danger);
	}

	.status-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.eero-list-compact {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.eero-item-compact {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--color-surface-elevated);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		text-decoration: none;
		color: inherit;
		transition: background var(--transition-fast);
	}

	.eero-item-compact:hover {
		background: var(--color-bg-tertiary);
	}

	.eero-name {
		flex: 1;
		font-weight: 500;
	}

	.eero-clients {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.status-dot.small {
		width: 6px;
		height: 6px;
	}

	.status-dot.warning {
		background-color: var(--color-warning);
	}

	.status-dot.offline {
		background-color: var(--color-danger);
	}

	.badge-sm {
		font-size: 0.625rem;
		padding: 1px 6px;
	}

	.mesh-quality-card {
		min-height: 280px;
	}

	@media (max-width: 1024px) {
		.eero-health-grid {
			grid-template-columns: 1fr 1fr;
		}

		.eero-health-grid .eero-status-summary {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 768px) {
		.eero-health-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
