<!--
  RenameModal

  Shared single-field rename form on the Modal primitive. Replaces the duplicated
  NetworkRenameModal / ProfileRenameModal pair, the native `prompt()` the device rename used,
  and the inline location box on the eero Actions card - every rename in the app is now the
  same dialog. The field is local state, reset to `initialValue` each time the dialog opens;
  the caller only sees the trimmed value on submit and owns what happens next (a confirm
  dialog, an optimistic store write, closing the modal).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$components/common/Modal.svelte';
	import Button from '$components/common/Button.svelte';

	interface Props {
		open: boolean;
		title: string;
		/** Field label - also the input's accessible name. */
		label?: string;
		initialValue: string;
		submitting?: boolean;
		onClose: () => void;
		/** Fired with the trimmed value; never fired for a blank one. */
		onSubmit: (name: string) => void;
	}

	let {
		open,
		title,
		label = 'New name',
		initialValue,
		submitting = false,
		onClose,
		onSubmit
	}: Props = $props();

	const inputId = `rename-input-${Math.random().toString(36).slice(2)}`;

	let value = $state('');

	// Reset on open only - `initialValue` is untracked so a background refetch of the entity
	// while the dialog is open doesn't clobber what the user is typing.
	$effect.pre(() => {
		if (open) value = untrack(() => initialValue);
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
	}
</script>

<Modal {open} {title} {onClose}>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for={inputId}>{label}</label>
		<input id={inputId} class="modal-input" type="text" bind:value disabled={submitting} />
		<div class="modal-actions">
			<Button type="button" onclick={onClose} disabled={submitting}>Cancel</Button>
			<Button type="submit" variant="primary" disabled={!value.trim()} loading={submitting}>
				Save
			</Button>
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
