<!--
  Profile Detail Page

  Detailed view of a profile with associated devices.

  WP5 (6.0 revamp) note: decomposed into lib/components/profile/* feature components; this
  file is now data fetching + layout + composition only. Behaviour unchanged except:
  breadcrumb navigation via DetailHeader (item 5) and skeleton-first loading (item 4) in place
  of the previous back-link + full-block spinner.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { ProfileSummary, ProfileDevice } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import DetailHeader from '$components/common/DetailHeader.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ProfileStatusCard from '$lib/components/profile/ProfileStatusCard.svelte';
	import ProfileTechnicalCard from '$lib/components/profile/ProfileTechnicalCard.svelte';
	import ProfileDevicesSection from '$lib/components/profile/ProfileDevicesSection.svelte';
	import ProfileRenameModal from '$lib/components/profile/ProfileRenameModal.svelte';

	let profile = $state<ProfileSummary | null>(null);
	let loading = $state(true);
	let error: string | null = $state(null);
	let actionLoading = $state(false);
	let showRenameModal = $state(false);
	let renameValue = $state('');
	let renaming = $state(false);

	function goToDevice(device: ProfileDevice) {
		if (device.id) goto(`/devices/${device.id}`);
	}

	let profileId = $derived($page.params.id);
	let devices = $derived(profile?.devices || []);

	onMount(async () => {
		await fetchProfile();
	});

	async function fetchProfile(refresh = false) {
		if (!profileId) {
			error = 'Invalid profile ID';
			loading = false;
			return;
		}

		// Stale-while-revalidate: keep the previous `profile` on screen while this
		// refetch is in flight rather than blanking the page.
		loading = true;
		error = null;
		try {
			const result = await api.profiles.get(profileId, refresh);
			profile = result;
		} catch (err) {
			console.error('Failed to load profile:', err);
			error = err instanceof Error ? err.message : 'Failed to load profile details';
		} finally {
			loading = false;
		}
	}

	async function handleTogglePause() {
		if (!profile?.id) return;

		const profileId = profile.id;
		const action = profile.paused ? 'unpause' : 'pause';
		actionLoading = true;

		try {
			// Optimistic update
			profile = { ...profile, paused: !profile.paused };

			const result =
				action === 'pause'
					? await api.profiles.pause(profileId)
					: await api.profiles.unpause(profileId);

			if (result.success) {
				uiStore.success(result.message || `Profile ${action}d successfully`);
			}
		} catch (err) {
			console.error(`Failed to ${action} profile:`, err);
			// Rollback
			profile = { ...profile, paused: !profile.paused };
			uiStore.error(`Failed to ${action} profile`);
		} finally {
			actionLoading = false;
		}
	}

	async function handlePauseDevice(device: ProfileDevice) {
		if (!device.id) return;

		const deviceId = device.id;
		const action = device.paused ? 'unpause' : 'pause';
		const deviceName = device.display_name || device.nickname || device.hostname || 'Device';

		uiStore.confirm({
			title: `${action === 'pause' ? 'Pause' : 'Resume'} Device`,
			message: `Are you sure you want to ${action} "${deviceName}"?${action === 'pause' ? ' This will block internet access for this device.' : ''}`,
			confirmText: action === 'pause' ? 'Pause' : 'Resume',
			danger: action === 'pause',
			onConfirm: async () => {
				// Optimistic update
				if (profile) {
					profile = {
						...profile,
						devices: profile.devices.map((d) =>
							d.id === deviceId ? { ...d, paused: !d.paused } : d
						)
					};
				}

				try {
					const result = device.paused
						? await api.devices.unblock(deviceId)
						: await api.devices.block(deviceId);

					if (result.success) {
						uiStore.success(`${deviceName} ${action === 'pause' ? 'paused' : 'resumed'}`);
					}
				} catch (err) {
					console.error(`Failed to ${action} device:`, err);
					// Rollback
					if (profile) {
						profile = {
							...profile,
							devices: profile.devices.map((d) =>
								d.id === device.id ? { ...d, paused: device.paused } : d
							)
						};
					}
					uiStore.error(`Failed to ${action} device`);
				}
			}
		});
	}

	function openRenameModal() {
		renameValue = profile?.name ?? '';
		showRenameModal = true;
	}

	async function handleRenameProfile(name: string) {
		const trimmed = name.trim();
		if (!trimmed || !profileId) return;
		renaming = true;
		try {
			profile = await api.profiles.rename(profileId, trimmed);
			uiStore.success(`Profile renamed to "${trimmed}"`);
			showRenameModal = false;
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to rename profile');
		} finally {
			renaming = false;
		}
	}

	function handleDeleteProfile() {
		if (!profileId) return;
		uiStore.confirm({
			title: 'Delete Profile',
			message: 'Are you sure? Devices assigned to this profile will become unassigned.',
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await api.profiles.delete(profileId);
					uiStore.success('Profile deleted');
					goto('/profiles');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete profile');
				}
			}
		});
	}
</script>

<svelte:head>
	<title>{profile?.name || 'Profile'} | Eero Dashboard</title>
</svelte:head>

<div class="profile-detail-page">
	{#if loading && !profile}
		<Skeleton variant="card" height="100px" />
		<Skeleton variant="table-rows" rows={4} columns={5} />
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" onclick={() => fetchProfile(true)}> Try Again </button>
				<button class="btn btn-ghost" onclick={() => goto('/profiles')}> Back to Profiles </button>
			</div>
		</div>
	{:else if profile}
		<DetailHeader
			backHref="/profiles"
			backLabel="Back to profiles"
			title={profile.name || 'Unknown Profile'}
		>
			{#snippet status()}
				<StatusBadge status={profile!.paused ? 'paused' : 'online'} />
				<span class="text-muted">•</span>
				<span class="text-muted">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
			{/snippet}
			{#snippet actions()}
				<button
					class="btn btn-secondary"
					onclick={() => fetchProfile(true)}
					disabled={actionLoading}
				>
					<Icon name="refresh" size={14} /> Refresh
				</button>
				<button class="btn btn-secondary" onclick={openRenameModal} disabled={actionLoading}>
					<Icon name="edit" size={14} /> Rename
				</button>
				<button class="btn btn-danger" onclick={handleDeleteProfile} disabled={actionLoading}>
					Delete
				</button>
				<button
					class="btn {profile!.paused ? 'btn-primary' : 'btn-warning'}"
					onclick={handleTogglePause}
					disabled={actionLoading}
				>
					{#if actionLoading}
						<span class="loading-spinner"></span>
					{:else if profile!.paused}
						▶ Resume Internet
					{:else}
						⏸ Pause Internet
					{/if}
				</button>
			{/snippet}
		</DetailHeader>

		<ProfileStatusCard paused={profile.paused} />

		<ProfileTechnicalCard {profile} networkId={$selectedNetworkId} />

		<ProfileDevicesSection
			{devices}
			deviceCount={profile.device_count}
			{loading}
			onPauseDevice={handlePauseDevice}
			onGoToDevice={goToDevice}
			onRefresh={() => fetchProfile(true)}
		/>

		<ProfileRenameModal
			open={showRenameModal}
			value={renameValue}
			submitting={renaming}
			onClose={() => (showRenameModal = false)}
			onSubmit={handleRenameProfile}
			onValueChange={(v) => (renameValue = v)}
		/>
	{/if}
</div>

<style>
	.profile-detail-page {
		max-width: 1000px;
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-12);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
	}

	.btn-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	.btn-danger {
		background-color: var(--color-danger);
		color: white;
	}

	.btn-danger:hover:not(:disabled) {
		opacity: 0.85;
	}
</style>
