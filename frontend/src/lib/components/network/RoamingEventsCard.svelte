<!--
  RoamingEventsCard

  Device roaming events (eero-ui#431), `GET /metrics/roaming` via `roamingStore`. Used in two
  places with the same component: the network page's "Roaming" tab (networkId only - every
  device on the network, with a "most roaming devices" summary that can filter the list down to
  one device), and the device detail page's roaming section (networkId + deviceId - that one
  device's history only, no summary, no device column).

  The store is shared across both call sites (one store per network/device filter combination at
  a time), so every fetch call here passes `deviceId` explicitly - `null` in network mode unless
  a top roamer is selected - rather than relying on whatever the store already held, per
  lessons-learned "Raw Passthrough + One Shared Session" (same "a store can leak the other view's
  filter" class of bug, here within a single session rather than across logout).
-->
<script lang="ts">
	import { roamingStore, ROAMING_RANGE_OPTIONS } from '#lib/stores/roaming.js';
	import type { RoamingEvent, RoamingEventType } from '#lib/api/types.js';
	import Card from '#lib/components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/common/DataTable.svelte';
	import ErrorState from '#lib/components/common/ErrorState.svelte';
	import Skeleton from '#lib/components/common/Skeleton.svelte';
	import TimeRangeSelector from '#lib/components/common/TimeRangeSelector.svelte';
	import { formatShortDateTime } from '#lib/utils/format-datetime.js';

	interface Props {
		networkId: string;
		/** Omit (or pass `null`) for the network-wide view; a device id scopes to one device. */
		deviceId?: string | null;
	}

	let { networkId, deviceId = null }: Props = $props();

	const isDeviceMode = $derived(!!deviceId);

	let roamingState = $derived($roamingStore);

	// Network-mode-only "most roaming devices" filter, set by clicking a top roamer. Reset
	// whenever the network/device props themselves change (below) so switching networks never
	// carries a stale filter label over.
	let selectedDeviceId: string | null = $state(null);
	let selectedDeviceName: string | null = $state(null);

	// Fetch on mount and whenever `networkId`/`deviceId` change - a single effect covers both,
	// so there is no separate onMount call that could double-fire alongside it.
	$effect(() => {
		const nid = networkId;
		const did = deviceId ?? null;
		selectedDeviceId = null;
		selectedDeviceName = null;
		roamingStore.fetch(nid, { deviceId: did });
	});

	function selectTopRoamer(id: string, name: string) {
		selectedDeviceId = id;
		selectedDeviceName = name;
		roamingStore.fetch(networkId, { deviceId: id });
	}

	function clearFilter() {
		selectedDeviceId = null;
		selectedDeviceName = null;
		roamingStore.fetch(networkId, { deviceId: null });
	}

	function retry() {
		roamingStore.fetch(networkId, { deviceId: roamingState.deviceId });
	}

	function eventLabel(type: RoamingEventType): string {
		if (type === 'move') return 'Move';
		if (type === 'disconnect') return 'Disconnect';
		return 'Reconnect';
	}

	function timeTitle(row: RoamingEvent): string {
		return `${row.timestamp} (change window: ${row.previous_seen} → ${row.timestamp})`;
	}

	function getRowId(row: RoamingEvent): string {
		return `${row.device_id}-${row.timestamp}-${row.event_type}`;
	}

	/** 60 -> "1 min", 210 -> "3.5 min", 30 -> "30 s". */
	function formatResolution(seconds: number): string {
		if (seconds < 60) return `${seconds} s`;
		if (seconds % 60 === 0) {
			const minutes = seconds / 60;
			return minutes === 1 ? '1 min' : `${minutes} min`;
		}
		return `${(seconds / 60).toFixed(1)} min`;
	}

	const columns = $derived.by((): DataTableColumn<RoamingEvent>[] => {
		const cols: DataTableColumn<RoamingEvent>[] = [
			{ key: 'time', header: 'Time', required: true, width: '180px', render: timeCell }
		];
		if (!isDeviceMode) {
			cols.push({ key: 'device', header: 'Device', required: true, render: deviceCell });
		}
		cols.push({ key: 'event', header: 'Event', required: true, width: '120px', render: eventCell });
		cols.push({
			key: 'change',
			header: 'From → To',
			required: true,
			render: changeCell
		});
		return cols;
	});

	let events = $derived(roamingState.data?.events ?? []);
	// Sourced from the store's `leaderboard`, not `data.top_roamers`: a
	// device-filtered response's `top_roamers` reflects only the selected
	// device, so rendering from `data` would collapse the strip to one chip.
	let topRoamers = $derived(roamingState.leaderboard ?? []);

	let emptyMessage = $derived(
		isDeviceMode
			? `This device did not change nodes in the last ${roamingState.range}.`
			: `No roaming events in the last ${roamingState.range}.`
	);
</script>

{#snippet timeCell(row: RoamingEvent)}
	<span title={timeTitle(row)}>{formatShortDateTime(row.timestamp)}</span>
{/snippet}

{#snippet deviceCell(row: RoamingEvent)}
	<a href="/devices/{row.device_id}" class="entity-link">{row.device_name}</a>
	{#if row.mac}<span class="text-muted mac">{row.mac}</span>{/if}
{/snippet}

{#snippet eventCell(row: RoamingEvent)}
	<span class="badge event-badge event-{row.event_type}">{eventLabel(row.event_type)}</span>
{/snippet}

{#snippet nodeRef(node: RoamingEvent['from_node'])}
	{#if node}
		{#if node.eero_id}
			<a href="/eeros/{node.eero_id}" class="entity-link">{node.name}</a>
		{:else}
			{node.name}
		{/if}
	{:else}
		&mdash;
	{/if}
{/snippet}

{#snippet changeCell(row: RoamingEvent)}
	<span class="change-cell">
		{@render nodeRef(row.from_node)}
		<span class="change-arrow" aria-hidden="true">&rarr;</span>
		<span class="sr-only"> to </span>
		{@render nodeRef(row.to_node)}
	</span>
{/snippet}

<Card title="Roaming Events">
	{#snippet actions()}
		<TimeRangeSelector
			options={ROAMING_RANGE_OPTIONS}
			value={roamingState.range}
			onChange={(range) => roamingStore.setRange(range)}
		/>
	{/snippet}

	{#if !isDeviceMode && topRoamers.length > 0}
		<div class="top-roamers">
			<span class="top-roamers-label text-muted text-sm">Most roaming devices</span>
			<div class="top-roamers-list">
				{#each topRoamers as roamer (roamer.device_id)}
					<button
						type="button"
						class="top-roamer-chip"
						class:active={selectedDeviceId === roamer.device_id}
						aria-pressed={selectedDeviceId === roamer.device_id}
						onclick={() => selectTopRoamer(roamer.device_id, roamer.device_name)}
					>
						{roamer.device_name} <span class="text-muted">({roamer.moves})</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if !isDeviceMode && selectedDeviceId}
		<p class="active-filter text-sm">
			Showing {selectedDeviceName}
			<button type="button" class="link-button" onclick={clearFilter}>Clear</button>
		</p>
	{/if}

	{#if roamingState.error}
		<!--
			Shown whenever an error is set, even when stale `data` from the same scope is still
			around (a failed retry/range-change) - as a banner above the stale table rather than
			hiding the failure behind data that may no longer be current.
		-->
		<ErrorState message={roamingState.error} onRetry={retry} />
	{/if}

	{#if roamingState.error && events.length === 0}
		<!-- No stale data to fall back to - the error above is the whole story. -->
	{:else if roamingState.loading && events.length === 0}
		<Skeleton variant="table-rows" rows={5} columns={isDeviceMode ? 3 : 4} />
	{:else if events.length === 0}
		<p class="text-muted text-sm empty-message">{emptyMessage}</p>
	{:else}
		<DataTable
			id={isDeviceMode ? 'roaming-events-device' : 'roaming-events-network'}
			{columns}
			rows={events}
			{getRowId}
			loading={roamingState.loading}
			showColumnToggle={false}
			emptyTitle="No roaming events"
		/>
		<p class="footnote text-muted text-sm">
			Times are accurate to one collection cycle (~{formatResolution(
				roamingState.data?.resolution_seconds ?? 60
			)}): an event is stamped at the first sample where the new state was seen.
		</p>
		{#if roamingState.data?.truncated}
			<p class="footnote text-muted text-sm">
				Showing the newest {events.length} of {roamingState.data.total_events} events.
			</p>
		{/if}
	{/if}
</Card>

<style>
	.top-roamers {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.top-roamers-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.top-roamer-chip {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		background: var(--color-bg-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.top-roamer-chip:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	.top-roamer-chip.active {
		background: var(--color-accent);
		color: var(--color-on-accent);
		border-color: var(--color-accent);
	}

	.active-filter {
		margin: 0 0 var(--space-4);
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.link-button {
		background: none;
		border: none;
		padding: 0;
		color: var(--color-accent);
		cursor: pointer;
		font: inherit;
		text-decoration: underline;
	}

	.entity-link {
		color: var(--color-accent);
		text-decoration: none;
		font-weight: 500;
	}

	.entity-link:hover {
		text-decoration: underline;
	}

	.mac {
		display: block;
		font-size: 0.75rem;
	}

	.change-cell {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.change-arrow {
		color: var(--color-text-muted);
	}

	.event-badge.event-move {
		background-color: var(--color-info-bg);
		color: var(--badge-info-text);
	}

	.event-badge.event-disconnect {
		background-color: var(--color-danger-bg);
		color: var(--badge-danger-text);
	}

	.event-badge.event-reconnect {
		background-color: var(--color-success-bg);
		color: var(--color-success);
	}

	.empty-message {
		margin: var(--space-4) 0 0;
	}

	.footnote {
		margin: var(--space-3) 0 0;
	}
</style>
