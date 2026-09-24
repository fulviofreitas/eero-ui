<!--
  TimeRangeSelector

  Extracted from the byte-identical `.time-range-selector` markup duplicated across
  SpeedtestChart, ClientCountChart and BandwidthChart. Generic over the option value type so
  each caller keeps its own literal union (`'24h' | '7d' | '30d'`, etc.).
-->
<script lang="ts" generics="T extends string">
	interface RangeOption<T> {
		value: T;
		label: string;
	}

	interface Props<T> {
		options: RangeOption<T>[];
		value: T;
		onChange: (value: T) => void;
		/** Accessible name for the group; defaults to a generic label. */
		label?: string;
	}

	let { options, value, onChange, label = 'Time range' }: Props<T> = $props();
</script>

<div class="time-range-selector" role="group" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			class:active={value === option.value}
			aria-pressed={value === option.value}
			onclick={() => onChange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.time-range-selector {
		display: flex;
		gap: var(--space-1);
	}

	.time-range-selector button {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		background: var(--color-bg-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.time-range-selector button:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	.time-range-selector button.active {
		background: var(--color-accent);
		color: var(--color-on-accent);
		border-color: var(--color-accent);
	}
</style>
