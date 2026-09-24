<!--
  GuestNetworkCard

  Network detail "Guest Network" section. Extracted from routes/network/[id]/+page.svelte
  (WP5 decomposition). Presentational only - the optimistic toggle-with-rollback logic (plan
  § 5, "Verified" write class) lives in the parent route, which owns the `network` state that
  every other card on the page also reads.
-->
<script lang="ts">
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		enabled: boolean;
		loading: boolean;
		onToggle: () => void;
	}

	let { enabled, loading, onToggle }: Props = $props();
</script>

<section class="card info-card">
	<h2>Guest Network</h2>
	<div class="guest-network-section">
		<div class="guest-status">
			<span class="guest-icon">
				<Icon name={enabled ? 'check' : 'x'} size={16} />
			</span>
			<span class="guest-label">{enabled ? 'Enabled' : 'Disabled'}</span>
		</div>
		<button
			class="btn {enabled ? 'btn-secondary' : 'btn-primary'}"
			onclick={onToggle}
			disabled={loading}
		>
			{#if loading}
				<span class="loading-spinner"></span>
			{/if}
			{enabled ? 'Disable' : 'Enable'} Guest Network
		</button>
	</div>
</section>

<style>
	.info-card {
		display: flex;
		flex-direction: column;
	}

	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.guest-network-section {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.guest-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.guest-icon {
		font-size: 1.5rem;
	}

	.guest-label {
		font-size: 1.125rem;
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.guest-network-section {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
