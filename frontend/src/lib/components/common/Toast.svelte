<!--
  Toast Notification Component
  
  Displays toast notifications in the corner of the screen.
-->
<script lang="ts">
	import { toasts, uiStore } from '$stores';
	import { fly } from 'svelte/transition';
</script>

<div class="toast-container" aria-live="polite">
	{#each $toasts as toast (toast.id)}
		<div 
			class="toast {toast.type}"
			role="alert"
			transition:fly={{ x: 100, duration: 200 }}
		>
			<span class="toast-icon">
				{#if toast.type === 'success'}
					✓
				{:else if toast.type === 'error'}
					✕
				{:else if toast.type === 'warning'}
					⚠
				{:else}
					ℹ
				{/if}
			</span>
			<span class="toast-message">{toast.message}</span>
			<button 
				class="toast-close"
				on:click={() => uiStore.removeToast(toast.id)}
				aria-label="Dismiss"
			>
				×
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: var(--space-4);
		right: var(--space-4);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 400px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.toast.success {
		border-left: 3px solid var(--color-success);
	}

	.toast.error {
		border-left: 3px solid var(--color-danger);
	}

	.toast.warning {
		border-left: 3px solid var(--color-warning);
	}

	.toast.info {
		border-left: 3px solid var(--color-info);
	}

	.toast-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.toast.success .toast-icon { color: var(--color-success); }
	.toast.error .toast-icon { color: var(--color-danger); }
	.toast.warning .toast-icon { color: var(--color-warning); }
	.toast.info .toast-icon { color: var(--color-info); }

	.toast-message {
		flex: 1;
		font-size: 0.875rem;
	}

	.toast-close {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		padding: 0;
		margin-left: var(--space-2);
	}

	.toast-close:hover {
		color: var(--color-text-primary);
	}
</style>
