<!--
  GenericRecordList

  Renders a list of loosely-typed records (each `Record<string, unknown>`) whose shape is not
  guaranteed by the backend contract - built for two WP6 reads that are explicitly unfixtured
  upstream (phase-6.0-revamp.md § 7 WP6, deliverable 6): an eero's client `connections` and a
  network's channel/neighbour `scan`. Each record renders as a set of InfoRows for its scalar
  (string/number/boolean) fields; array and object values are summarised rather than expanded,
  since their shape is not guaranteed either.
-->
<script lang="ts">
	import InfoRow from './InfoRow.svelte';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		records: Record<string, unknown>[];
		emptyTitle?: string;
		emptyDescription?: string;
		/** Label for each record's heading, e.g. `(record, index) => `Connection ${index + 1}``. */
		recordLabel?: (record: Record<string, unknown>, index: number) => string;
	}

	let {
		records,
		emptyTitle = 'No data',
		emptyDescription,
		recordLabel = (_record, index) => `Entry ${index + 1}`
	}: Props = $props();

	function summarize(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
		if (typeof value === 'object') {
			const keys = Object.keys(value as Record<string, unknown>);
			return `{${keys.length} field${keys.length === 1 ? '' : 's'}}`;
		}
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return String(value);
	}

	function fieldsOf(record: Record<string, unknown>): [string, unknown][] {
		return Object.entries(record);
	}
</script>

{#if records.length === 0}
	<EmptyState title={emptyTitle} description={emptyDescription} />
{:else}
	<div class="record-list">
		{#each records as record, index (index)}
			<section class="record">
				<h4 class="record-heading">{recordLabel(record, index)}</h4>
				{#each fieldsOf(record) as [key, value] (key)}
					<InfoRow label={key} value={summarize(value)} mono={typeof value !== 'object'} />
				{/each}
			</section>
		{/each}
	</div>
{/if}

<style>
	.record-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.record {
		padding: var(--space-3);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
	}

	.record-heading {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
	}
</style>
