<!--
  Modal

  Generic backdrop + card container, extracted from the `.modal-backdrop` markup duplicated
  across route files (network/[id], profiles/[id]) on top of the pattern ConfirmDialog already
  used. Caller owns the body/footer content via snippets; this component owns the backdrop,
  outside-click-to-close, Escape-to-close, and (WP5 A5) initial focus / focus trap (via the
  shared `trapFocus` action) plus focus restore to the opener on close (handled here, not in the
  action - see focusTrap.ts).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { trapFocus } from '$lib/utils/focusTrap';

	interface Props {
		open: boolean;
		title: string;
		onClose: () => void;
		children: Snippet;
	}

	let { open, title, onClose, children }: Props = $props();

	// Stable for the lifetime of this component instance - safe even if multiple Modals were
	// ever mounted at once (they wouldn't share an id and collide on aria-labelledby).
	const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;

	// A5 (WP5 a11y fix): restore focus to the opener on close, keyed off `open` itself rather
	// than this element unmounting - unmount only happens after the close `transition:` outro
	// finishes (see focusTrap.ts for the full rationale).
	// `$effect.pre` (runs before the DOM update that mounts the dialog and its `trapFocus`
	// action) so the opener is captured before that action's own initial-focus steals it.
	let openerEl: HTMLElement | null = null;
	$effect.pre(() => {
		if (open) {
			openerEl = document.activeElement as HTMLElement | null;
		} else if (openerEl) {
			openerEl.focus();
			openerEl = null;
		}
	});

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
			aria-labelledby={titleId}
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<h2 id={titleId}>{title}</h2>
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
