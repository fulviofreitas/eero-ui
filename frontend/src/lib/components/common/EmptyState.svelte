<!--
  EmptyState

  Standard "nothing here" placeholder for lists/tables — replaces bespoke empty-state markup
  in DeviceList and elsewhere.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons/paths';

	interface Props {
		icon?: IconName;
		title: string;
		description?: string;
		action?: Snippet;
	}

	let { icon = 'inbox', title, description, action }: Props = $props();
</script>

<div class="empty-state">
	<span class="empty-icon"><Icon name={icon} size={32} /></span>
	<p class="empty-title">{title}</p>
	{#if description}
		<p class="empty-description text-muted">{description}</p>
	{/if}
	{#if action}
		<div class="empty-action">
			{@render action()}
		</div>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-12);
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-icon {
		color: var(--color-text-muted);
		margin-bottom: var(--space-2);
	}

	.empty-title {
		margin: 0;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.empty-description {
		margin: 0;
		font-size: var(--text-sm);
		max-width: 320px;
	}

	.empty-action {
		margin-top: var(--space-2);
	}
</style>
