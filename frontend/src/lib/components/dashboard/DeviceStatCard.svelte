<!--
  DeviceStatCard

  Dashboard "Devices" stat card. Extracted from routes/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		connected: number;
		total: number;
		wireless: number;
		wired: number;
	}

	let { connected, total, wireless, wired }: Props = $props();
</script>

<a href="/devices" class="card stat-card clickable-card">
	<div class="stat-header">
		<span class="stat-label">Devices</span>
	</div>
	<div class="stat-value">{connected}</div>
	<div class="stat-meta">
		<span class="text-success">{connected} connected</span>
		<span class="text-muted">• {total} total</span>
	</div>
	<div class="stat-breakdown">
		<div class="breakdown-item">
			<span><Icon name="wifi" size={14} /> Wireless</span>
			<span class="mono">{wireless}</span>
		</div>
		<div class="breakdown-item">
			<span><Icon name="ethernet" size={14} /> Wired</span>
			<span class="mono">{wired}</span>
		</div>
	</div>
	<span class="card-hint">View all devices →</span>
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
