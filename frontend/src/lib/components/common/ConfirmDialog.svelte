<!--
  Confirmation Dialog Component
  
  Modal dialog for confirming destructive actions.
-->
<script lang="ts">
	import { confirmDialog, uiStore } from '$stores';
	import { fade, scale } from 'svelte/transition';
	import { trapFocus } from '$lib/utils/focusTrap';

	let loading = $state(false);

	// A5 (WP5 a11y fix): restore focus to the opener on close, keyed off `$confirmDialog` itself
	// rather than this element unmounting - unmount only happens after the close `transition:`
	// outro finishes, which is both a visible delay and unreliable in jsdom (no real Web
	// Animations timing). See focusTrap.ts for the corresponding note on why the trap action
	// itself does not handle this.
	// `$effect.pre` (runs before the DOM update that mounts the dialog and its `trapFocus`
	// action) so the opener is captured before that action's own initial-focus steals it.
	let openerEl: HTMLElement | null = null;
	$effect.pre(() => {
		if ($confirmDialog) {
			openerEl = document.activeElement as HTMLElement | null;
		} else if (openerEl) {
			openerEl.focus();
			openerEl = null;
		}
	});

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

<svelte:window onkeydown={handleKeydown} />

{#if $confirmDialog}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="modal-backdrop" transition:fade={{ duration: 150 }} onclick={handleCancel}>
		<!-- A5 (WP5 a11y fix): role="dialog" below satisfies a11y_no_static_element_interactions,
		     and Escape is handled globally via svelte:window - the pre-existing svelte-ignore for
		     both rules on this element is no longer needed and was removed once lint confirmed it. -->
		<div
			class="modal"
			transition:scale={{ duration: 150, start: 0.95 }}
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			tabindex="-1"
			use:trapFocus
		>
			<h2 id="confirm-title" class="modal-title">
				{$confirmDialog.title}
			</h2>

			<p class="modal-message">
				{$confirmDialog.message}
			</p>

			{#if $confirmDialog.details && $confirmDialog.details.length > 0}
				<ul class="modal-details">
					{#each $confirmDialog.details as detail}
						<li>{detail}</li>
					{/each}
				</ul>
			{/if}

			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={handleCancel} disabled={loading}>
					{$confirmDialog.cancelText || 'Cancel'}
				</button>
				<button
					class="btn {$confirmDialog.danger ? 'btn-danger' : 'btn-primary'}"
					onclick={handleConfirm}
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
		z-index: var(--z-modal);
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

	.modal-details {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-6);
		padding-left: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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
