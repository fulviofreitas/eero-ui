<!--
  Confirmation Dialog Component
  
  Modal dialog for confirming destructive actions.
-->
<script lang="ts">
	import { confirmDialog, uiStore } from '$stores';
	import { fade, scale } from 'svelte/transition';

	let loading = false;

	async function handleConfirm() {
		if (!$confirmDialog) return;
		
		loading = true;
		try {
			await $confirmDialog.onConfirm();
		} finally {
			loading = false;
			uiStore.closeConfirm();
		}
	}

	function handleCancel() {
		uiStore.closeConfirm();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCancel();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $confirmDialog}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div 
		class="modal-backdrop"
		transition:fade={{ duration: 150 }}
		on:click={handleCancel}
	>
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div 
			class="modal"
			transition:scale={{ duration: 150, start: 0.95 }}
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<h2 id="confirm-title" class="modal-title">
				{$confirmDialog.title}
			</h2>
			
			<p class="modal-message">
				{$confirmDialog.message}
			</p>
			
			<div class="modal-actions">
				<button 
					class="btn btn-secondary"
					on:click={handleCancel}
					disabled={loading}
				>
					{$confirmDialog.cancelText || 'Cancel'}
				</button>
				<button 
					class="btn {$confirmDialog.danger ? 'btn-danger' : 'btn-primary'}"
					on:click={handleConfirm}
					disabled={loading}
				>
					{#if loading}
						<span class="loading-spinner"></span>
					{/if}
					{$confirmDialog.confirmText || 'Confirm'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background-color: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		max-width: 400px;
		width: 90%;
	}

	.modal-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: var(--space-3);
	}

	.modal-message {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-6);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.loading-spinner {
		width: 16px;
		height: 16px;
		border-width: 2px;
	}
</style>
