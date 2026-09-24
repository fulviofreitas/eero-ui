<!--
  NotificationsCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 13):
  notification settings and the unread flag (`GET /networks/{id}/
  notifications`), plus paginated history (`/notifications/history`).

  Write controls (§ 7 WP7, family 3): toggling a setting sends the FULL
  settings map (read-first from the store) via `PUT /networks/{id}/
  notifications`; "Mark all read" hits `/notifications/mark-read`. Both
  unverified, non-settings writes (plan § 5) - the toggle is gated on
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES` via its own `disabled` state (kept as
  a visible-but-disabled checkbox rather than removed entirely, matching this
  card's original read-only design), and "Mark all read" is wrapped in
  `ExperimentalGate`. Every write goes through a `ConfirmDialog` naming
  "not verified end-to-end". `changed: false` (no requested value actually
  differed) surfaces as an info toast, not a success toast.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationsStore, uiStore } from '$stores';
	import { experimentalWrites } from '$stores/entitlements';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let state = $derived($notificationsStore);
	let settingsEntries = $derived(Object.entries(state.settings));

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function load() {
		notificationsStore.fetch(networkId);
	}

	function loadMore() {
		notificationsStore.loadMore(networkId);
	}

	onMount(load);

	function requestToggleSetting(key: string, nextValue: boolean) {
		uiStore.confirm({
			title: 'Update Notification Setting',
			message: `${nextValue ? 'Enable' : 'Disable'} "${key}"?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: nextValue ? 'Enable' : 'Disable',
			onConfirm: async () => {
				try {
					const changed = await notificationsStore.updateSettings(networkId, {
						...state.settings,
						[key]: nextValue
					});
					if (!changed) {
						uiStore.info('No changes to apply.');
						return;
					}
					uiStore.success('Notification setting updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update setting');
				}
			}
		});
	}

	function requestMarkRead() {
		uiStore.confirm({
			title: 'Mark All Notifications Read',
			message: 'Mark every notification on this network as read?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Mark Read',
			onConfirm: async () => {
				try {
					await notificationsStore.markRead(networkId);
					uiStore.success('Notifications marked read');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to mark notifications read');
				}
			}
		});
	}
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
				<div class="badge-row-actions">
					<span class="badge {state.hasUnread ? 'badge-warning' : 'badge-neutral'}">
						{state.hasUnread ? 'Unread notifications' : 'All caught up'}
					</span>
					<ExperimentalGate>
						<button
							class="btn btn-secondary btn-sm"
							onclick={requestMarkRead}
							disabled={state.applying || !state.hasUnread}
						>
							Mark All Read
						</button>
					</ExperimentalGate>
				</div>
			</div>
		</section>

		<section class="notifications-section">
			<h4 class="section-title">Settings</h4>
			{#if !$experimentalWrites}
				<p class="text-muted text-sm settings-note" role="note">
					Editing these settings is disabled by operator — set
					<code>EERO_DASHBOARD_EXPERIMENTAL_WRITES=true</code> to enable.
				</p>
			{/if}
			{#if settingsEntries.length === 0}
				<p class="text-muted text-sm">No notification settings available.</p>
			{:else}
				<ul class="settings-list">
					{#each settingsEntries as [key, enabled] (key + ':' + state.revision)}
						<li class="settings-row">
							<label class="settings-label" for={`notif-${key}`}>{key}</label>
							<input
								id={`notif-${key}`}
								type="checkbox"
								checked={enabled}
								disabled={!$experimentalWrites || state.applying}
								onchange={() => requestToggleSetting(key, !enabled)}
							/>
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

	.badge-row-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
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
