<!--
  Device Detail Page

  Full detailed view of a single device with all available information.

  WP5 (6.0 revamp) note: decomposed into lib/components/device/* feature components; this
  file is now data fetching + layout + composition only. Behaviour unchanged except:
  breadcrumb navigation via DetailHeader (item 5) and skeleton-first loading with
  stale-while-revalidate (item 4) in place of the previous back-link + full-block spinner.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { DeviceDetail, ProfileSummary } from '$api/types';
	import { uiStore, devicesStore } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import DetailHeader from '$components/common/DetailHeader.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import BandwidthChart from '$lib/components/charts/BandwidthChart.svelte';
	import Icon from '$components/common/Icon.svelte';
	import DeviceProfileSelector from '$lib/components/device/DeviceProfileSelector.svelte';
	import DeviceTypePicker from '$lib/components/device/DeviceTypePicker.svelte';
	import DeviceIdentificationCard from '$lib/components/device/DeviceIdentificationCard.svelte';
	import DeviceConnectionCard from '$lib/components/device/DeviceConnectionCard.svelte';
	import DeviceStatusCard from '$lib/components/device/DeviceStatusCard.svelte';
	import InsightsCard from '$lib/components/common/InsightsCard.svelte';
	import DataUsageMiniCard from '$lib/components/common/DataUsageMiniCard.svelte';
	import PremiumGate from '$components/common/PremiumGate.svelte';

	let device = $state<DeviceDetail | null>(null);
	let loading = $state(true);
	let error: string | null = $state(null);
	let actionLoading = $state(false);

	// Profile management
	let profiles: ProfileSummary[] = $state([]);
	let loadingProfiles = $state(false);
	let changingProfile = $state(false);
	let changingDeviceType = $state(false);

	let deviceId = $derived($page.params.id);
	let displayName = $derived(
		device?.display_name || device?.nickname || device?.hostname || device?.mac || 'Unknown Device'
	);
	let statusLabel = $derived(
		device?.blocked ? 'blocked' : device?.connected ? 'connected' : 'disconnected'
	);

	onMount(async () => {
		await fetchDevice();
		await loadProfiles();
	});

	async function fetchDevice(refresh = false) {
		if (!deviceId) {
			error = 'Invalid device ID';
			loading = false;
			return;
		}

		// Stale-while-revalidate: keep the previous `device` on screen while this
		// refetch is in flight rather than blanking the page.
		loading = true;
		error = null;
		try {
			const result = await api.devices.get(deviceId, refresh);
			console.log('Device detail:', result);
			device = result;
		} catch (err) {
			console.error('Failed to load device:', err);
			error = err instanceof Error ? err.message : 'Failed to load device details';
		} finally {
			loading = false;
		}
	}

	async function loadProfiles() {
		loadingProfiles = true;
		try {
			profiles = await api.profiles.list();
		} catch (err) {
			console.error('Failed to load profiles:', err);
		} finally {
			loadingProfiles = false;
		}
	}

	async function handleProfileChange(profileId: string | null, profileName: string) {
		if (!device?.id) return;
		if (profileId === null) return; // removing profile not yet supported by this endpoint

		changingProfile = true;

		try {
			await devicesStore.assignToProfile([device.id], profileId, profileName);
			uiStore.success(`Device assigned to "${profileName}"`);
			await fetchDevice(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to change profile');
		} finally {
			changingProfile = false;
		}
	}

	/**
	 * Set the device's type (plan § 7 WP6, deliverable 4). Verified write -
	 * optimistic with rollback (plan § 5), matching the LED-toggle pattern
	 * on the eero detail page.
	 */
	async function handleDeviceTypeChange(newType: string) {
		if (!device?.id) return;
		const deviceId = device.id;
		const previous = device.device_type;

		device = { ...device, device_type: newType };
		changingDeviceType = true;

		try {
			await devicesStore.setDeviceType(deviceId, newType);
			uiStore.success(`Device type set to "${newType}".`);
		} catch (err) {
			if (device) device = { ...device, device_type: previous };
			uiStore.error(err instanceof Error ? err.message : 'Failed to set device type');
		} finally {
			changingDeviceType = false;
		}
	}

	async function handleBlock() {
		if (!device?.id) return;

		uiStore.confirm({
			title: 'Block Device',
			message: `Are you sure you want to block "${displayName}"? This device will be disconnected from the network.`,
			confirmText: 'Block Device',
			danger: true,
			onConfirm: async () => {
				actionLoading = true;
				try {
					await devicesStore.blockDevice(device!.id!);
					uiStore.success(`${displayName} has been blocked.`);
					await fetchDevice(true);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to block device');
				} finally {
					actionLoading = false;
				}
			}
		});
	}

	async function handleUnblock() {
		if (!device?.id) return;

		actionLoading = true;
		try {
			await devicesStore.unblockDevice(device.id);
			uiStore.success(`${displayName} has been unblocked.`);
			await fetchDevice(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to unblock device');
		} finally {
			actionLoading = false;
		}
	}

	function handleRename() {
		if (!device?.id) return;
		const newName = prompt('Enter new name:', device.nickname || device.hostname || '');
		if (newName) {
			devicesStore
				.setNickname(device.id, newName)
				.then(() => {
					uiStore.success('Device renamed successfully.');
					fetchDevice(true);
				})
				.catch((err) => uiStore.error(err.message));
		}
	}
</script>

<svelte:head>
	<title>{displayName} | Eero Dashboard</title>
</svelte:head>

<div class="device-detail-page">
	{#if loading && !device}
		<Skeleton variant="card" height="100px" />
		<div class="skeleton-grid">
			<Skeleton variant="card" height="200px" />
			<Skeleton variant="card" height="200px" />
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" onclick={() => fetchDevice(true)}> Try Again </button>
				<button class="btn btn-ghost" onclick={() => goto('/devices')}> Back to Devices </button>
			</div>
		</div>
	{:else if device}
		<DetailHeader
			backHref="/devices"
			backLabel="Back to devices"
			title={displayName}
			subtitle={device.manufacturer ?? undefined}
		>
			{#snippet status()}
				<StatusBadge status={statusLabel} />
				<span class="text-muted">•</span>
				<span class="mono text-muted">{device!.mac || '—'}</span>
			{/snippet}
			{#snippet actions()}
				<button
					class="btn btn-secondary"
					onclick={() => fetchDevice(true)}
					disabled={actionLoading}
				>
					<Icon name="refresh" size={14} /> Refresh
				</button>
				<button class="btn btn-secondary" onclick={handleRename} disabled={actionLoading}>
					<Icon name="edit" size={14} /> Rename
				</button>
				{#if device!.blocked}
					<button class="btn btn-primary" onclick={handleUnblock} disabled={actionLoading}>
						{#if actionLoading}<span class="loading-spinner"></span>{/if}
						<Icon name="check" size={14} /> Unblock
					</button>
				{:else}
					<button class="btn btn-danger" onclick={handleBlock} disabled={actionLoading}>
						{#if actionLoading}<span class="loading-spinner"></span>{/if}
						<Icon name="x" size={14} /> Block
					</button>
				{/if}
			{/snippet}
		</DetailHeader>

		<DeviceProfileSelector
			profileName={device.profile_name}
			profileId={device.profile_id}
			{profiles}
			{loadingProfiles}
			{changingProfile}
			onSelect={handleProfileChange}
		/>

		<DeviceTypePicker
			deviceType={device.device_type}
			changing={changingDeviceType}
			onSelect={handleDeviceTypeChange}
		/>

		<div class="info-grid">
			<DeviceIdentificationCard {device} />
			<DeviceConnectionCard {device} {statusLabel} />
			<DeviceStatusCard {device} />
		</div>

		<!-- Bandwidth History Chart (only for connected devices with MAC address) -->
		{#if device.connected && device.mac}
			<section class="device-charts">
				<BandwidthChart deviceMac={device.mac} />
			</section>
		{/if}

		{#if device.id}
			<div class="info-grid premium-grid">
				<PremiumGate feature="Device insights">
					<InsightsCard scope="device" id={device.id} />
				</PremiumGate>
				{#if device.mac}
					<PremiumGate feature="Data usage">
						<DataUsageMiniCard
							networkId={device.network_id ?? ''}
							entity="device"
							entityId={device.mac}
							title="Data Usage"
						/>
					</PremiumGate>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.device-detail-page {
		max-width: 1200px;
	}

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
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

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: var(--space-4);
	}

	.device-charts {
		margin-top: var(--space-6);
	}

	.premium-grid {
		margin-top: var(--space-6);
	}

	@media (max-width: 768px) {
		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
