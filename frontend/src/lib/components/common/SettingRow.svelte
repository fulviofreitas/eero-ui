<!--
  SettingRow

  Single row for one setting: label -> current value -> inline control.
  Introduced by the Security & WAN consistency pass (2026-10-07) to replace
  the old pattern of a read-only `InfoRow`/badge-row plus a duplicate,
  independently-rendered write control for the same field - every setting
  now appears exactly once.

  `value` accepts either a plain string or a `Snippet` (for badges, mono
  text, lists, etc). `readonly` rows never render `control` and are styled
  distinctly (muted value text + a small "Read-only" tag) so an operator can
  tell at a glance which rows can be changed at all.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** Secondary text under the label (e.g. "Derived from subnet IP"). */
		hint?: string;
		value?: string | Snippet;
		control?: Snippet;
		readonly?: boolean;
	}

	let { label, hint, value, control, readonly = false }: Props = $props();

	function isSnippet(candidate: unknown): candidate is Snippet {
		return typeof candidate === 'function';
	}
</script>

<div class="setting-row" class:readonly>
	<div class="setting-row-label">
		<span class="setting-row-label-text">{label}</span>
		{#if hint}
			<span class="setting-row-hint">{hint}</span>
		{/if}
	</div>
	<div class="setting-row-value">
		<span class="setting-row-value-text">
			{#if isSnippet(value)}
				{@render value()}
			{:else}
				{value === undefined || value === null || value === '' ? '—' : value}
			{/if}
		</span>
		{#if readonly}
			<span class="setting-row-readonly-tag">Read-only</span>
		{/if}
	</div>
	{#if control && !readonly}
		<div class="setting-row-control">{@render control()}</div>
	{/if}
</div>

<style>
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.setting-row:last-child {
		border-bottom: none;
	}

	.setting-row-label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 140px;
	}

	.setting-row-label-text {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.setting-row-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.setting-row-value {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.setting-row-value-text {
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		text-align: right;
	}

	.setting-row.readonly .setting-row-value-text {
		color: var(--color-text-muted);
	}

	.setting-row-readonly-tag {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background-color: var(--color-bg-secondary);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.setting-row-control {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	@media (max-width: 480px) {
		.setting-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.setting-row-value {
			width: 100%;
			justify-content: space-between;
		}

		.setting-row-control {
			width: 100%;
		}
	}
</style>
