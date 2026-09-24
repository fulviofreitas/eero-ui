<!--
  ProfileStatusCard

  Profile detail "Internet Access {Paused|Active}" banner. Extracted from
  routes/profiles/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		paused: boolean;
	}

	let { paused }: Props = $props();
</script>

<section class="card status-card" class:paused>
	{#if paused}
		<div class="status-message paused">
			<span class="status-icon">⏸</span>
			<div>
				<strong>Internet Access Paused</strong>
				<p class="text-sm text-muted">
					All devices in this profile are currently blocked from accessing the internet.
				</p>
			</div>
		</div>
	{:else}
		<div class="status-message active">
			<span class="status-icon"><Icon name="check" size={14} /></span>
			<div>
				<strong>Internet Access Active</strong>
				<p class="text-sm text-muted">Devices in this profile have normal internet access.</p>
			</div>
		</div>
	{/if}
</section>

<style>
	.status-card {
		margin-bottom: var(--space-6);
	}

	.status-card.paused {
		border-color: var(--color-warning);
		background-color: rgba(245, 180, 50, 0.05);
	}

	.status-message {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.status-icon {
		font-size: 1.5rem;
	}

	.status-message.paused {
		color: var(--color-warning);
	}

	.status-message.active {
		color: var(--color-success);
	}

	.status-message p {
		margin: var(--space-1) 0 0 0;
		color: var(--color-text-secondary);
	}
</style>
