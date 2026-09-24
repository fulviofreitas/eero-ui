<!--
  EeroStatusClientsCard

  Eero detail "Status" and "Connected Clients" cards. Extracted from
  routes/eeros/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import Icon from '$components/common/Icon.svelte';
	import { getMeshQualityBars, getUniqueBands } from '$lib/utils/eero-format';

	interface Props {
		eero: EeroDetail;
	}

	let { eero }: Props = $props();
</script>

<section class="card detail-card">
	<h2>Status</h2>
	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">Status</span>
			<span class="info-value">
				<StatusBadge status={eero.status || 'unknown'} />
			</span>
		</div>
		<div class="info-item">
			<span class="info-label">Connection</span>
			<span class="info-value">
				<Icon name={eero.wired ? 'ethernet' : 'wifi'} size={14} />
				{eero.wired ? 'Wired' : 'Wireless'}{eero.connection_type
					? ` (${eero.connection_type})`
					: ''}
			</span>
		</div>
		{#if !eero.is_gateway && eero.mesh_quality_bars != null}
			<div class="info-item">
				<span class="info-label">Mesh Quality</span>
				<span class="info-value mesh-quality mono">
					{getMeshQualityBars(eero.mesh_quality_bars)}
					<span class="text-muted">({eero.mesh_quality_bars}/5)</span>
				</span>
			</div>
		{/if}
		<div class="info-item">
			<span class="info-label">Heartbeat</span>
			<span class="info-value">
				{#if eero.heartbeat_ok === true}
					<span class="text-success"><Icon name="check" size={14} /> OK</span>
				{:else if eero.heartbeat_ok === false}
					<span class="text-danger"><Icon name="x" size={14} /> Failed</span>
				{:else}
					—
				{/if}
			</span>
		</div>
		{#if eero.update_available}
			<div class="info-item">
				<span class="info-label">Update</span>
				<span class="info-value text-warning">
					<Icon name="arrow-up" size={14} /> Update available
				</span>
			</div>
		{/if}
	</div>
</section>

<section class="card detail-card">
	<h2>Connected Clients</h2>
	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">Total Clients</span>
			<span class="info-value">{eero.connected_clients_count ?? 0}</span>
		</div>
		{#if eero.connected_wireless_clients_count !== null}
			<div class="info-item">
				<span class="info-label"><Icon name="wifi" size={14} /> Wireless</span>
				<span class="info-value">{eero.connected_wireless_clients_count}</span>
			</div>
		{/if}
		{#if eero.connected_wired_clients_count !== null}
			<div class="info-item">
				<span class="info-label"><Icon name="ethernet" size={14} /> Wired</span>
				<span class="info-value">{eero.connected_wired_clients_count}</span>
			</div>
		{/if}
		{#if eero.provides_wifi !== null}
			<div class="info-item">
				<span class="info-label">Provides WiFi</span>
				<span class="info-value">
					<Icon name={eero.provides_wifi ? 'check' : 'x'} size={14} />
					{eero.provides_wifi ? 'Yes' : 'No'}
				</span>
			</div>
		{/if}
		{#if eero.bands && eero.bands.length > 0}
			<div class="info-item info-item-vertical">
				<span class="info-label">WiFi Bands</span>
				<div class="chip-list">
					{#each getUniqueBands(eero.bands) as band}
						<span class="chip">{band}</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.detail-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.info-item-vertical {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.info-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.info-value {
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.mesh-quality {
		color: var(--color-success);
		letter-spacing: 0.1em;
	}

	.text-warning {
		color: var(--color-warning);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		background-color: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
	}
</style>
