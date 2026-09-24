<!--
  Eero Detail Page

  Detailed view of a single Eero node with all available information.

  WP5 (6.0 revamp) note: decomposed into lib/components/eero/* feature components (and
  lib/utils/eero-format.ts for the shared formatting helpers); this file is now data fetching +
  layout + composition only. Behaviour unchanged except: breadcrumb navigation via DetailHeader
  (item 5) and skeleton-first loading with stale-while-revalidate (item 4) in place of the
  previous back-link + full-block spinner.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { EeroDetail } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import DetailHeader from '$components/common/DetailHeader.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Icon from '$components/common/Icon.svelte';
	import EeroStatusClientsCard from '$lib/components/eero/EeroStatusClientsCard.svelte';
	import EeroNetworkHardwareCard from '$lib/components/eero/EeroNetworkHardwareCard.svelte';
	import EeroPerformanceHistoryCard from '$lib/components/eero/EeroPerformanceHistoryCard.svelte';
	import EeroRadiosCard from '$lib/components/eero/EeroRadiosCard.svelte';
	import EeroPortsCard from '$lib/components/eero/EeroPortsCard.svelte';
	import EeroTechnicalCard from '$lib/components/eero/EeroTechnicalCard.svelte';
	import EeroActionsCard from '$lib/components/eero/EeroActionsCard.svelte';
	import EeroConnectionsCard from '$lib/components/eero/EeroConnectionsCard.svelte';
	import DataUsageMiniCard from '$lib/components/common/DataUsageMiniCard.svelte';
	import PremiumGate from '$components/common/PremiumGate.svelte';

	let eero: EeroDetail | null = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);
	let actionLoading = $state(false);
	let lastNetworkId: string | null = $state(null);
	/** Last confirmed brightness - the rollback target if a debounced commit fails. */
	let confirmedLedBrightness: number | null = null;
	let ledBrightnessTimer: ReturnType<typeof setTimeout> | null = null;
	const LED_BRIGHTNESS_DEBOUNCE_MS = 300;

	let eeroId = $derived($page.params.id);

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchEero();
	});

	async function fetchEero(refresh = false) {
		if (!eeroId) {
			error = 'Invalid eero ID';
			loading = false;
			return;
		}

		// Stale-while-revalidate: keep the previous `eero` on screen while this
		// refetch is in flight rather than blanking the page.
		loading = true;
		error = null;
		try {
			const result = await api.eeros.get(eeroId, refresh);
			console.log('Eero detail:', result);
			eero = result;
		} catch (err) {
			console.error('Failed to load eero:', err);
			error = err instanceof Error ? err.message : 'Failed to load eero details';
		} finally {
			loading = false;
		}
	}

	async function handleReboot() {
		if (!eero?.id) return;

		const eeroName = eero.location || eero.model || 'Eero';

		uiStore.confirm({
			title: 'Reboot Eero',
			message: `Are you sure you want to reboot "${eeroName}"? This will temporarily disconnect all devices connected to this node.`,
			confirmText: 'Reboot',
			danger: true,
			onConfirm: async () => {
				actionLoading = true;
				try {
					const result = await api.eeros.reboot(eero!.id);
					if (result.success) {
						uiStore.success(`${eeroName} is rebooting. It will be back online in a few minutes.`);
					}
				} catch (err) {
					console.error('Failed to reboot eero:', err);
					uiStore.error('Failed to reboot eero');
				} finally {
					actionLoading = false;
				}
			}
		});
	}

	async function handleToggleLed() {
		if (!eero?.id) return;

		const newState = !eero.led_on;
		actionLoading = true;

		try {
			// Optimistic update
			eero = { ...eero, led_on: newState };

			const result = await api.eeros.setLed(eero.id, newState);
			if (result.success) {
				uiStore.success(`LED ${newState ? 'turned on' : 'turned off'}`);
			}
		} catch (err) {
			console.error('Failed to toggle LED:', err);
			// Rollback
			eero = { ...eero, led_on: !newState };
			uiStore.error('Failed to toggle LED');
		} finally {
			actionLoading = false;
		}
	}

	/**
	 * LED brightness slider (plan § 7 WP6, deliverable 3). Verified write -
	 * optimistic on every drag tick for a responsive slider, but only
	 * committed to the API once 300ms have passed with no further input
	 * (debounced), so dragging across the whole range does not fire a PUT
	 * per pixel. The commit reconciles against the backend's read-back
	 * (which can legitimately differ slightly from the requested value) and
	 * rolls back to the last confirmed value on failure.
	 */
	function handleSetLedBrightness(brightness: number) {
		if (!eero?.id) return;
		if (confirmedLedBrightness === null) confirmedLedBrightness = eero.led_brightness;

		// Optimistic - immediate visual feedback while dragging.
		eero = { ...eero, led_brightness: brightness };

		if (ledBrightnessTimer) clearTimeout(ledBrightnessTimer);
		const eeroId = eero.id;
		ledBrightnessTimer = setTimeout(async () => {
			try {
				const result = await api.eeros.setLedBrightness(eeroId, brightness);
				confirmedLedBrightness = result.led_brightness ?? brightness;
				if (eero) {
					eero = { ...eero, led_brightness: confirmedLedBrightness };
				}
			} catch (err) {
				console.error('Failed to set LED brightness:', err);
				if (eero) {
					eero = { ...eero, led_brightness: confirmedLedBrightness };
				}
				uiStore.error('Failed to set LED brightness');
			}
		}, LED_BRIGHTNESS_DEBOUNCE_MS);
	}

	onDestroy(() => {
		if (ledBrightnessTimer) clearTimeout(ledBrightnessTimer);
	});

	// React to network changes
	$effect(() => {
		if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
			lastNetworkId = $selectedNetworkId;
			fetchEero(true);
		}
	});
</script>

<svelte:head>
	<title>{eero?.location || eero?.model || 'Eero'} | Eero Dashboard</title>
</svelte:head>

<div class="eero-detail-page">
	{#if loading && !eero}
		<Skeleton variant="card" height="100px" />
		<div class="skeleton-grid">
			<Skeleton variant="card" height="180px" />
			<Skeleton variant="card" height="180px" />
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" onclick={() => fetchEero(true)}> Try Again </button>
				<button class="btn btn-ghost" onclick={() => goto('/eeros')}> Back to Eeros </button>
			</div>
		</div>
	{:else if eero}
		<DetailHeader
			backHref="/eeros"
			backLabel="Back to eeros"
			title={eero.location || eero.model || 'Unknown'}
			subtitle={eero.model || 'Unknown Model'}
		>
			{#snippet status()}
				<span class="status-dot large" class:online={eero!.status === 'green'}></span>
				{#if eero!.is_gateway}
					<span class="badge badge-info">Gateway</span>
				{/if}
				<StatusBadge status={eero!.status || 'unknown'} />
			{/snippet}
			{#snippet actions()}
				<button class="btn btn-secondary" onclick={() => fetchEero(true)} disabled={actionLoading}>
					<Icon name="refresh" size={14} /> Refresh
				</button>
			{/snippet}
		</DetailHeader>

		<div class="detail-grid">
			<EeroStatusClientsCard {eero} />
			<EeroNetworkHardwareCard {eero} />
			<EeroPerformanceHistoryCard {eero} />
			<EeroRadiosCard {eero} />
			<EeroPortsCard ports={eero.ethernet_ports} />
			<EeroTechnicalCard {eero} networkId={$selectedNetworkId} />
			<EeroActionsCard
				ledOn={eero.led_on}
				ledBrightness={eero.led_brightness}
				loading={actionLoading}
				onToggleLed={handleToggleLed}
				onReboot={handleReboot}
				onSetLedBrightness={handleSetLedBrightness}
			/>
			<EeroConnectionsCard eeroId={eero.id} />
			{#if $selectedNetworkId}
				<PremiumGate feature="Data usage">
					<DataUsageMiniCard
						networkId={$selectedNetworkId}
						entity="eero"
						entityId={eero.id}
						title="Data Usage"
					/>
				</PremiumGate>
			{/if}
		</div>
	{/if}
</div>

<style>
	.eero-detail-page {
		max-width: 1000px;
	}

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
	}

	.status-dot.large {
		width: 12px;
		height: 12px;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--space-4);
	}
</style>
