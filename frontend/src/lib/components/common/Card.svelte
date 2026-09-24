<!--
  Card

  Generic surface container, extracted from the `.card`/`.card-header` rules duplicated ad hoc
  across route files. Padding variants and an optional `actions` snippet next to the title.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		actions?: Snippet;
		children: Snippet;
	}

	let { title, padding = 'md', actions, children }: Props = $props();
</script>

<section class="card card-padding-{padding}">
	{#if title || actions}
		<div class="card-header">
			{#if title}
				<h3 class="card-title">{title}</h3>
			{/if}
			{#if actions}
				<div class="card-actions">
					{@render actions()}
				</div>
			{/if}
		</div>
	{/if}
	<div class="card-body">
		{@render children()}
	</div>
</section>

<style>
	.card {
		background-color: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.card-padding-none {
		padding: 0;
	}
	.card-padding-none .card-header {
		padding: var(--space-3) var(--space-4);
	}

	.card-padding-sm {
		padding: var(--space-3);
	}

	.card-padding-md {
		padding: var(--space-4);
	}

	.card-padding-lg {
		padding: var(--space-6);
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.card-padding-none .card-header {
		margin-bottom: 0;
	}

	.card-title {
		margin: 0;
		font-size: var(--text-lg);
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.card-padding-none .card-body {
		padding: var(--space-4);
	}
</style>
