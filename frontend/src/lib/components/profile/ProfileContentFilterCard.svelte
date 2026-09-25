<!--
  ProfileContentFilterCard

  Profile detail page card (phase-6.0-revamp.md § 7 WP7, family 10): the
  profile-scoped content-filter allow/block writes (`POST/DELETE /networks/
  {id}/content-filter/allow-for-profiles` and `.../block-for-profiles`).
  These are network resources scoped by a `profiles` id list in the body,
  not a profile resource, so this card resolves the network id from the
  currently-selected network (`selectedNetworkId`) rather than a prop, and
  defaults the profiles multi-select to just the profile whose page this is
  on - the operator can add other profiles from the network's own list.

  Unlike the network-wide allow/block routes, these return only `{success}`
  (no updated list) - there is nothing to display as a current state, only
  a form and a result toast. Premium-gated (Plus/Secure); wrapped in
  `<PremiumGate>` by the caller. Unverified, non-settings write (plan § 5):
  pessimistic, gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every write
  goes through a `ConfirmDialog` naming "not verified end-to-end".
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { ProfileSummary } from '$api/types';
	import { contentFilterStore, selectedNetworkId, uiStore } from '$stores';
	import { isValidContentFilterDomain } from '$lib/utils/network-forms';
	import Card from '$components/common/Card.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		profileId: string;
	}

	let { profileId }: Props = $props();

	let cardState = $derived($contentFilterStore);

	let domainValue = $state('');
	let mode = $state<'allow' | 'block'>('block');
	// Defaults to just this profile once, on mount - not a `$derived` of
	// `profileId`, since the operator can add/remove other profiles
	// afterwards and a derived would fight that local edit.
	let selectedProfileIds = $state<string[]>([]);
	let profiles = $state<ProfileSummary[]>([]);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	onMount(async () => {
		selectedProfileIds = [profileId];
		try {
			const result = await api.profiles.list();
			profiles = Array.isArray(result) ? result : [];
		} catch {
			profiles = [];
		}
	});

	function toggleProfile(id: string) {
		selectedProfileIds = selectedProfileIds.includes(id)
			? selectedProfileIds.filter((p) => p !== id)
			: [...selectedProfileIds, id];
	}

	function requestSubmit() {
		const networkId = $selectedNetworkId;
		const domain = domainValue.trim();
		if (!networkId || !isValidContentFilterDomain(domain) || selectedProfileIds.length === 0) {
			uiStore.error('Enter a valid hostname and select at least one profile before submitting.');
			return;
		}
		const label = mode === 'allow' ? 'Allow' : 'Block';
		uiStore.confirm({
			title: `${label} Domain for Profiles`,
			message: `${label} "${domain}" for ${selectedProfileIds.length} profile(s)?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: label,
			onConfirm: async () => {
				try {
					const success =
						mode === 'allow'
							? await contentFilterStore.allowDomainForProfiles(networkId, {
									domain,
									profiles: selectedProfileIds
								})
							: await contentFilterStore.blockDomainForProfiles(networkId, {
									domain,
									profiles: selectedProfileIds
								});
					if (success) {
						domainValue = '';
						uiStore.success(
							`"${domain}" ${mode === 'allow' ? 'allowed' : 'blocked'} for the selected profiles`
						);
					} else {
						uiStore.error('The eero cloud did not confirm this write.');
					}
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : `Failed to ${mode} domain`);
				}
			}
		});
	}
</script>

<Card title="Content Filter (This Profile)">
	<ExperimentalGate>
		<form class="filter-form" onsubmit={(e) => (e.preventDefault(), requestSubmit())}>
			<div class="form-row">
				<label for="pcf-mode">Action</label>
				<select id="pcf-mode" bind:value={mode} disabled={cardState.applying}>
					<option value="block">Block</option>
					<option value="allow">Allow</option>
				</select>
			</div>
			<div class="form-row">
				<label for="pcf-domain">Domain</label>
				<input
					id="pcf-domain"
					class="text-input"
					type="text"
					bind:value={domainValue}
					disabled={cardState.applying}
					placeholder="example.com"
				/>
			</div>
			<div class="form-row">
				<span class="form-label">Profiles</span>
				<ul class="profile-checklist">
					{#each profiles.filter((p) => p.id) as p (p.id)}
						{@const id = p.id as string}
						<li>
							<label>
								<input
									type="checkbox"
									checked={selectedProfileIds.includes(id)}
									onchange={() => toggleProfile(id)}
									disabled={cardState.applying}
								/>
								{p.name}
							</label>
						</li>
					{/each}
				</ul>
			</div>
			<button
				type="submit"
				class="btn btn-primary btn-sm"
				disabled={cardState.applying || !domainValue.trim() || selectedProfileIds.length === 0}
			>
				{mode === 'allow' ? 'Allow' : 'Block'} for Selected Profiles
			</button>
		</form>
	</ExperimentalGate>
</Card>

<style>
	.filter-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.form-row label,
	.form-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.text-input,
	select {
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.profile-checklist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 160px;
		overflow-y: auto;
	}

	.profile-checklist label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
</style>
