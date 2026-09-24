<!--
  Tooltip

  Shows on hover AND focus (never hover-only — keyboard users must be able to trigger it), wired
  to the trigger via `aria-describedby` rather than relying on the visual position alone.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let idCounter = 0;

	interface Props {
		text: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		children: Snippet<[{ describedBy: string }]>;
	}

	let { text, position = 'top', children }: Props = $props();

	const id = `tooltip-${++idCounter}`;
	let visible = $state(false);

	function show() {
		visible = true;
	}

	function hide() {
		visible = false;
	}
</script>

<span
	class="tooltip-wrapper"
	role="group"
	onmouseenter={show}
	onmouseleave={hide}
	onfocusin={show}
	onfocusout={hide}
>
	{@render children({ describedBy: id })}
	{#if visible}
		<span class="tooltip tooltip-{position}" role="tooltip" {id}>{text}</span>
	{/if}
</span>

<style>
	.tooltip-wrapper {
		position: relative;
		display: inline-flex;
	}

	.tooltip {
		position: absolute;
		z-index: var(--z-dropdown);
		padding: var(--space-1) var(--space-2);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: var(--text-xs);
		white-space: nowrap;
		box-shadow: var(--shadow-md);
		pointer-events: none;
	}

	.tooltip-top {
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: var(--space-1);
	}

	.tooltip-bottom {
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: var(--space-1);
	}

	.tooltip-left {
		right: 100%;
		top: 50%;
		transform: translateY(-50%);
		margin-right: var(--space-1);
	}

	.tooltip-right {
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
		margin-left: var(--space-1);
	}
</style>
