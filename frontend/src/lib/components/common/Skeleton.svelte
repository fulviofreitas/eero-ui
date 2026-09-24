<!--
  Skeleton

  Wires the existing `.skeleton` shimmer (app.css:511-521, defined but used zero times before
  this component) into list/card/table loading states, replacing full-block spinners. The
  shimmer animation is disabled globally under `prefers-reduced-motion: reduce`
  (app.css:677-686), so this component needs no extra motion handling of its own.
-->
<script lang="ts">
	interface Props {
		variant?: 'text' | 'card' | 'table-rows';
		/** `variant="text"`: number of lines. */
		lines?: number;
		/** `variant="table-rows"`: number of rows. */
		rows?: number;
		/** `variant="table-rows"`: number of cells per row. */
		columns?: number;
		/** `variant="card"`: block height. */
		height?: string;
	}

	let { variant = 'text', lines = 3, rows = 5, columns = 4, height = '120px' }: Props = $props();
</script>

<div class="skeleton-wrapper" role="status" aria-label="Loading">
	{#if variant === 'text'}
		{#each Array(lines) as _, i (i)}
			<div class="skeleton skeleton-line" style="width: {i === lines - 1 ? '60%' : '100%'}"></div>
		{/each}
	{:else if variant === 'card'}
		<div class="skeleton skeleton-card" style="height: {height}"></div>
	{:else if variant === 'table-rows'}
		{#each Array(rows) as _, r (r)}
			<div class="skeleton-row">
				{#each Array(columns) as _, c (c)}
					<div class="skeleton skeleton-cell"></div>
				{/each}
			</div>
		{/each}
	{/if}
	<span class="sr-only">Loading…</span>
</div>

<style>
	.skeleton-wrapper {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
	}

	.skeleton-line {
		height: 0.875rem;
	}

	.skeleton-card {
		width: 100%;
	}

	.skeleton-row {
		display: flex;
		gap: var(--space-3);
	}

	.skeleton-cell {
		height: 1rem;
		flex: 1;
	}
</style>
