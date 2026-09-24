<!--
  Modal

  Generic backdrop + card container, extracted from the `.modal-backdrop` markup duplicated
  across route files (network/[id], profiles/[id]) on top of the pattern ConfirmDialog already
  used. Caller owns the body/footer content via snippets; this component owns the backdrop,
  outside-click-to-close and Escape-to-close only.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		open: boolean;
		title: string;
		onClose: () => void;
		children: Snippet;
	}

	let { open, title, onClose, children }: Props = $props();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="modal-backdrop" transition:fade={{ duration: 150 }} onclick={onClose}>
		<div
			class="modal-card card"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<h2>{title}</h2>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: var(--color-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
	}

	.modal-card {
		width: 100%;
		max-width: 400px;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.modal-card h2 {
		margin: 0;
		font-size: 1.125rem;
	}
</style>
