<!--
  DetailHeader

  Header for the four detail routes (devices/[id], profiles/[id], eeros/[id], network/[id]).
  Breadcrumb-ready: a back link, title, optional subtitle, an optional status snippet (e.g. a
  StatusBadge) and an actions snippet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Route to navigate back to, e.g. `/devices`. */
		backHref: string;
		/** Accessible label for the back link, e.g. "Back to devices". */
		backLabel?: string;
		title: string;
		subtitle?: string;
		status?: Snippet;
		actions?: Snippet;
	}

	let { backHref, backLabel = 'Back', title, subtitle, status, actions }: Props = $props();
</script>

<header class="detail-header">
	<a class="back-link" href={backHref}>
		<Icon name="arrow-left" size={14} />
		{backLabel}
	</a>
	<div class="detail-header-row">
		<div class="detail-header-text">
			<div class="detail-header-title-row">
				<h1>{title}</h1>
				{#if status}
					{@render status()}
				{/if}
			</div>
			{#if subtitle}
				<p class="text-muted">{subtitle}</p>
			{/if}
		</div>
		{#if actions}
			<div class="detail-header-actions">
				{@render actions()}
			</div>
		{/if}
	</div>
</header>

<style>
	.detail-header {
		margin-bottom: var(--space-6);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
	}

	.back-link:hover {
		color: var(--color-text-primary);
	}

	.detail-header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.detail-header-title-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.detail-header-text h1 {
		margin: 0;
	}

	.detail-header-text p {
		margin: var(--space-1) 0 0;
	}

	.detail-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.detail-header-row {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
