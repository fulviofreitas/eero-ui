<!--
  DNS Settings Card

  Editable DNS server configuration AND the DNS caching toggle for a
  network, under one Save button (consistency pass, 2026-10-07 - this card
  and the now-removed sibling DnsCachingCard used to have separate Saves).
  A write here reboots every eero on the network, so this deliberately does
  NOT use optimistic updates and always requires an explicit, detailed
  confirmation before submitting.

  The eero-api SDK still has no whole-state DNS write (fulviofreitas/eero-api#127),
  so the backend dispatches up to two SDK calls per submit - servers, then
  caching - and each one independently reboots the mesh. One Save button
  now sends one PUT either way; `buildCombinedUpdateRequest` (dns-form.ts)
  only includes the half(s) that actually changed, and when BOTH changed
  the confirm dialog says explicitly that this means two separate writes
  and the network may restart more than once.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dnsStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import type { DnsProvider } from '$api/types';
	import {
		applyProvider,
		buildCombinedUpdateRequest,
		formFromSettings,
		formIsValid,
		isFormDirty,
		validateForm,
		type DnsFormState
	} from '#lib/utils/dns-form.js';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Button from '$components/common/Button.svelte';
	import DnsProviderPicker from './DnsProviderPicker.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let form = $state<DnsFormState | null>(null);
	let caching = $state(false);
	let submitError: string | null = $state(null);
	let justApplied = $state(false);

	let dnsState = $derived($dnsStore);
	let settings = $derived(dnsState.settings);

	// Seed the servers half of the form on first load, and re-seed whenever
	// the loaded settings object changes identity AFTERWARDS - but only
	// while this half has no pending unsaved edit of its own. Every write
	// (servers, caching, or both - see `submit` below) replaces
	// `dnsStore.settings` with a brand-new object, even when this half is
	// unchanged. Reseeding unconditionally on identity change would
	// silently discard whatever the user was mid-typing here the moment a
	// write resolved. `!seededFor` carves out the one case where clobbering
	// is correct and required: there is nothing to protect before the very
	// first load.
	//
	// The guard compares `form` against `seededFor` (the baseline we last
	// synced from) via `isFormDirty`, rather than the `serversDirty`
	// declaration below, on purpose: `serversDirty` itself reads `form`, so
	// referencing it here would create a `serversDirty -> form ->
	// serversDirty` cycle that Svelte's compiler rejects
	// (reactive_declaration_cycle). Comparing against `seededFor` is
	// equivalent (both express "has the user changed this since we last
	// loaded it") without the cyclic dependency.
	let seededFor: typeof settings = null;
	$effect(() => {
		if (
			settings &&
			settings !== seededFor &&
			(!seededFor || (form && !isFormDirty(seededFor, form)))
		) {
			form = formFromSettings(settings);
			seededFor = settings;
		}
	});

	// Same seed-once/protect-the-edit pattern as above, independently, for
	// the caching toggle - it has its own dirty check and its own place in
	// the combined request (`buildCombinedUpdateRequest`), so it is tracked
	// against its own baseline rather than being folded into `seededFor`.
	let seededForCaching: typeof settings = null;
	$effect(() => {
		if (
			settings &&
			settings !== seededForCaching &&
			(!seededForCaching || caching === seededForCaching.caching)
		) {
			caching = settings.caching;
			seededForCaching = settings;
		}
	});

	let errors = $derived(form ? validateForm(form) : {});
	let valid = $derived(form ? formIsValid(form) : false);
	let serversDirty = $derived(settings && form ? isFormDirty(settings, form) : false);
	let cachingDirty = $derived(settings ? caching !== settings.caching : false);
	// Enabled when servers are dirty+valid OR caching is dirty (plan § consistency pass) - an
	// in-progress, not-yet-valid servers edit must never block an otherwise-ready caching save.
	let canSave = $derived(((serversDirty && valid) || cachingDirty) && !dnsState.applying);

	let selectedProviderName = $derived(getSelectedProviderName(form, settings?.providers ?? []));

	onMount(() => {
		dnsStore.fetchDns(networkId);
	});

	function getSelectedProviderName(
		currentForm: DnsFormState | null,
		providers: DnsProvider[]
	): string | null {
		if (!currentForm || currentForm.mode !== 'custom') return null;
		const match = providers.find(
			(p) =>
				(p.ipv4[0] ?? '') === currentForm.ipv4Primary &&
				(p.ipv4[1] ?? '') === currentForm.ipv4Secondary &&
				(p.ipv6[0] ?? '') === currentForm.ipv6Primary &&
				(p.ipv6[1] ?? '') === currentForm.ipv6Secondary
		);
		return match?.name ?? null;
	}

	function handleProviderSelect(provider: DnsProvider) {
		if (!form) return;
		submitError = null;
		form = applyProvider(form, provider);
	}

	function handleModeChange(mode: 'automatic' | 'custom') {
		if (!form) return;
		submitError = null;
		form = { ...form, mode };
	}

	function handleRefresh() {
		justApplied = false;
		dnsStore.fetchDns(networkId);
	}

	function requestSave() {
		if (!form || !canSave) return;

		const both = serversDirty && valid && cachingDirty;

		uiStore.confirm({
			title: 'Apply DNS Settings?',
			message: 'This change reboots every eero on this network to take effect.',
			details: both
				? [
						'Servers and caching both changed - the backend applies them as two separate ' +
							'DNS writes, so the network may restart more than once.',
						'Every eero on this network will restart, and all connected devices will lose ' +
							'internet access for a minute or two each time.',
						'If you are connected to this network right now, you will lose your own ' +
							'connection while it restarts.'
					]
				: [
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
		if (!form) return;

		submitError = null;
		// `serversDirty && valid` (not `serversDirty` alone): canSave can be true purely from
		// cachingDirty while an in-progress, not-yet-valid servers edit sits in the form - that
		// half must never ride along into the request just because caching made Save clickable.
		const body = buildCombinedUpdateRequest(form, caching, {
			serversDirty: serversDirty && valid,
			cachingDirty
		});

		try {
			const result = await dnsStore.updateDns(networkId, body);

			if (!result.changed) {
				uiStore.info('No changes to apply.');
				return;
			}

			justApplied = true;
			uiStore.success('DNS settings applied. Your network is restarting.');
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
			uiStore.error(error instanceof Error ? error.message : 'Failed to update DNS settings');
		}
	}
</script>

<section class="card info-card dns-card">
	<h2>DNS Configuration</h2>

	{#if dnsState.loading && !settings}
		<Skeleton variant="text" lines={4} />
	{:else if dnsState.error && !settings}
		<p class="text-danger text-sm">{dnsState.error}</p>
		<Button type="button" onclick={handleRefresh}>Retry</Button>
	{:else if settings && form}
		{#if justApplied}
			<div class="dns-applying" role="status">
				<strong>Applying — your network will restart shortly.</strong>
				<p class="text-muted text-sm">
					Eeros typically finish rebooting within a few minutes. This page will not update on its
					own while the mesh is offline.
				</p>
				<Button type="button" onclick={handleRefresh}>Refresh Status</Button>
			</div>
		{:else}
			<div class="dns-mode-select" role="radiogroup" aria-label="DNS mode">
				<label class="dns-radio">
					<input
						type="radio"
						name="dns-mode-{networkId}"
						checked={form.mode === 'automatic'}
						disabled={dnsState.applying}
						onchange={() => handleModeChange('automatic')}
					/>
					<span>ISP DNS (Default)</span>
				</label>
				<label class="dns-radio">
					<input
						type="radio"
						name="dns-mode-{networkId}"
						checked={form.mode === 'custom'}
						disabled={dnsState.applying}
						onchange={() => handleModeChange('custom')}
					/>
					<span>Custom DNS</span>
				</label>
			</div>

			{#if form.mode === 'custom'}
				{#if settings.providers.length > 0}
					<div class="dns-field-group">
						<span class="dns-field-label">Presets</span>
						<DnsProviderPicker
							providers={settings.providers}
							selectedName={selectedProviderName}
							disabled={dnsState.applying}
							onSelect={handleProviderSelect}
						/>
					</div>
				{/if}

				<div class="dns-address-grid">
					<div class="dns-field-group">
						<label class="dns-field-label" for="dns-ipv4-primary">IPv4 Primary</label>
						<input
							id="dns-ipv4-primary"
							class="input mono"
							class:input-error={errors.ipv4Primary}
							type="text"
							placeholder="1.1.1.1"
							bind:value={form.ipv4Primary}
							disabled={dnsState.applying}
						/>
						{#if errors.ipv4Primary}
							<span class="dns-field-error">{errors.ipv4Primary}</span>
						{/if}
					</div>

					<div class="dns-field-group">
						<label class="dns-field-label" for="dns-ipv4-secondary">IPv4 Secondary</label>
						<input
							id="dns-ipv4-secondary"
							class="input mono"
							class:input-error={errors.ipv4Secondary}
							type="text"
							placeholder="1.0.0.1"
							bind:value={form.ipv4Secondary}
							disabled={dnsState.applying}
						/>
						{#if errors.ipv4Secondary}
							<span class="dns-field-error">{errors.ipv4Secondary}</span>
						{/if}
					</div>

					<div class="dns-field-group">
						<label class="dns-field-label" for="dns-ipv6-primary">IPv6 Primary</label>
						<input
							id="dns-ipv6-primary"
							class="input mono"
							class:input-error={errors.ipv6Primary}
							type="text"
							placeholder="2606:4700:4700::1111"
							bind:value={form.ipv6Primary}
							disabled={dnsState.applying}
						/>
						{#if errors.ipv6Primary}
							<span class="dns-field-error">{errors.ipv6Primary}</span>
						{/if}
					</div>

					<div class="dns-field-group">
						<label class="dns-field-label" for="dns-ipv6-secondary">IPv6 Secondary</label>
						<input
							id="dns-ipv6-secondary"
							class="input mono"
							class:input-error={errors.ipv6Secondary}
							type="text"
							placeholder="2606:4700:4700::1001"
							bind:value={form.ipv6Secondary}
							disabled={dnsState.applying}
						/>
						{#if errors.ipv6Secondary}
							<span class="dns-field-error">{errors.ipv6Secondary}</span>
						{/if}
					</div>
				</div>
			{/if}

			<label class="dns-toggle-row">
				<input type="checkbox" bind:checked={caching} disabled={dnsState.applying} />
				<span>DNS Caching</span>
			</label>

			{#if settings.parent_ips.length > 0}
				<dl class="info-list dns-upstream">
					<div class="info-row">
						<dt>ISP Upstream DNS</dt>
						<dd class="mono text-sm">{settings.parent_ips.join(', ')}</dd>
					</div>
				</dl>
			{/if}

			{#if submitError}
				<p class="dns-submit-error" role="alert">{submitError}</p>
			{/if}

			<div class="dns-actions">
				<Button
					type="button"
					variant="primary"
					disabled={!canSave}
					loading={dnsState.applying}
					onclick={requestSave}
				>
					Save
				</Button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.dns-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.dns-mode-select {
		display: flex;
		gap: var(--space-5);
	}

	.dns-toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.dns-radio {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-size: 0.875rem;
	}

	.dns-field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.dns-field-label {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.dns-address-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
	}

	.dns-field-error {
		font-size: 0.75rem;
		color: var(--color-danger);
	}

	.input-error {
		border-color: var(--color-danger);
	}

	.dns-upstream {
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
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
