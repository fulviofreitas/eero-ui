<!--
  Dashboard Page
  
  Main dashboard with network overview and quick stats.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { NetworkDetail, EeroSummary, ProfileSummary } from '$api/types';
	import { devicesStore, deviceCounts, uiStore, selectedNetworkId } from '$stores';
	import SpeedtestChart from '$lib/components/charts/SpeedtestChart.svelte';

	let network: NetworkDetail | null = null;
	let eeros: EeroSummary[] = [];
	let profiles: ProfileSummary[] = [];
	let loading = true;
	let speedTestLoading = false;
	let lastNetworkId: string | null = null;

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await Promise.all([loadNetworkData(), devicesStore.fetch()]);
	});

	// React to network changes
	$: if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
		lastNetworkId = $selectedNetworkId;
		loadNetworkData();
		devicesStore.fetch(true);
	}

	async function loadNetworkData() {
		loading = true;
		try {
			const networkId = $selectedNetworkId;
			if (networkId) {
				network = await api.networks.get(networkId);
				eeros = await api.eeros.list();
				profiles = await api.profiles.list();
			} else {
				// Fallback: get first network
				const networks = await api.networks.list();
				if (networks.length > 0) {
					network = await api.networks.get(networks[0].id);
					eeros = await api.eeros.list();
					profiles = await api.profiles.list();
				}
			}
		} catch (_error) {
			console.error('Failed to load network data:', _error);
		} finally {
			loading = false;
		}
	}

	// Computed values for profiles
	$: totalProfileDevices = profiles.reduce((sum, p) => sum + p.device_count, 0);
	$: pausedProfiles = profiles.filter((p) => p.paused).length;

	async function runSpeedTest() {
		if (!network) return;

		speedTestLoading = true;
		uiStore.info('Starting speed test... This may take a minute.');

		try {
			const result = await api.networks.speedTest(network.id);
			if (result) {
				network = await api.networks.get(network.id, true);
				uiStore.success('Speed test completed!');
			}
		} catch (_error) {
			uiStore.error('Speed test failed. Please try again.');
		} finally {
			speedTestLoading = false;
		}
	}

	// Speed test helper functions
	function getDownloadSpeed(speedTest: import('$api/types').SpeedTestResult | null): string {
		if (!speedTest) return '—';
		// Try raw format first (down.value), then normalized (download_mbps)
		const value = speedTest.down?.value ?? speedTest.download_mbps;
		return value ? value.toFixed(1) : '—';
	}

	function getUploadSpeed(speedTest: import('$api/types').SpeedTestResult | null): string {
		if (!speedTest) return '—';
		// Try raw format first (up.value), then normalized (upload_mbps)
		const value = speedTest.up?.value ?? speedTest.upload_mbps;
		return value ? value.toFixed(1) : '—';
	}

	function getSpeedTestDate(speedTest: import('$api/types').SpeedTestResult | null): string {
		if (!speedTest) return '';
		const dateStr = speedTest.date ?? speedTest.timestamp;
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleString();
	}
</script>

<svelte:head>
	<title>Dashboard | Eero Dashboard</title>
</svelte:head>

<div class="dashboard">
	<header class="page-header">
		<h1>Dashboard</h1>
		<p class="text-muted">Network overview and quick stats</p>
	</header>

	{#if loading}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading dashboard...</span>
		</div>
	{:else if network}
		<!-- Stats Grid -->
		<div class="stats-grid">
			<!-- Network Status Card -->
			<a href="/network/{network.id}" class="card stat-card network-status-card clickable-card">
				<div class="stat-header">
					<span class="stat-label">Network Status</span>
				</div>
				<div class="network-status-header">
					<div class="network-status-indicator" class:online={network.status === 'online'}>
						<span class="pulse-ring"></span>
						<span class="status-core"></span>
					</div>
					<div class="network-status-title">
						<span class="network-name">{network.name}</span>
						<span class="network-status-label"
							>{network.status === 'online' ? 'Connected' : network.status}</span
						>
					</div>
				</div>

				<div class="network-info-grid">
					{#if network.isp_name}
						<div class="network-info-item">
							<span class="info-icon">🌐</span>
							<div class="info-content">
								<span class="info-label">ISP</span>
								<span class="info-value">{network.isp_name}</span>
							</div>
						</div>
					{/if}
					{#if network.public_ip}
						<div class="network-info-item">
							<span class="info-icon">📡</span>
							<div class="info-content">
								<span class="info-label">Public IP</span>
								<span class="info-value mono">{network.public_ip}</span>
							</div>
						</div>
					{/if}
				</div>

				<div class="network-features">
					{#if network.wpa3}
						<span class="feature-badge">WPA3</span>
					{/if}
					{#if network.ipv6_upstream}
						<span class="feature-badge">IPv6</span>
					{/if}
					{#if network.band_steering}
						<span class="feature-badge">Band Steering</span>
					{/if}
					{#if network.sqm}
						<span class="feature-badge">SQM</span>
					{/if}
				</div>

				<span class="card-hint">View network details →</span>
			</a>

			<!-- Devices Card -->
			<a href="/devices" class="card stat-card clickable-card">
				<div class="stat-header">
					<span class="stat-label">Devices</span>
				</div>
				<div class="stat-value">{$deviceCounts.connected}</div>
				<div class="stat-meta">
					<span class="text-success">{$deviceCounts.connected} connected</span>
					<span class="text-muted">• {$deviceCounts.total} total</span>
				</div>
				<div class="stat-breakdown">
					<div class="breakdown-item">
						<span>📶 Wireless</span>
						<span class="mono">{$deviceCounts.wireless}</span>
					</div>
					<div class="breakdown-item">
						<span>🔌 Wired</span>
						<span class="mono">{$deviceCounts.wired}</span>
					</div>
				</div>
				<span class="card-hint">View all devices →</span>
			</a>

			<!-- Eeros Card -->
			<a href="/eeros" class="card stat-card clickable-card">
				<div class="stat-header">
					<span class="stat-label">Eero Nodes</span>
				</div>
				<div class="stat-value">{eeros.length}</div>
				<div class="stat-meta">
					<span class="text-success">{eeros.filter((e) => e.status === 'green').length} online</span
					>
				</div>
				<div class="stat-breakdown">
					{#each eeros.slice(0, 4) as eero}
						<div class="breakdown-item">
							<span class="breakdown-name">
								<span class="status-dot small" class:online={eero.status === 'green'}></span>
								{eero.location || eero.model}
							</span>
							<span class="badge {eero.is_gateway ? 'badge-info' : 'badge-neutral'} badge-sm">
								{eero.is_gateway ? 'Gateway' : 'Node'}
							</span>
						</div>
					{/each}
					{#if eeros.length > 4}
						<div class="breakdown-item text-muted">
							<span>+{eeros.length - 4} more</span>
						</div>
					{/if}
				</div>
				<span class="card-hint">View all eeros →</span>
			</a>

			<!-- Profiles Card -->
			<a href="/profiles" class="card stat-card clickable-card">
				<div class="stat-header">
					<span class="stat-label">Profiles</span>
				</div>
				<div class="stat-value">{profiles.length}</div>
				<div class="stat-meta">
					<span class="text-muted">{totalProfileDevices} devices assigned</span>
					{#if pausedProfiles > 0}
						<span class="text-muted">•</span>
						<span class="text-warning">{pausedProfiles} paused</span>
					{/if}
				</div>
				<div class="stat-breakdown">
					{#each [...profiles]
						.sort((a, b) => b.device_count - a.device_count)
						.slice(0, 4) as profile}
						<div class="breakdown-item">
							<span class="breakdown-name">
								<span
									class="status-dot small"
									class:online={!profile.paused}
									class:warning={profile.paused}
								></span>
								{profile.name}
							</span>
							<span class="mono text-sm">{profile.device_count}</span>
						</div>
					{/each}
					{#if profiles.length > 4}
						<div class="breakdown-item text-muted">
							<span>+{profiles.length - 4} more</span>
						</div>
					{/if}
					{#if profiles.length === 0}
						<div class="breakdown-item text-muted">
							<span>No profiles configured</span>
						</div>
					{/if}
				</div>
				<span class="card-hint">View all profiles →</span>
			</a>

			<!-- Speed Test Card -->
			<div class="card stat-card speed-card">
				<div class="stat-header">
					<span class="stat-label">Speed Test</span>
					<button
						class="btn btn-secondary btn-sm"
						on:click={runSpeedTest}
						disabled={speedTestLoading}
					>
						{#if speedTestLoading}
							<span class="loading-spinner"></span>
						{:else}
							Run Test
						{/if}
					</button>
				</div>
				{#if network.speed_test && (getDownloadSpeed(network.speed_test) !== '—' || getUploadSpeed(network.speed_test) !== '—')}
					<div class="speed-results">
						<div class="speed-item download">
							<div class="speed-icon">↓</div>
							<div class="speed-data">
								<span class="speed-value">
									{getDownloadSpeed(network.speed_test)}
									<span class="speed-unit">Mbps</span>
								</span>
								<span class="speed-label">Download</span>
							</div>
						</div>
						<div class="speed-item upload">
							<div class="speed-icon">↑</div>
							<div class="speed-data">
								<span class="speed-value">
									{getUploadSpeed(network.speed_test)}
									<span class="speed-unit">Mbps</span>
								</span>
								<span class="speed-label">Upload</span>
							</div>
						</div>
					</div>
					{#if getSpeedTestDate(network.speed_test)}
						<p class="speed-timestamp text-muted text-sm">
							Last tested: {getSpeedTestDate(network.speed_test)}
						</p>
					{/if}
				{:else}
					<p class="text-muted text-sm">
						No speed test data available. Run a test to see your network speed.
					</p>
				{/if}
			</div>
		</div>

		<!-- Speedtest History Chart -->
		{#if network}
			<section class="chart-section">
				<SpeedtestChart networkId={network.id} />
			</section>
		{/if}
	{:else}
		<div class="empty-state">
			<p>No network data available.</p>
		</div>
	{/if}
</div>

<style>
	.dashboard {
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: var(--space-6);
	}

	.page-header h1 {
		margin-bottom: var(--space-1);
	}

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* Network Status Card */
	.network-status-card {
		gap: var(--space-3);
	}

	.network-status-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.network-status-indicator {
		position: relative;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.network-status-indicator .status-core {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--color-danger);
		position: relative;
		z-index: 1;
	}

	.network-status-indicator.online .status-core {
		background: var(--color-success);
	}

	.network-status-indicator .pulse-ring {
		position: absolute;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--color-danger);
		opacity: 0.3;
	}

	.network-status-indicator.online .pulse-ring {
		border-color: var(--color-success);
		animation: pulse-ring 2s ease-out infinite;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(0.8);
			opacity: 0.5;
		}
		50% {
			transform: scale(1);
			opacity: 0.2;
		}
		100% {
			transform: scale(0.8);
			opacity: 0.5;
		}
	}

	.network-status-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.network-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.network-status-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success);
		font-weight: 500;
	}

	.network-status-indicator:not(.online) + .network-status-title .network-status-label {
		color: var(--color-danger);
	}

	.network-info-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-surface-elevated);
		border-radius: var(--radius-md);
	}

	.network-info-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.network-info-item .info-icon {
		font-size: 1rem;
		width: 24px;
		text-align: center;
	}

	.network-info-item .info-content {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.network-info-item .info-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.network-info-item .info-value {
		font-size: 0.8125rem;
		color: var(--color-text);
		font-weight: 500;
	}

	.network-features {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.feature-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 3px 8px;
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-full);
		opacity: 0.9;
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.stat-meta {
		font-size: 0.875rem;
		display: flex;
		gap: var(--space-2);
	}

	.stat-breakdown {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
	}

	.breakdown-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.status-dot.small {
		width: 6px;
		height: 6px;
	}

	.status-dot.warning {
		background-color: var(--color-warning, #f59e0b);
	}

	.badge-sm {
		font-size: 0.625rem;
		padding: 1px 6px;
	}

	.text-warning {
		color: var(--color-warning, #f59e0b);
	}

	/* Clickable card styles */
	.clickable-card {
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
		position: relative;
	}

	.clickable-card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.card-hint {
		font-size: 0.75rem;
		color: var(--color-accent);
		opacity: 0;
		transition: opacity var(--transition-fast);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.clickable-card:hover .card-hint {
		opacity: 1;
	}

	.speed-card {
		grid-column: span 2;
	}

	.speed-results {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.speed-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		background-color: var(--color-bg-primary);
		border-radius: var(--radius-md);
	}

	.speed-icon {
		font-size: 1.5rem;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background-color: var(--color-bg-tertiary);
	}

	.speed-item.download .speed-icon {
		color: var(--color-success);
	}

	.speed-item.upload .speed-icon {
		color: var(--color-accent);
	}

	.speed-data {
		display: flex;
		flex-direction: column;
	}

	.speed-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.speed-value {
		font-size: 1.25rem;
		font-weight: 600;
		font-family: var(--font-mono);
	}

	.speed-unit {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-left: var(--space-1);
	}

	.speed-item.download .speed-value {
		color: var(--color-success);
	}

	.speed-item.upload .speed-value {
		color: var(--color-accent);
	}

	.speed-timestamp {
		margin-top: var(--space-3);
		text-align: center;
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.chart-section {
		margin-top: var(--space-6);
	}

	@media (max-width: 768px) {
		.speed-card {
			grid-column: span 1;
		}

		.speed-results {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
