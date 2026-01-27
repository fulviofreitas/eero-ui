<!--
  Device Detail Page
  
  Full detailed view of a single device with all available information.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { DeviceDetail, ProfileSummary } from '$api/types';
	import { uiStore, devicesStore } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import BandwidthChart from '$lib/components/charts/BandwidthChart.svelte';

	/**
	 * Get the appropriate emoji for a device type
	 */
	function getDeviceTypeEmoji(deviceType: string | null, wireless: boolean): string {
		if (!deviceType) {
			return wireless ? '📱' : '🖥️';
		}

		const type = deviceType.toLowerCase();

		// Map device types to emojis
		const emojiMap: Record<string, string> = {
			// Mobile devices
			phone: '📱',
			mobile: '📱',
			smartphone: '📱',
			iphone: '📱',
			android: '📱',
			// Tablets
			tablet: '📲',
			ipad: '📲',
			// Computers
			computer: '💻',
			laptop: '💻',
			notebook: '💻',
			macbook: '💻',
			desktop: '🖥️',
			pc: '🖥️',
			mac: '🖥️',
			imac: '🖥️',
			workstation: '🖥️',
			// Entertainment
			tv: '📺',
			television: '📺',
			smart_tv: '📺',
			streaming: '📺',
			streaming_device: '📺',
			media_player: '📺',
			appletv: '📺',
			firetv: '📺',
			roku: '📺',
			chromecast: '📺',
			// Gaming
			gaming: '🎮',
			gaming_console: '🎮',
			game_console: '🎮',
			playstation: '🎮',
			xbox: '🎮',
			nintendo: '🎮',
			switch: '🎮',
			// Audio
			speaker: '🔊',
			smart_speaker: '🔊',
			homepod: '🔊',
			echo: '🔊',
			alexa: '🔊',
			sonos: '🔊',
			// Smart home
			smart_home: '🏠',
			iot: '🏠',
			hub: '🏠',
			thermostat: '🌡️',
			camera: '📷',
			security_camera: '📷',
			doorbell: '🚪',
			light: '💡',
			lighting: '💡',
			plug: '🔌',
			smart_plug: '🔌',
			outlet: '🔌',
			// Wearables
			wearable: '⌚',
			watch: '⌚',
			smartwatch: '⌚',
			apple_watch: '⌚',
			fitness: '⌚',
			// Network
			router: '📡',
			access_point: '📡',
			network: '📡',
			bridge: '🌉',
			extender: '📡',
			// Printers & Office
			printer: '🖨️',
			scanner: '🖨️',
			// Storage
			nas: '💾',
			storage: '💾',
			server: '🗄️',
			// Other
			car: '🚗',
			vehicle: '🚗',
			appliance: '🔌',
			unknown: wireless ? '📱' : '🖥️'
		};

		// Try exact match first
		if (emojiMap[type]) {
			return emojiMap[type];
		}

		// Try partial matches
		for (const [key, emoji] of Object.entries(emojiMap)) {
			if (type.includes(key) || key.includes(type)) {
				return emoji;
			}
		}

		// Default based on connection type
		return wireless ? '📱' : '🖥️';
	}

	let device: DeviceDetail | null = null;
	let loading = true;
	let error: string | null = null;
	let actionLoading = false;

	// Profile management
	let profiles: ProfileSummary[] = [];
	let loadingProfiles = false;
	let profileDropdownOpen = false;
	let changingProfile = false;

	$: deviceId = $page.params.id;
	$: displayName =
		device?.display_name || device?.nickname || device?.hostname || device?.mac || 'Unknown Device';
	$: statusLabel = device?.blocked ? 'blocked' : device?.connected ? 'connected' : 'disconnected';

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

		changingProfile = true;
		profileDropdownOpen = false;

		try {
			// Note: This would require a backend endpoint to assign device to profile
			uiStore.success(
				`Would assign device to "${profileName}". (API endpoint needed for profile assignment)`
			);
			// await fetchDevice(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to change profile');
		} finally {
			changingProfile = false;
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

	function getSignalBars(bars: number | null): string {
		if (bars === null) return '━━━━';
		return '█'.repeat(Math.min(bars, 4)) + '░'.repeat(Math.max(0, 4 - bars));
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}

	function closeProfileDropdown(event: MouseEvent) {
		if (profileDropdownOpen && !(event.target as HTMLElement).closest('.profile-selector')) {
			profileDropdownOpen = false;
		}
	}
</script>

<svelte:window on:click={closeProfileDropdown} />

<svelte:head>
	<title>{displayName} | Eero Dashboard</title>
</svelte:head>

<div class="device-detail-page">
	<!-- Back navigation -->
	<nav class="breadcrumb">
		<a href="/devices" class="back-link">← Back to Devices</a>
	</nav>

	{#if loading}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading device details...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" on:click={() => fetchDevice(true)}> Try Again </button>
				<button class="btn btn-ghost" on:click={() => goto('/devices')}> Back to Devices </button>
			</div>
		</div>
	{:else if device}
		<!-- Header -->
		<header class="detail-header">
			<div class="header-info">
				<div class="header-title">
					<span class="device-icon">{getDeviceTypeEmoji(device.device_type, device.wireless)}</span>
					<div>
						<h1>{displayName}</h1>
						{#if device.manufacturer}
							<span class="text-muted">{device.manufacturer}</span>
						{/if}
					</div>
				</div>
				<div class="header-meta">
					<StatusBadge status={statusLabel} />
					<span class="text-muted">•</span>
					<span class="mono text-muted">{device.mac || '—'}</span>
				</div>
			</div>
			<div class="header-actions">
				<button
					class="btn btn-secondary"
					on:click={() => fetchDevice(true)}
					disabled={actionLoading}
				>
					↻ Refresh
				</button>
				<button class="btn btn-secondary" on:click={handleRename} disabled={actionLoading}>
					✏️ Rename
				</button>
				{#if device.blocked}
					<button class="btn btn-primary" on:click={handleUnblock} disabled={actionLoading}>
						{#if actionLoading}<span class="loading-spinner"></span>{/if}
						✓ Unblock
					</button>
				{:else}
					<button class="btn btn-danger" on:click={handleBlock} disabled={actionLoading}>
						{#if actionLoading}<span class="loading-spinner"></span>{/if}
						🚫 Block
					</button>
				{/if}
			</div>
		</header>

		<!-- Profile Selector (at top) -->
		<section class="profile-section card">
			<div class="profile-header">
				<h2>📁 Profile</h2>
				<div class="profile-selector" on:click|stopPropagation>
					<button
						class="btn btn-secondary"
						on:click={() => (profileDropdownOpen = !profileDropdownOpen)}
						disabled={changingProfile || loadingProfiles}
					>
						{#if changingProfile}
							<span class="loading-spinner"></span>
						{/if}
						{device.profile_name || 'No Profile'}
						<span class="dropdown-arrow">▼</span>
					</button>
					{#if profileDropdownOpen}
						<div class="profile-dropdown">
							<div class="profile-dropdown-header">
								<span class="text-sm text-muted">Select Profile</span>
							</div>
							{#if loadingProfiles}
								<div class="profile-loading">
									<span class="loading-spinner"></span>
									Loading...
								</div>
							{:else}
								<button
									class="profile-option"
									class:active={!device.profile_id}
									on:click={() => handleProfileChange(null, 'No Profile')}
								>
									<span>No Profile</span>
								</button>
								{#each profiles as profile}
									<button
										class="profile-option"
										class:active={device.profile_id === profile.id}
										on:click={() => handleProfileChange(profile.id, profile.name)}
									>
										<span>{profile.name}</span>
										{#if device.profile_id === profile.id}
											<span class="check">✓</span>
										{/if}
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			</div>
			{#if device.profile_id}
				<p class="profile-link">
					<a href="/profiles/{device.profile_id}">View profile details →</a>
				</p>
			{/if}
		</section>

		<!-- Info Grid -->
		<div class="info-grid">
			<!-- Identification -->
			<section class="card info-card">
				<h2>Identification</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Display Name</dt>
						<dd>{device.display_name || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Nickname</dt>
						<dd>{device.nickname || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Hostname</dt>
						<dd class="mono">{device.hostname || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Manufacturer</dt>
						<dd>{device.manufacturer || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Model</dt>
						<dd>{device.model_name || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Device Type</dt>
						<dd>
							{#if device.device_type}
								<span class="device-type-badge">
									<span class="device-type-emoji"
										>{getDeviceTypeEmoji(device.device_type, device.wireless)}</span
									>
									{device.device_type}
								</span>
							{:else}
								—
							{/if}
						</dd>
					</div>
				</dl>
			</section>

			<!-- Network -->
			<section class="card info-card">
				<h2>Network</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>IP Address</dt>
						<dd class="mono">{device.ip || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>IPv4</dt>
						<dd class="mono">{device.ipv4 || '—'}</dd>
					</div>
					{#if device.ips && device.ips.length > 1}
						<div class="info-row">
							<dt>All IPs</dt>
							<dd class="mono">{device.ips.join(', ')}</dd>
						</div>
					{/if}
					<div class="info-row">
						<dt>MAC Address</dt>
						<dd class="mono">{device.mac || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Subnet</dt>
						<dd>{device.subnet_kind || '—'}</dd>
					</div>
				</dl>
			</section>

			<!-- Connection -->
			<section class="card info-card">
				<h2>Connection</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Status</dt>
						<dd>
							<StatusBadge status={statusLabel} />
						</dd>
					</div>
					<div class="info-row">
						<dt>Type</dt>
						<dd>{device.wireless ? '📶 Wireless' : '🔌 Wired'}</dd>
					</div>
					<div class="info-row">
						<dt>Connected To</dt>
						<dd>
							{#if device.connected_to_eero}
								{#if device.connected_to_eero_id}
									<a href="/eeros/{device.connected_to_eero_id}" class="eero-link"
										>{device.connected_to_eero}</a
									>
								{:else}
									{device.connected_to_eero}
								{/if}
								{#if device.connected_to_eero_model}
									<span class="text-muted">({device.connected_to_eero_model})</span>
								{/if}
							{:else}
								—
							{/if}
						</dd>
					</div>
					{#if device.wireless}
						<div class="info-row">
							<dt>SSID</dt>
							<dd>{device.ssid || '—'}</dd>
						</div>
						<div class="info-row">
							<dt>Frequency</dt>
							<dd>
								{#if device.frequency}
									<span class="badge badge-neutral">{device.frequency}</span>
									{#if device.frequency_mhz}
										<span class="text-muted">({device.frequency_mhz} MHz)</span>
									{/if}
								{:else}
									—
								{/if}
							</dd>
						</div>
						<div class="info-row">
							<dt>Channel</dt>
							<dd>{device.channel || '—'}</dd>
						</div>
						<div class="info-row">
							<dt>Signal Strength</dt>
							<dd>
								{#if device.signal_strength}
									<span class="signal mono">{getSignalBars(device.signal_bars)}</span>
									<span>{device.signal_strength} dBm</span>
								{:else}
									—
								{/if}
							</dd>
						</div>
					{/if}
					<div class="info-row">
						<dt>Auth</dt>
						<dd>{device.auth || '—'}</dd>
					</div>
				</dl>
			</section>

			<!-- Transfer Rates -->
			{#if device.rx_bitrate || device.tx_bitrate}
				<section class="card info-card">
					<h2>Transfer Rates</h2>
					<dl class="info-list">
						{#if device.tx_bitrate}
							<div class="info-row">
								<dt>TX Bitrate</dt>
								<dd class="mono">{device.tx_bitrate}</dd>
							</div>
						{/if}
						{#if device.rx_bitrate}
							<div class="info-row">
								<dt>RX Bitrate</dt>
								<dd class="mono">{device.rx_bitrate}</dd>
							</div>
						{/if}
					</dl>
				</section>
			{/if}

			<!-- Status -->
			<section class="card info-card">
				<h2>Status</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Connected</dt>
						<dd>
							<span
								class="status-indicator"
								class:status-success={device.connected}
								class:status-muted={!device.connected}
							>
								{device.connected ? '● Connected' : '○ Disconnected'}
							</span>
						</dd>
					</div>
					<div class="info-row">
						<dt>Blocked</dt>
						<dd>
							<span
								class="status-indicator"
								class:status-danger={device.blocked}
								class:status-success={!device.blocked}
							>
								{device.blocked ? '🚫 Blocked' : '✓ Allowed'}
							</span>
						</dd>
					</div>
					<div class="info-row">
						<dt>Paused</dt>
						<dd>
							<span
								class="status-indicator"
								class:status-warning={device.paused}
								class:status-success={!device.paused}
							>
								{device.paused ? '⏸ Paused' : '▶ Active'}
							</span>
						</dd>
					</div>
					<div class="info-row">
						<dt>Guest Network</dt>
						<dd>
							{#if device.is_guest}
								<span class="status-indicator status-info">👥 Yes</span>
							{:else}
								<span class="status-indicator status-muted">No</span>
							{/if}
						</dd>
					</div>
					<div class="info-row">
						<dt>Private MAC</dt>
						<dd>
							{#if device.is_private}
								<span class="status-indicator status-warning">🔒 Randomized</span>
							{:else}
								<span class="status-indicator status-muted">No</span>
							{/if}
						</dd>
					</div>
				</dl>
			</section>

			<!-- Timestamps -->
			<section class="card info-card">
				<h2>Activity</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Last Active</dt>
						<dd>{formatDate(device.last_active)}</dd>
					</div>
					<div class="info-row">
						<dt>First Seen</dt>
						<dd>{formatDate(device.first_active)}</dd>
					</div>
				</dl>
			</section>

			<!-- Technical -->
			<section class="card info-card">
				<h2>Technical</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Device ID</dt>
						<dd class="mono text-sm">{device.id || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Network ID</dt>
						<dd class="mono text-sm">{device.network_id || '—'}</dd>
					</div>
					{#if device.url}
						<div class="info-row">
							<dt>API URL</dt>
							<dd class="mono text-sm text-muted">{device.url}</dd>
						</div>
					{/if}
				</dl>
			</section>
		</div>

		<!-- Bandwidth History Chart (only for connected devices with MAC address) -->
		{#if device.connected && device.mac}
			<section class="device-charts">
				<BandwidthChart deviceMac={device.mac} />
			</section>
		{/if}
	{/if}
</div>

<style>
	.device-detail-page {
		max-width: 1200px;
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
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.loading-state {
		flex-direction: row;
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

	.device-icon {
		font-size: 2.5rem;
	}

	.header-title h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.header-actions {
		display: flex;
		gap: var(--space-2);
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: var(--space-4);
	}

	.info-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-list {
		margin: 0;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--space-2) 0;
		gap: var(--space-4);
	}

	.info-row:not(:last-child) {
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-row dt {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.info-row dd {
		margin: 0;
		font-weight: 500;
		text-align: right;
		word-break: break-word;
	}

	.signal {
		color: var(--color-success);
		letter-spacing: 0.1em;
		margin-right: var(--space-2);
	}

	.eero-link {
		color: var(--color-accent);
		text-decoration: none;
		font-weight: 500;
	}

	.eero-link:hover {
		text-decoration: underline;
	}

	.text-warning {
		color: var(--color-warning);
	}

	.device-type-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.device-type-emoji {
		font-size: 1.1rem;
	}

	/* Profile Section */
	.profile-section {
		margin-bottom: var(--space-6);
		padding: var(--space-4);
	}

	.profile-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.profile-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.profile-selector {
		position: relative;
	}

	.dropdown-arrow {
		font-size: 0.625rem;
		margin-left: var(--space-2);
		opacity: 0.6;
	}

	.profile-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-2);
		min-width: 200px;
		background-color: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
		overflow: hidden;
	}

	.profile-dropdown-header {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.profile-loading {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		color: var(--color-text-secondary);
	}

	.profile-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.profile-option:hover {
		background-color: var(--color-bg-tertiary);
	}

	.profile-option.active {
		background-color: var(--color-bg-tertiary);
		color: var(--color-accent);
	}

	.profile-option .check {
		color: var(--color-success);
	}

	.profile-link {
		margin-top: var(--space-3);
		margin-bottom: 0;
		font-size: 0.875rem;
	}

	/* Status Indicators with Colors */
	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status-success {
		color: var(--color-success);
		background-color: rgba(34, 197, 94, 0.1);
	}

	.status-danger {
		color: var(--color-danger);
		background-color: rgba(239, 68, 68, 0.1);
	}

	.status-warning {
		color: var(--color-warning);
		background-color: rgba(245, 158, 11, 0.1);
	}

	.status-info {
		color: var(--color-accent);
		background-color: rgba(59, 130, 246, 0.1);
	}

	.status-muted {
		color: var(--color-text-secondary);
		background-color: var(--color-bg-tertiary);
	}

	/* Bandwidth Chart Section */
	.device-charts {
		margin-top: var(--space-6);
	}

	@media (max-width: 768px) {
		.detail-header {
			flex-direction: column;
			gap: var(--space-4);
		}

		.header-actions {
			width: 100%;
			flex-wrap: wrap;
		}

		.header-actions .btn {
			flex: 1;
			min-width: 100px;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
