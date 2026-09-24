<!--
  DNS Caching Card

  Standalone control for the DNS caching toggle, split out of
  DnsSettingsCard on purpose (fulviofreitas/eero-api#127): the eero-api SDK
  has no whole-state DNS write, so the backend always sends caching as its
  own PUT, separate from any ipv4/ipv6 servers change - and every PUT to
  this resource reboots the entire mesh. Bundling caching into the servers
  form could queue up to 3 back-to-back reboots in one submit; keeping it
  here, behind its own confirmation, caps any one submit at a single
  PUT/reboot. Revert this split back into DnsSettingsCard once #127 ships a
  real whole-state write.

  Shares `dnsStore` with DnsSettingsCard, so `applying` is a single flag
  covering both forms - while either one is mid-write, both are disabled.
  This is what prevents the two controls from ever firing concurrent PUTs.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dnsStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import { buildCachingUpdateRequest } from '$lib/utils/dns-form';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let caching = $state(false);
	let submitError: string | null = $state(null);
	let justApplied = $state(false);

	let dnsState = $derived($dnsStore);
	let settings = $derived(dnsState.settings);

	// Seed from settings on first load, and re-seed whenever the loaded
	// settings object changes identity AFTERWARDS - but only while this
	// form has no pending unsaved edit of its own. `dnsStore.settings` is
	// shared with DnsSettingsCard, and every write (from either card)
	// replaces it with a brand-new object, even when the fields THIS card
	// cares about are unchanged. Reseeding unconditionally on identity
	// change would silently discard whatever the user was mid-typing here
	// the moment the sibling card's write resolved. `!seededFor` carves out
	// the one case where clobbering is correct and required: there is
	// nothing to protect before the very first load.
	//
	// The guard compares against `seededFor.caching` (the baseline we last
	// synced from) rather than the `dirty` declaration below, on purpose:
	// `dirty` itself reads `caching`, so referencing it here would create a
	// `dirty -> caching -> dirty` cycle that Svelte's compiler rejects
	// (reactive_declaration_cycle). Comparing against the plain `seededFor`
	// variable is equivalent (both express "has the user changed this since
	// we last loaded it") without the cyclic dependency.
	let seededFor: typeof settings = null;
	$effect(() => {
		if (settings && settings !== seededFor && (!seededFor || caching === seededFor.caching)) {
			caching = settings.caching;
			seededFor = settings;
		}
	});

	let dirty = $derived(settings ? caching !== settings.caching : false);
	let canSave = $derived(dirty && !dnsState.applying);

	onMount(() => {
		// DnsSettingsCard normally fetches DNS settings for this store already;
		// fetch defensively in case this card is ever mounted on its own.
		if (!dnsState.settings) {
			dnsStore.fetchDns(networkId);
		}
	});

	function handleRefresh() {
		justApplied = false;
		dnsStore.fetchDns(networkId);
	}

	function requestSave() {
		if (!canSave) return;

		uiStore.confirm({
			title: 'Apply DNS Caching Change?',
			message: 'This change reboots every eero on this network to take effect.',
			details: [
				'Every eero on this network will restart, and all connected devices will lose ' +
					'internet access for a minute or two.',
				'If you are connected to this network right now, you will lose your own ' +
					'connection while it restarts.'
			],
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: submit
		});
	}

	async function submit(): Promise<void> {
		submitError = null;
		const body = buildCachingUpdateRequest(caching);

		try {
			const result = await dnsStore.updateDns(networkId, body);

			if (!result.changed) {
				uiStore.info('No changes to apply.');
				return;
			}

			justApplied = true;
			uiStore.success('DNS caching setting applied. Your network is restarting.');
		} catch (error) {
			if (error instanceof ApiClientError && error.status === 422) {
				// `detail` is normalised by the API client, which unwraps both
				// our `{field, message}` shape and FastAPI's own validation
				// array. `error.field` names the offending input if we later
				// want to anchor the message to it - it is an internal
				// identifier, so it is deliberately not shown to the user.
				submitError = error.detail;
				return;
			}
			uiStore.error(
				error instanceof Error ? error.message : 'Failed to update DNS caching setting'
			);
		}
	}
</script>

<section class="card info-card dns-card dns-caching-card">
	<h2>DNS Caching</h2>

	{#if dnsState.loading && !settings}
		<p class="text-muted text-sm">Loading DNS settings…</p>
	{:else if dnsState.error && !settings}
		<p class="text-danger text-sm">{dnsState.error}</p>
		<button type="button" class="btn btn-secondary btn-sm" onclick={handleRefresh}> Retry </button>
	{:else if settings}
		{#if justApplied}
			<div class="dns-applying" role="status">
				<strong>Applying — your network will restart shortly.</strong>
				<p class="text-muted text-sm">
					Eeros typically finish rebooting within a few minutes. This page will not update on its
					own while the mesh is offline.
				</p>
				<button type="button" class="btn btn-secondary btn-sm" onclick={handleRefresh}>
					Refresh Status
				</button>
			</div>
		{:else}
			<label class="dns-toggle-row">
				<input type="checkbox" bind:checked={caching} disabled={dnsState.applying} />
				<span>DNS Caching</span>
			</label>

			{#if submitError}
				<p class="dns-submit-error" role="alert">{submitError}</p>
			{/if}

			<div class="dns-actions">
				<button type="button" class="btn btn-primary" disabled={!canSave} onclick={requestSave}>
					{#if dnsState.applying}
						<span class="loading-spinner"></span>
					{/if}
					Save
				</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.dns-caching-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.dns-toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.dns-submit-error {
		color: var(--color-danger);
		background: var(--color-danger-bg);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		font-size: 0.875rem;
	}

	.dns-actions {
		display: flex;
		justify-content: flex-end;
	}

	.dns-applying {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-3);
		background: var(--color-warning-bg);
		border-radius: var(--radius-md);
	}
</style>
