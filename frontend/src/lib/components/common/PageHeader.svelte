<!--
  PageHeader

  Replaces the `<header class="page-header">` block redefined in 9 route files (see
  .claude/rules/lessons-learned.md "UI Consistency Patterns"). Title + optional description,
  with an `actions` snippet for page-level buttons (refresh, export, etc.).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		actions?: Snippet;
	}

	let { title, description, actions }: Props = $props();
</script>

<header class="page-header">
	<div class="page-header-text">
		<h1>{title}</h1>
		{#if description}
			<p class="text-muted">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="page-header-actions">
			{@render actions()}
		</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.page-header-text h1 {
		margin: 0;
	}

	.page-header-text p {
		margin: var(--space-1) 0 0;
	}

	.page-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
