<!--
  NetworkRenameModal

  Network rename input dialog. Extracted from routes/network/[id]/+page.svelte
  (WP5 decomposition), now built on the shared Modal primitive instead of a bespoke
  `.modal-backdrop` block (one of the four duplicates the plan flags).
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';

	interface Props {
		open: boolean;
		value: string;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (name: string) => void;
		onValueChange: (value: string) => void;
	}

	let { open, value, submitting, onClose, onSubmit, onValueChange }: Props = $props();

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit(value);
	}
</script>

<Modal {open} title="Rename Network" {onClose}>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for="rename-network-input">New name</label>
		<input
			id="rename-network-input"
			class="modal-input"
			type="text"
			{value}
			oninput={(e) => onValueChange(e.currentTarget.value)}
			disabled={submitting}
		/>
		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={onClose} disabled={submitting}>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={submitting || !value.trim()}>
				{#if submitting}
					<span class="loading-spinner"></span>
				{/if}
				Save
			</button>
		</div>
	</form>
</Modal>

<style>
	.modal-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.modal-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
		box-sizing: border-box;
	}

	.modal-input:focus {
		border-color: var(--color-accent);
	}

	.modal-input:focus-visible {
		box-shadow: var(--focus-ring);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
