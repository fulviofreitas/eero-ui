<!--
  EventsCard

  Network Diagnostics tab card (phase-6.0-revamp.md § 7 WP6, deliverable 8):
  the network's app events (`GET /networks/{id}/events`), most recent first.
  A Verified read whose entry shape is unfixtured upstream - rendered
  defensively via GenericRecordList, with a "load older" action using the
  last-loaded event's timestamp as the pagination cursor (backend contract).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { eventsStore } from '$stores/events';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let cardState = $derived($eventsStore);

	function load() {
		eventsStore.fetch(networkId);
	}

	function loadMore() {
		eventsStore.loadMore(networkId);
	}

	onMount(load);
</script>

<Card title="Events">
	{#if cardState.loading && cardState.events.length === 0}
		<Skeleton variant="table-rows" rows={5} columns={3} />
	{:else if cardState.unavailable}
		<p class="text-muted text-sm">Events are not available on this network right now.</p>
	{:else if cardState.error && cardState.events.length === 0}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<GenericRecordList
			records={cardState.events}
			emptyTitle="No events"
			emptyDescription="No app events have been recorded yet."
			recordLabel={(_r, i) => `Event ${i + 1}`}
		/>
		{#if cardState.error}
			<ErrorState
				message={cardState.error}
				onRetry={loadMore}
				retryLabel="Try loading older again"
			/>
		{:else if cardState.hasMore && cardState.events.length > 0}
			<div class="load-more">
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					onclick={loadMore}
					disabled={cardState.loadingMore}
				>
					{cardState.loadingMore ? 'Loading…' : 'Load older'}
				</button>
			</div>
		{/if}
	{/if}
</Card>

<style>
	.load-more {
		margin-top: var(--space-4);
		display: flex;
		justify-content: center;
	}
</style>
