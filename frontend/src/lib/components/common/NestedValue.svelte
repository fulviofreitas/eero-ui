<!--
  NestedValue

  Generic renderer for a raw-envelope-passthrough value that doesn't have a
  dedicated structured renderer yet (SecurityWanCard bug-fix follow-up,
  2026-09-25: several InfoRows were rendering `JSON.stringify(...)` directly,
  producing a wall of raw JSON in the UI - see maintainer screenshot).

  Any `InfoRow` (or card) that would otherwise stringify an object/array
  falls back to this component instead: objects become an indented
  key/value sub-list, arrays become a comma list (primitives) or a mono
  list (objects), and everything bottoms out at "–" for missing values.
  Never renders `JSON.stringify` output.
-->
<script lang="ts">
	import NestedValue from './NestedValue.svelte';

	interface Props {
		value: unknown;
	}

	let { value }: Props = $props();

	function humanizeKey(key: string): string {
		return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function isPlainObject(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	function primitiveLabel(v: unknown): string {
		if (v === null || v === undefined || v === '') return '–';
		if (typeof v === 'boolean') return v ? 'Yes' : 'No';
		return String(v);
	}

	let entries = $derived(isPlainObject(value) ? Object.entries(value) : []);
	let items = $derived(Array.isArray(value) ? value : []);
	let arrayIsPrimitive = $derived(
		items.every((item) => !isPlainObject(item) && !Array.isArray(item))
	);
</script>

{#if value === null || value === undefined}
	<span class="nested-empty">–</span>
{:else if isPlainObject(value)}
	{#if entries.length === 0}
		<span class="nested-empty">–</span>
	{:else}
		<ul class="nested-list">
			{#each entries as [key, val] (key)}
				<li class="nested-item">
					<span class="nested-key">{humanizeKey(key)}</span>
					<span class="nested-value">
						{#if isPlainObject(val) || Array.isArray(val)}
							<NestedValue value={val} />
						{:else}
							{primitiveLabel(val)}
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
{:else if Array.isArray(value)}
	{#if items.length === 0}
		<span class="nested-empty">–</span>
	{:else if arrayIsPrimitive}
		<span class="nested-array-inline">{items.map((item) => primitiveLabel(item)).join(', ')}</span>
	{:else}
		<ul class="nested-mono-list">
			{#each items as item, i (i)}
				<li><NestedValue value={item} /></li>
			{/each}
		</ul>
	{/if}
{:else}
	<span>{primitiveLabel(value)}</span>
{/if}

<style>
	.nested-empty {
		color: var(--color-text-muted);
	}

	.nested-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.nested-item {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}

	.nested-key {
		color: var(--color-text-secondary);
	}

	.nested-value {
		color: var(--color-text-primary);
		text-align: right;
		font-family: var(--font-mono);
	}

	.nested-array-inline {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.nested-mono-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
</style>
