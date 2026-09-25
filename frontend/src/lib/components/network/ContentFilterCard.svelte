<!--
  ContentFilterCard

  Network DNS tab card (phase-6.0-revamp.md § 7 WP7, family 10): the
  network-wide advanced content-filter allow/block lists (`GET /networks/
  {id}/content-filter`). Premium-gated (Plus/Secure) - wrapped in
  `<PremiumGate>` by the caller, with the same internal `premiumRequired`
  fallback `BackupInternetCard` uses in case entitlements are stale.

  Add/remove on either list is an unverified, non-settings write (plan § 5):
  pessimistic, gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every write
  goes through a `ConfirmDialog` naming "not verified end-to-end". List
  element shapes are undocumented upstream and rendered defensively.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { contentFilterStore, uiStore } from '$stores';
	import { isValidContentFilterDomain } from '$lib/utils/network-forms';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let cardState = $derived($contentFilterStore);

	let allowDomainValue = $state('');
	let blockDomainValue = $state('');

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function load() {
		contentFilterStore.fetch(networkId);
	}

	onMount(load);

	function domainLabel(entry: unknown): string {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>;
			const value = record.domain ?? record.name ?? record.host;
			if (typeof value === 'string') return value;
		}
		return JSON.stringify(entry);
	}

	function requestAllow() {
		const domain = allowDomainValue.trim();
		if (!isValidContentFilterDomain(domain)) {
			uiStore.error('Enter a bare hostname (no scheme or path), not an IP address.');
			return;
		}
		uiStore.confirm({
			title: 'Allow Domain',
			message: `Add "${domain}" to the network-wide allow list?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Allow',
			onConfirm: async () => {
				try {
					await contentFilterStore.allowDomain(networkId, domain);
					allowDomainValue = '';
					uiStore.success(`"${domain}" added to the allow list`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to allow domain');
				}
			}
		});
	}

	function requestUnallow(entry: unknown) {
		const domain = domainLabel(entry);
		uiStore.confirm({
			title: 'Remove Allowed Domain',
			message: `Remove "${domain}" from the network-wide allow list?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Remove',
			danger: true,
			onConfirm: async () => {
				try {
					await contentFilterStore.unallowDomain(networkId, domain);
					uiStore.success(`"${domain}" removed from the allow list`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to remove domain');
				}
			}
		});
	}

	function requestBlock() {
		const domain = blockDomainValue.trim();
		if (!isValidContentFilterDomain(domain)) {
			uiStore.error('Enter a bare hostname (no scheme or path), not an IP address.');
			return;
		}
		uiStore.confirm({
			title: 'Block Domain',
			message: `Add "${domain}" to the network-wide block list?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Block',
			onConfirm: async () => {
				try {
					await contentFilterStore.blockDomain(networkId, domain);
					blockDomainValue = '';
					uiStore.success(`"${domain}" added to the block list`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to block domain');
				}
			}
		});
	}

	function requestUnblock(entry: unknown) {
		const domain = domainLabel(entry);
		uiStore.confirm({
			title: 'Remove Blocked Domain',
			message: `Remove "${domain}" from the network-wide block list?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Remove',
			danger: true,
			onConfirm: async () => {
				try {
					await contentFilterStore.unblockDomain(networkId, domain);
					uiStore.success(`"${domain}" removed from the block list`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to remove domain');
				}
			}
		});
	}
</script>

<Card title="Content Filter">
	{#if cardState.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Content filtering requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if cardState.loading && cardState.allowedList.length === 0 && cardState.blockedList.length === 0}
		<Skeleton variant="card" height="160px" />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<section class="filter-section">
			<h4>Allow List</h4>
			<ExperimentalGate>
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestAllow())}>
					<input
						class="text-input"
						type="text"
						bind:value={allowDomainValue}
						disabled={cardState.applying}
						placeholder="example.com"
						aria-label="Domain to allow"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={cardState.applying || !allowDomainValue.trim()}
					>
						Allow
					</button>
				</form>
			</ExperimentalGate>
			{#if cardState.allowedList.length === 0}
				<p class="text-muted text-sm">No domains allowed.</p>
			{:else}
				<ul class="domain-list">
					{#each cardState.allowedList as entry, i (i)}
						<li class="domain-row">
							<span>{domainLabel(entry)}</span>
							<ExperimentalGate>
								<button
									class="btn btn-danger btn-sm"
									onclick={() => requestUnallow(entry)}
									disabled={cardState.applying}
								>
									Remove
								</button>
							</ExperimentalGate>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="filter-section">
			<h4>Block List</h4>
			<ExperimentalGate>
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestBlock())}>
					<input
						class="text-input"
						type="text"
						bind:value={blockDomainValue}
						disabled={cardState.applying}
						placeholder="example.com"
						aria-label="Domain to block"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={cardState.applying || !blockDomainValue.trim()}
					>
						Block
					</button>
				</form>
			</ExperimentalGate>
			{#if cardState.blockedList.length === 0}
				<p class="text-muted text-sm">No domains blocked.</p>
			{:else}
				<ul class="domain-list">
					{#each cardState.blockedList as entry, i (i)}
						<li class="domain-row">
							<span>{domainLabel(entry)}</span>
							<ExperimentalGate>
								<button
									class="btn btn-danger btn-sm"
									onclick={() => requestUnblock(entry)}
									disabled={cardState.applying}
								>
									Remove
								</button>
							</ExperimentalGate>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</Card>

<style>
	.filter-section {
		margin-bottom: var(--space-6);
	}

	.filter-section:last-child {
		margin-bottom: 0;
	}

	.filter-section h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

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

	.domain-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.domain-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-secondary);
		border-radius: var(--radius-md);
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
