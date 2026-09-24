<!--
  ProfileBlockedApplicationsCard

  Profile detail page card (phase-6.0-revamp.md § 7 WP7, family 10): a
  profile's blocked-application policy (`GET/PUT /profiles/{id}/
  blocked-applications`). Premium-gated (Plus/Secure) - wrapped in
  `<PremiumGate>` by the caller.

  The write sends the FULL desired application-identifier list (read-first
  from the store), matching the backend's own "set the whole list" shape -
  an unverified, non-settings write (plan § 5): pessimistic, gated on
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every write goes through a
  `ConfirmDialog` naming "not verified end-to-end". Application identifier
  shape is undocumented upstream; treated as an opaque string per chip.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { blockedApplicationsStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		profileId: string;
	}

	let { profileId }: Props = $props();

	let cardState = $derived($blockedApplicationsStore);
	let newAppValue = $state('');

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function load() {
		blockedApplicationsStore.fetch(profileId);
	}

	onMount(load);

	function appLabel(entry: unknown): string {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>;
			const value = record.id ?? record.name ?? record.application_id;
			if (typeof value === 'string') return value;
		}
		return JSON.stringify(entry);
	}

	function currentIds(): string[] {
		return cardState.applications.map((entry) => appLabel(entry));
	}

	function requestAdd() {
		const app = newAppValue.trim();
		if (!app) return;
		const next = [...new Set([...currentIds(), app])];
		uiStore.confirm({
			title: 'Block Application',
			message: `Add "${app}" to this profile's blocked applications?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Block',
			onConfirm: async () => {
				try {
					await blockedApplicationsStore.setApplications(profileId, next);
					newAppValue = '';
					uiStore.success(`"${app}" added to blocked applications`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to block application');
				}
			}
		});
	}

	function requestRemove(entry: unknown) {
		const app = appLabel(entry);
		const next = currentIds().filter((id) => id !== app);
		uiStore.confirm({
			title: 'Unblock Application',
			message: `Remove "${app}" from this profile's blocked applications?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Remove',
			danger: true,
			onConfirm: async () => {
				try {
					await blockedApplicationsStore.setApplications(profileId, next);
					uiStore.success(`"${app}" removed from blocked applications`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to unblock application');
				}
			}
		});
	}
</script>

<Card title="Blocked Applications">
	{#if cardState.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Blocked applications requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if cardState.loading && cardState.applications.length === 0}
		<Skeleton variant="card" height="120px" />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<ExperimentalGate>
			<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestAdd())}>
				<input
					class="text-input"
					type="text"
					bind:value={newAppValue}
					disabled={cardState.applying}
					placeholder="Application identifier"
				/>
				<button
					type="submit"
					class="btn btn-primary btn-sm"
					disabled={cardState.applying || !newAppValue.trim()}
				>
					Block
				</button>
			</form>
		</ExperimentalGate>
		{#if cardState.applications.length === 0}
			<p class="text-muted text-sm">No applications blocked.</p>
		{:else}
			<ul class="chip-list">
				{#each cardState.applications as entry, i (i)}
					<li class="chip">
						<span>{appLabel(entry)}</span>
						<ExperimentalGate>
							<button
								class="chip-remove"
								onclick={() => requestRemove(entry)}
								disabled={cardState.applying}
								aria-label={`Remove ${appLabel(entry)}`}
							>
								<Icon name="x" size={12} />
							</button>
						</ExperimentalGate>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Card>

<style>
	.inline-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.text-input {
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.chip-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background-color: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.chip-remove {
		display: inline-flex;
		align-items: center;
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0;
	}

	.premium-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}

	.premium-note-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.premium-note-title {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}

	.premium-note-description {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
