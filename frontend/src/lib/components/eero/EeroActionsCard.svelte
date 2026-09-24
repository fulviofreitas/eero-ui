<!--
  EeroActionsCard

  Eero detail "Actions" card (LED toggle, reboot). Extracted from
  routes/eeros/[id]/+page.svelte (WP5 decomposition). Presentational only - the optimistic
  LED toggle and the reboot confirm flow (plan § 5, "Verified" write class) stay in the parent
  route, which owns the `eero` state every other card on the page also reads.
-->
<script lang="ts">
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		ledOn: boolean | null;
		loading: boolean;
		onToggleLed: () => void;
		onReboot: () => void;
	}

	let { ledOn, loading, onToggleLed, onReboot }: Props = $props();
</script>

<section class="card detail-card actions-card">
	<h2>Actions</h2>
	<div class="action-buttons">
		<button class="btn btn-secondary" onclick={onToggleLed} disabled={loading}>
			{#if loading}
				<span class="loading-spinner"></span>
			{/if}
			<Icon name={ledOn ? 'moon' : 'lightbulb'} size={14} />
			{ledOn ? 'Turn LED Off' : 'Turn LED On'}
		</button>
		<button class="btn btn-danger" onclick={onReboot} disabled={loading}>
			{#if loading}
				<span class="loading-spinner"></span>
			{/if}
			<Icon name="refresh" size={14} /> Reboot Eero
		</button>
	</div>
	<p class="action-warning text-muted text-sm">
		<Icon name="alert-triangle" size={14} /> Rebooting will temporarily disconnect all devices connected
		to this node.
	</p>
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

	.actions-card {
		grid-column: 1 / -1;
	}

	.action-buttons {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.action-warning {
		margin: 0;
	}

	@media (max-width: 768px) {
		.action-buttons {
			flex-direction: column;
		}
	}
</style>
