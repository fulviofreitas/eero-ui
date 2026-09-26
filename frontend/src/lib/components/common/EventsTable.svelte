<!--
  EventsTable

  Shared table renderer for loosely-typed event records (each `Record<string, unknown>`, shape
  not guaranteed by the backend contract) - used by EventsCard's network events and
  BackupInternetCard's cellular events (bug-fix follow-up, 2026-09-25: both previously rendered
  through GenericRecordList as a flat card-per-record list with no row separators; maintainer
  screenshot asked for a proper table).

  Columns are located structurally (a handful of candidate key names per column) rather than
  assumed, since neither event shape is fixtured upstream. Any field that doesn't map to Time/
  Type/Message is collapsed into a per-row `<details>` disclosure rendered via NestedValue -
  never `JSON.stringify`.
-->
<script lang="ts">
	import DataTable, { type DataTableColumn } from './DataTable.svelte';
	import NestedValue from './NestedValue.svelte';
	import { formatShortDateTime } from '$lib/utils/format-datetime';

	interface EventRow {
		event: Record<string, unknown>;
		index: number;
	}

	interface Props {
		/** Stable identifier for this table's DataTable instance (column-visibility storage key). */
		id: string;
		events: Record<string, unknown>[];
		loading?: boolean;
		emptyTitle?: string;
		emptyDescription?: string;
	}

	let { id, events, loading = false, emptyTitle = 'No events', emptyDescription }: Props = $props();

	const TIME_KEYS = ['timestamp', 'time', 'created_at', 'occurred_at', 'date'];
	const TYPE_KEYS = ['type', 'category', 'event_type', 'kind'];
	const MESSAGE_KEYS = ['message', 'title', 'description', 'summary'];

	function findKey(records: Record<string, unknown>[], candidates: string[]): string | null {
		for (const key of candidates) {
			if (records.some((r) => r[key] !== null && r[key] !== undefined)) return key;
		}
		return null;
	}

	let timeKey = $derived(findKey(events, TIME_KEYS));
	let typeKey = $derived(findKey(events, TYPE_KEYS));
	let messageKey = $derived(findKey(events, MESSAGE_KEYS));
	let knownKeys = $derived(new Set([timeKey, typeKey, messageKey].filter((k): k is string => !!k)));

	function extraFields(row: Record<string, unknown>): Record<string, unknown> {
		const extra: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(row)) {
			if (!knownKeys.has(key)) extra[key] = value;
		}
		return extra;
	}

	function hasExtra(row: Record<string, unknown>): boolean {
		return Object.keys(extraFields(row)).length > 0;
	}

	let rowsWithIndex = $derived(events.map((event, index) => ({ event, index })));

	function getRowId(row: EventRow): string {
		const t = timeKey ? row.event[timeKey] : undefined;
		return typeof t === 'string' ? `${t}-${row.index}` : String(row.index);
	}

	let columns = $derived.by(() => {
		const cols: DataTableColumn<EventRow>[] = [];
		const tKey = timeKey;
		const tyKey = typeKey;
		const mKey = messageKey;

		if (tKey) {
			cols.push({
				key: 'time',
				header: 'Time',
				sortable: true,
				required: true,
				width: '160px',
				accessor: ({ event }) => {
					const value = event[tKey];
					if (typeof value !== 'string') return null;
					const parsed = Date.parse(value);
					return Number.isNaN(parsed) ? null : parsed;
				},
				render: timeCell
			});
		}
		if (tyKey) {
			cols.push({
				key: 'type',
				header: 'Type',
				accessor: ({ event }) => (event[tyKey] != null ? String(event[tyKey]) : '—')
			});
		}
		if (mKey) {
			cols.push({
				key: 'message',
				header: 'Message',
				accessor: ({ event }) => (event[mKey] != null ? String(event[mKey]) : '—')
			});
		}
		cols.push({ key: 'details', header: 'Details', render: detailsCell });
		return cols;
	});
</script>

{#snippet timeCell({ event }: EventRow)}
	{formatShortDateTime(
		timeKey && typeof event[timeKey] === 'string' ? (event[timeKey] as string) : null
	)}
{/snippet}

{#snippet detailsCell({ event }: EventRow)}
	{#if hasExtra(event)}
		<details class="event-details">
			<summary>Details</summary>
			<NestedValue value={extraFields(event)} />
		</details>
	{:else}
		<span class="text-muted">—</span>
	{/if}
{/snippet}

<DataTable
	id="events-{id}"
	{columns}
	rows={rowsWithIndex}
	{getRowId}
	{loading}
	{emptyTitle}
	{emptyDescription}
	showColumnToggle={false}
/>

<style>
	.event-details {
		text-align: left;
	}

	.event-details summary {
		cursor: pointer;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.event-details :global(.nested-list) {
		margin-top: var(--space-2);
	}
</style>
