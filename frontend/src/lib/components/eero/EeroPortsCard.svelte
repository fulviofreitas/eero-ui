<!--
  EeroPortsCard

  Eero detail "Ethernet Ports" card. Extracted from routes/eeros/[id]/+page.svelte
  (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import { formatPortSpeed } from '$lib/utils/eero-format';

	interface Props {
		ports: EeroDetail['ethernet_ports'];
	}

	let { ports }: Props = $props();
</script>

{#if ports && ports.length > 0}
	<section class="card detail-card wide-card">
		<h2>Ethernet Ports</h2>
		<div class="ports-grid">
			{#each ports as port, i}
				<div class="port-card" class:has-carrier={port.has_carrier}>
					<div class="port-header">
						<span class="port-name">{port.port_name || `Port ${i + 1}`}</span>
						{#if port.is_wan_port}
							<span class="badge badge-info">WAN</span>
						{/if}
						{#if port.is_lte}
							<span class="badge badge-warning">LTE</span>
						{/if}
					</div>
					<span class="port-status">
						{#if port.has_carrier}
							<span class="text-success">●</span> Connected {#if port.speed}<span
									class="port-speed-badge">{formatPortSpeed(port.speed)}</span
								>{/if}
						{:else}
							<span class="text-muted">○ No link</span>
						{/if}
					</span>
					{#if port.neighbor_location}
						<div class="port-neighbor text-sm text-muted">
							→ {port.neighbor_location}{port.neighbor_port ? ` (${port.neighbor_port})` : ''}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

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

	.wide-card {
		grid-column: 1 / -1;
	}

	.ports-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	.port-card {
		background-color: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		transition: all var(--transition-fast);
	}

	.port-card.has-carrier {
		border-color: var(--color-success);
		background-color: rgba(16, 185, 129, 0.05);
	}

	.port-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.port-name {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.port-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
		flex-wrap: nowrap;
		white-space: nowrap;
	}

	.port-speed-badge {
		display: inline-block;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		background-color: var(--color-bg-primary);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		margin-left: 4px;
		vertical-align: middle;
	}

	.port-neighbor {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	@media (max-width: 768px) {
		.ports-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
