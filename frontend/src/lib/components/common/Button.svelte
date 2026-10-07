<!--
  Button

  The canonical button for every page/card/form/dialog action in this app. Wraps the shared
  `.btn`/`.btn-*` utility classes (app.css, "Button" section) so loading state (spinner +
  `aria-busy`, auto-disabled), the leading icon, and attribute forwarding don't have to be
  hand-rolled at every call site.

  Size policy (enforced visually by app.css's `.btn`/`.btn-sm` min-height, not just by convention):
  - `md` (default) - every page/card/form/dialog action, including DetailHeader action rows and
    card header/body actions. This is the right default for almost everything.
  - `sm` - ONLY for dense in-row actions inside tables/lists (DataTable rows, record lists,
    schedule rows, chip-like inline actions). Never mix `sm` and `md` buttons in the same row.

  Icon-only buttons (no visible text) MUST pass `label` so the rendered `aria-label` describes
  the action to assistive tech; `children` is optional for exactly that case.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from '#lib/icons/paths.js';

	interface Props extends Omit<HTMLButtonAttributes, 'type' | 'disabled' | 'class' | 'children'> {
		variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
		size?: 'sm' | 'md';
		type?: 'button' | 'submit';
		disabled?: boolean;
		loading?: boolean;
		icon?: IconName;
		class?: string;
		/** Required for icon-only buttons (no `children`) - becomes the button's aria-label. */
		label?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		icon,
		class: className,
		label,
		onclick,
		children,
		...rest
	}: Props = $props();

	const isDisabled = $derived(disabled || loading);
</script>

<button
	{...rest}
	{type}
	class={['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className].filter(Boolean).join(' ')}
	disabled={isDisabled}
	aria-busy={loading}
	aria-label={label}
	onclick={(e) => onclick?.(e)}
>
	{#if loading}
		<span class="loading-spinner" aria-hidden="true"></span>
	{:else if icon}
		<Icon name={icon} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	button.btn-sm .loading-spinner {
		width: 12px;
		height: 12px;
		border-width: 2px;
	}
</style>
