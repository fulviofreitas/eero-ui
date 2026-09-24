<!--
  EeroStatCard

  Dashboard "Eero Nodes" stat card. Extracted from routes/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroSummary } from '$api/types';

	interface Props {
		eeros: EeroSummary[];
	}

	let { eeros }: Props = $props();

	let onlineCount = $derived(
		eeros.filter((e) => e.status === 'online' || e.status === 'green').length
	);
</script>

<a href="/eeros" class="card stat-card clickable-card">
	<div class="stat-header">
		<span class="stat-label">Eero Nodes</span>
	</div>
	<div class="stat-value">{eeros.length}</div>
	<div class="stat-meta">
		<span class="text-success">{onlineCount} online</span>
	</div>
	<div class="stat-breakdown">
		{#each eeros.slice(0, 4) as eero}
			<div class="breakdown-item">
				<span class="breakdown-name">
					<span
						class="status-dot small"
						class:online={eero.status === 'online' || eero.status === 'green'}
					></span>
					{eero.location || eero.model}
				</span>
				<span class="badge {eero.is_gateway ? 'badge-info' : 'badge-neutral'} badge-sm">
					{eero.is_gateway ? 'Gateway' : 'Node'}
				</span>
			</div>
		{/each}
		{#if eeros.length > 4}
			<div class="breakdown-item text-muted">
				<span>+{eeros.length - 4} more</span>
			</div>
		{/if}
	</div>
	<span class="card-hint">View all eeros →</span>
</a>

<style>
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

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.stat-meta {
		font-size: 0.875rem;
		display: flex;
		gap: var(--space-2);
	}

	.stat-breakdown {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
	}

	.breakdown-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.status-dot.small {
		width: 6px;
		height: 6px;
	}

	.badge-sm {
		font-size: 0.625rem;
		padding: 1px 6px;
	}

	.clickable-card {
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast),
			box-shadow var(--transition-fast);
		position: relative;
	}

	.clickable-card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.card-hint {
		font-size: 0.75rem;
		color: var(--color-accent);
		opacity: 0;
		transition: opacity var(--transition-fast);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.clickable-card:hover .card-hint {
		opacity: 1;
	}
</style>
