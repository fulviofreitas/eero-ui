<!--
  Profile Detail Page
  
  Detailed view of a profile with associated devices.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { ProfileSummary, ProfileDevice } from '$api/types';
	import { uiStore } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';

	let profile: ProfileSummary | null = null;
	let loading = true;
	let error: string | null = null;
	let actionLoading = false;
	let viewMode: 'blocks' | 'list' = 'blocks';

	$: profileId = $page.params.id;
	$: devices = profile?.devices || [];

	onMount(async () => {
		await fetchProfile();
	});

	async function fetchProfile(refresh = false) {
		if (!profileId) {
			error = 'Invalid profile ID';
			loading = false;
			return;
		}

		loading = true;
		error = null;
		try {
			const result = await api.profiles.get(profileId, refresh);
			console.log('Profile detail:', result);
			console.log('Profile devices:', result.devices);
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

			const result = profile.paused
				? await api.profiles.unpause(profileId)
				: await api.profiles.pause(profileId);

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

	function getDeviceKey(device: ProfileDevice, index: number): string {
		return device.id || device.mac || `device-${index}`;
	}
</script>

<svelte:head>
	<title>{profile?.name || 'Profile'} | Eero Dashboard</title>
</svelte:head>

<div class="profile-detail-page">
	<!-- Back navigation -->
	<nav class="breadcrumb">
		<a href="/profiles" class="back-link">← Back to Profiles</a>
	</nav>

	{#if loading}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading profile...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" on:click={() => fetchProfile(true)}> Try Again </button>
				<button class="btn btn-ghost" on:click={() => goto('/profiles')}> Back to Profiles </button>
			</div>
		</div>
	{:else if profile}
		<!-- Header -->
		<header class="detail-header">
			<div class="header-info">
				<div class="header-title">
					<span class="profile-icon">👤</span>
					<h1>{profile.name || 'Unknown Profile'}</h1>
				</div>
				<div class="header-meta">
					<StatusBadge status={profile.paused ? 'paused' : 'online'} />
					<span class="text-muted">•</span>
					<span class="text-muted">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
				</div>
			</div>
			<div class="header-actions">
				<button
					class="btn btn-secondary"
					on:click={() => fetchProfile(true)}
					disabled={actionLoading}
				>
					↻ Refresh
				</button>
				<button
					class="btn {profile.paused ? 'btn-primary' : 'btn-warning'}"
					on:click={handleTogglePause}
					disabled={actionLoading}
				>
					{#if actionLoading}
						<span class="loading-spinner"></span>
					{:else if profile.paused}
						▶ Resume Internet
					{:else}
						⏸ Pause Internet
					{/if}
				</button>
			</div>
		</header>

		<!-- Status Card -->
		<section class="card status-card" class:paused={profile.paused}>
			{#if profile.paused}
				<div class="status-message paused">
					<span class="status-icon">⏸</span>
					<div>
						<strong>Internet Access Paused</strong>
						<p class="text-sm text-muted">
							All devices in this profile are currently blocked from accessing the internet.
						</p>
					</div>
				</div>
			{:else}
				<div class="status-message active">
					<span class="status-icon">✓</span>
					<div>
						<strong>Internet Access Active</strong>
						<p class="text-sm text-muted">Devices in this profile have normal internet access.</p>
					</div>
				</div>
			{/if}
		</section>

		<!-- Technical -->
		<section class="card info-card technical-card">
			<h2>Technical</h2>
			<dl class="info-list">
				<div class="info-row">
					<dt>Profile ID</dt>
					<dd class="mono text-sm">{profile.id || '—'}</dd>
				</div>
				{#if profile.url}
					<div class="info-row">
						<dt>API URL</dt>
						<dd class="mono text-sm text-muted">{profile.url}</dd>
					</div>
				{/if}
			</dl>
		</section>

		<!-- Devices Section -->
		<section class="devices-section">
			<div class="section-header">
				<h2>
					Devices ({devices.length}{profile.device_count !== devices.length
						? ` of ${profile.device_count}`
						: ''})
				</h2>
				<div class="view-toggle">
					<button
						class="toggle-btn"
						class:active={viewMode === 'blocks'}
						on:click={() => (viewMode = 'blocks')}
						title="Block view"
					>
						▦
					</button>
					<button
						class="toggle-btn"
						class:active={viewMode === 'list'}
						on:click={() => (viewMode = 'list')}
						title="List view"
					>
						☰
					</button>
				</div>
			</div>

			{#if loading && devices.length === 0}
				<div class="loading-state small">
					<span class="loading-spinner"></span>
					<span>Loading devices...</span>
				</div>
			{:else if devices.length === 0}
				<div class="empty-state card">
					<p>No devices found for this profile.</p>
					<p class="text-sm text-muted">
						{#if profile.device_count > 0}
							This profile has {profile.device_count} assigned devices, but they may not be in the current
							device cache.
							<button
								class="btn btn-secondary btn-sm"
								on:click={() => fetchProfile(true)}
								style="margin-top: var(--space-2);"
							>
								Refresh
							</button>
						{:else}
							Assign devices to this profile using the Eero app.
						{/if}
					</p>
				</div>
			{:else if viewMode === 'blocks'}
				<!-- Block/Card View -->
				<div class="devices-grid">
					{#each devices as device, index (getDeviceKey(device, index))}
						<a
							href={device.id ? `/devices/${device.id}` : undefined}
							class="card device-card"
							class:paused={device.paused}
							class:offline={!device.connected}
							class:clickable={!!device.id}
						>
							<div class="device-header">
								<div class="device-info">
									<span class="device-icon">{device.wireless ? '📱' : '🖥️'}</span>
									<div>
										<h3>
											{device.display_name ||
												device.nickname ||
												device.hostname ||
												'Unknown Device'}
										</h3>
										<span class="text-sm text-muted mono">{device.ip || device.mac || '—'}</span>
									</div>
								</div>
								<div class="device-status">
									{#if device.paused}
										<span class="badge badge-warning">Paused</span>
									{:else if device.connected}
										<span class="status-dot online"></span>
									{:else}
										<span class="status-dot offline"></span>
									{/if}
								</div>
							</div>

							<div class="device-details">
								<div class="detail-row">
									<span class="label">Status</span>
									<span class="value">{device.connected ? 'Online' : 'Offline'}</span>
								</div>
								<div class="detail-row">
									<span class="label">Connection</span>
									<span class="value">{device.wireless ? '📶 Wireless' : '🔌 Wired'}</span>
								</div>
								{#if device.manufacturer}
									<div class="detail-row">
										<span class="label">Manufacturer</span>
										<span class="value">{device.manufacturer}</span>
									</div>
								{/if}
							</div>

							<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
							<div class="device-actions" on:click|stopPropagation>
								<button
									class="btn btn-sm {device.paused ? 'btn-primary' : 'btn-warning'}"
									on:click|preventDefault={() => handlePauseDevice(device)}
								>
									{device.paused ? '▶ Resume' : '⏸ Pause'}
								</button>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<!-- List View -->
				<div class="card devices-list">
					<table class="devices-table">
						<thead>
							<tr>
								<th>Device</th>
								<th>IP Address</th>
								<th>Status</th>
								<th>Connection</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each devices as device, index (getDeviceKey(device, index))}
								<tr
									class:paused={device.paused}
									class:offline={!device.connected}
									class:clickable={!!device.id}
									on:click={() => device.id && goto(`/devices/${device.id}`)}
								>
									<td class="device-name-cell">
										<span class="device-icon-sm">{device.wireless ? '📱' : '🖥️'}</span>
										<div>
											<span class="device-name"
												>{device.display_name ||
													device.nickname ||
													device.hostname ||
													'Unknown'}</span
											>
											{#if device.manufacturer}
												<span class="text-xs text-muted">{device.manufacturer}</span>
											{/if}
										</div>
									</td>
									<td class="mono text-sm">{device.ip || '—'}</td>
									<td>
										{#if device.paused}
											<span class="badge badge-warning">Paused</span>
										{:else if device.connected}
											<span class="badge badge-success">Online</span>
										{:else}
											<span class="badge badge-muted">Offline</span>
										{/if}
									</td>
									<td class="text-sm">{device.wireless ? '📶 Wireless' : '🔌 Wired'}</td>
									<td on:click|stopPropagation>
										<button
											class="btn btn-xs {device.paused ? 'btn-primary' : 'btn-warning'}"
											on:click={() => handlePauseDevice(device)}
										>
											{device.paused ? 'Resume' : 'Pause'}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.profile-detail-page {
		max-width: 1000px;
	}

	.breadcrumb {
		margin-bottom: var(--space-4);
	}

	.back-link {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-12);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.loading-state {
		flex-direction: row;
	}

	.loading-state.small {
		padding: var(--space-6);
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
	}

	.detail-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.header-title h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.profile-icon {
		font-size: 2rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-left: calc(2rem + var(--space-3));
	}

	.header-actions {
		display: flex;
		gap: var(--space-2);
	}

	.status-card {
		margin-bottom: var(--space-6);
	}

	.status-card.paused {
		border-color: var(--color-warning);
		background-color: rgba(245, 180, 50, 0.05);
	}

	.status-message {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.status-icon {
		font-size: 1.5rem;
	}

	.status-message.paused {
		color: var(--color-warning);
	}

	.status-message.active {
		color: var(--color-success);
	}

	.status-message p {
		margin: var(--space-1) 0 0 0;
		color: var(--color-text-secondary);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.section-header h2 {
		font-size: 1rem;
		margin: 0;
	}

	.view-toggle {
		display: flex;
		gap: var(--space-1);
		background: var(--color-bg-tertiary);
		padding: var(--space-1);
		border-radius: var(--radius-md);
	}

	.toggle-btn {
		padding: var(--space-1) var(--space-2);
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 1rem;
		color: var(--color-text-secondary);
		transition: all 0.15s ease;
	}

	.toggle-btn:hover {
		color: var(--color-text-primary);
	}

	.toggle-btn.active {
		background: var(--color-bg-secondary);
		color: var(--color-accent);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.devices-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-4);
	}

	.device-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		text-decoration: none;
		color: inherit;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}

	.device-card.clickable {
		cursor: pointer;
	}

	.device-card.clickable:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-color: var(--color-accent);
	}

	.device-card.paused {
		border-color: var(--color-warning);
		opacity: 0.7;
	}

	.device-card.offline {
		opacity: 0.6;
	}

	.device-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.device-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.device-icon {
		font-size: 1.5rem;
	}

	.device-info h3 {
		margin: 0;
		font-size: 0.9375rem;
	}

	.device-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
	}

	.label {
		color: var(--color-text-secondary);
	}

	.value {
		font-weight: 500;
	}

	.device-actions {
		display: flex;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	.device-actions .btn {
		flex: 1;
	}

	.btn-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	.btn-warning:hover:not(:disabled) {
		background-color: #e0a820;
	}

	/* List View Styles */
	.devices-list {
		overflow-x: auto;
	}

	.devices-table {
		width: 100%;
		border-collapse: collapse;
	}

	.devices-table th,
	.devices-table td {
		text-align: left;
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.devices-table th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		font-weight: 600;
		background: var(--color-bg-primary);
	}

	.devices-table tbody tr.clickable {
		cursor: pointer;
	}

	.devices-table tbody tr:hover {
		background: var(--color-bg-primary);
	}

	.devices-table tbody tr.clickable:hover {
		background: var(--color-bg-tertiary);
	}

	.devices-table tbody tr.paused {
		opacity: 0.7;
	}

	.devices-table tbody tr.offline {
		opacity: 0.6;
	}

	.device-name-cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.device-icon-sm {
		font-size: 1.25rem;
	}

	.device-name-cell div {
		display: flex;
		flex-direction: column;
	}

	.device-name {
		font-weight: 500;
	}

	.btn-xs {
		padding: var(--space-1) var(--space-2);
		font-size: 0.75rem;
	}

	.badge-success {
		background-color: var(--color-success);
		color: white;
	}

	.badge-muted {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
	}

	.badge-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	/* Technical Card */
	.technical-card {
		margin-bottom: var(--space-6);
	}

	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
	}

	.info-row dt {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.info-row dd {
		font-weight: 500;
		text-align: right;
		word-break: break-all;
	}

	@media (max-width: 768px) {
		.detail-header {
			flex-direction: column;
			gap: var(--space-4);
		}

		.header-actions {
			width: 100%;
			flex-direction: column;
		}

		.header-actions .btn {
			width: 100%;
		}

		.header-meta {
			padding-left: 0;
		}
	}
</style>
