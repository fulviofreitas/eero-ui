<!--
  NotificationsCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 13):
  notification settings and the unread flag (`GET /networks/{id}/
  notifications`), plus paginated history (`/notifications/history`). Settings
  render as disabled toggles with a note that editing is gated behind the
  experimental-writes flag (WP7) - this card only reads.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationsStore } from '$stores/notifications';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let state = $derived($notificationsStore);
	let settingsEntries = $derived(Object.entries(state.settings));

	function load() {
		notificationsStore.fetch(networkId);
	}

	function loadMore() {
		notificationsStore.loadMore(networkId);
	}

	onMount(load);
</script>

<Card title="Notifications">
	{#if state.loading && settingsEntries.length === 0 && state.history.length === 0}
		<Skeleton variant="table-rows" rows={4} columns={2} />
	{:else if state.error && state.history.length === 0 && settingsEntries.length === 0}
		<ErrorState message={state.error} onRetry={load} />
	{:else}
		<section class="notifications-section">
			<div class="badge-row">
				<h4 class="section-title">Unread</h4>
				<span class="badge {state.hasUnread ? 'badge-warning' : 'badge-neutral'}">
					{state.hasUnread ? 'Unread notifications' : 'All caught up'}
				</span>
			</div>
		</section>

		<section class="notifications-section">
			<h4 class="section-title">Settings</h4>
			<p class="text-muted text-sm settings-note">
				Editing these settings is behind the experimental-writes flag.
			</p>
			{#if settingsEntries.length === 0}
				<p class="text-muted text-sm">No notification settings available.</p>
			{:else}
				<ul class="settings-list">
					{#each settingsEntries as [key, enabled] (key)}
						<li class="settings-row">
							<label class="settings-label" for={`notif-${key}`}>{key}</label>
							<input id={`notif-${key}`} type="checkbox" checked={enabled} disabled />
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="notifications-section">
			<h4 class="section-title">History</h4>
			<GenericRecordList
				records={state.history}
				emptyTitle="No notification history"
				recordLabel={(_r, i) => `Notification ${i + 1}`}
			/>
			{#if state.error}
				<ErrorState message={state.error} onRetry={loadMore} retryLabel="Try loading older again" />
			{:else if state.hasMore && state.history.length > 0}
				<div class="load-more">
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick={loadMore}
						disabled={state.loadingMore}
					>
						{state.loadingMore ? 'Loading…' : 'Load older'}
					</button>
				</div>
			{/if}
		</section>
	{/if}
</Card>

<style>
	.notifications-section {
		margin-bottom: var(--space-6);
	}

	.notifications-section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.settings-note {
		margin: 0 0 var(--space-2);
	}

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.settings-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.settings-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.settings-row:last-child {
		border-bottom: none;
	}

	.settings-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.load-more {
		margin-top: var(--space-4);
		display: flex;
		justify-content: center;
	}
</style>
