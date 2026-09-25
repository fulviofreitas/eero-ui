<!--
  Button

  Wraps the existing `.btn`/`.btn-*` utility classes (app.css:315-378) in a component so
  loading state (spinner + `aria-busy`, auto-disabled) and an icon slot don't have to be
  hand-rolled at every call site.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons/paths';

	interface Props {
		variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
		size?: 'sm' | 'md';
		type?: 'button' | 'submit';
		disabled?: boolean;
		loading?: boolean;
		icon?: IconName;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		icon,
		onclick,
		children
	}: Props = $props();

	const isDisabled = $derived(disabled || loading);
</script>

<button
	{type}
	class="btn btn-{variant}"
	class:btn-sm={size === 'sm'}
	disabled={isDisabled}
	aria-busy={loading}
	onclick={(e) => onclick?.(e)}
>
	{#if loading}
		<span class="loading-spinner" aria-hidden="true"></span>
	{:else if icon}
		<Icon name={icon} size={size === 'sm' ? 14 : 16} />
	{/if}
	{@render children()}
</button>

<style>
	button.btn-sm .loading-spinner {
		width: 12px;
		height: 12px;
		border-width: 2px;
	}
</style>
