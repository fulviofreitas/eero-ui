<!--
  ErrorState

  Standard inline error placeholder with an optional retry action.
-->
<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		message: string;
		onRetry?: () => void;
		retryLabel?: string;
	}

	let { message, onRetry, retryLabel = 'Retry' }: Props = $props();
</script>

<div class="error-state" role="alert">
	<span class="error-icon"><Icon name="alert-triangle" size={32} /></span>
	<p class="error-message">{message}</p>
	{#if onRetry}
		<button type="button" class="btn btn-secondary btn-sm" onclick={onRetry}>
			<Icon name="refresh" size={14} />
			{retryLabel}
		</button>
	{/if}
</div>

<style>
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		text-align: center;
	}

	.error-icon {
		color: var(--color-danger);
	}

	.error-message {
		margin: 0;
		color: var(--color-text-secondary);
		max-width: 400px;
	}
</style>
