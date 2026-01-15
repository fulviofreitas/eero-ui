<!--
  Eero Detail Page
  
  Detailed view of a single Eero node with all available information.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { EeroDetail } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';

	let eero: EeroDetail | null = null;
	let loading = true;
	let error: string | null = null;
	let actionLoading = false;
	let lastNetworkId: string | null = null;

	$: eeroId = $page.params.id;

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchEero();
	});

	// React to network changes
	$: if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
		lastNetworkId = $selectedNetworkId;
		fetchEero(true);
	}

	async function fetchEero(refresh = false) {
		if (!eeroId) {
			error = 'Invalid eero ID';
			loading = false;
			return;
		}

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

	function getMeshQualityBars(bars: number | null | undefined): string {
		if (bars === null || bars === undefined) return '━━━━━';
		const filled = Math.min(Math.max(0, bars), 5);
		return '█'.repeat(filled) + '░'.repeat(5 - filled);
	}

	function formatUptime(seconds: number | null | undefined): string {
		if (!seconds) return '—';
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (days > 0) return `${days}d ${hours}h`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '—';
		try {
			return new Date(dateStr).toLocaleString();
		} catch {
			return dateStr;
		}
	}

	function formatPercentage(value: number | null | undefined): string {
		if (value === null || value === undefined) return '—';
		return `${value.toFixed(1)}%`;
	}

	function formatTemperature(celsius: number | null | undefined): string {
		if (celsius === null || celsius === undefined) return '—';
		const fahrenheit = (celsius * 9) / 5 + 32;
		return `${celsius.toFixed(1)}°C / ${fahrenheit.toFixed(1)}°F`;
	}

	function formatBand(band: string): string {
		// Convert API band names to readable format
		const bandMap: Record<string, string> = {
			band_2_4GHz: '2.4 GHz',
			band_5GHz: '5 GHz',
			band_5GHz_full: '5 GHz',
			band_5GHz_low: '5 GHz Low',
			band_5GHz_high: '5 GHz High',
			band_6GHz: '6 GHz'
		};
		return bandMap[band] || band.replace('band_', '').replace('_', ' ').replace('GHz', ' GHz');
	}

	function getUniqueBands(bands: string[] | null): string[] {
		if (!bands || bands.length === 0) return [];
		// Get unique formatted bands and sort them
		const formatted = [...new Set(bands.map(formatBand))];
		formatted.sort((a, b) => {
			const order = ['2.4 GHz', '5 GHz', '5 GHz Low', '5 GHz High', '6 GHz'];
			return order.indexOf(a) - order.indexOf(b);
		});
		return formatted;
	}

	function formatPortSpeed(speed: string | null): string {
		if (!speed) return '';
		// Handle formats like "P10000" (10 Gbps), "P1000" (1 Gbps), "P100" (100 Mbps)
		const match = speed.match(/P(\d+)/);
		if (match) {
			const mbps = parseInt(match[1], 10);
			if (mbps >= 10000) return `${mbps / 1000} Gbps`;
			if (mbps >= 1000) return `${mbps / 1000} Gbps`;
			return `${mbps} Mbps`;
		}
		// Handle other formats
		if (speed.includes('Gbps') || speed.includes('Mbps')) return speed;
		return speed;
	}
</script>

<svelte:head>
	<title>{eero?.location || eero?.model || 'Eero'} | Eero Dashboard</title>
</svelte:head>

<div class="eero-detail-page">
	<!-- Back navigation -->
	<nav class="breadcrumb">
		<a href="/eeros" class="back-link">← Back to Eeros</a>
	</nav>

	{#if loading}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading eero details...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" on:click={() => fetchEero(true)}> Try Again </button>
				<button class="btn btn-ghost" on:click={() => goto('/eeros')}> Back to Eeros </button>
			</div>
		</div>
	{:else if eero}
		<!-- Header -->
		<header class="detail-header">
			<div class="header-info">
				<div class="header-title">
					<span class="status-dot large" class:online={eero.status === 'green'}></span>
					<h1>{eero.location || eero.model || 'Unknown'}</h1>
					{#if eero.is_gateway}
						<span class="badge badge-info">Gateway</span>
					{/if}
				</div>
				<div class="header-meta">
					<StatusBadge status={eero.status || 'unknown'} />
					<span class="text-muted">•</span>
					<span class="text-muted">{eero.model || 'Unknown Model'}</span>
				</div>
			</div>
			<div class="header-actions">
				<button class="btn btn-secondary" on:click={() => fetchEero(true)} disabled={actionLoading}>
					↻ Refresh
				</button>
			</div>
		</header>

		<!-- Main content grid -->
		<div class="detail-grid">
			<!-- Status Card -->
			<section class="card detail-card">
				<h2>Status</h2>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">Status</span>
						<span class="info-value">
							<StatusBadge status={eero.status || 'unknown'} />
						</span>
					</div>
					<div class="info-item">
						<span class="info-label">Connection</span>
						<span class="info-value"
							>{eero.wired ? '🔌 Wired' : '📶 Wireless'}{eero.connection_type
								? ` (${eero.connection_type})`
								: ''}</span
						>
					</div>
					{#if !eero.is_gateway && eero.mesh_quality_bars != null}
						<div class="info-item">
							<span class="info-label">Mesh Quality</span>
							<span class="info-value mesh-quality mono">
								{getMeshQualityBars(eero.mesh_quality_bars)}
								<span class="text-muted">({eero.mesh_quality_bars}/5)</span>
							</span>
						</div>
					{/if}
					<div class="info-item">
						<span class="info-label">Heartbeat</span>
						<span class="info-value">
							{#if eero.heartbeat_ok === true}
								<span class="text-success">✓ OK</span>
							{:else if eero.heartbeat_ok === false}
								<span class="text-danger">✗ Failed</span>
							{:else}
								—
							{/if}
						</span>
					</div>
					{#if eero.update_available}
						<div class="info-item">
							<span class="info-label">Update</span>
							<span class="info-value text-warning">⬆️ Update available</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- Clients Card -->
			<section class="card detail-card">
				<h2>Connected Clients</h2>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">Total Clients</span>
						<span class="info-value">{eero.connected_clients_count ?? 0}</span>
					</div>
					{#if eero.connected_wireless_clients_count !== null}
						<div class="info-item">
							<span class="info-label">📶 Wireless</span>
							<span class="info-value">{eero.connected_wireless_clients_count}</span>
						</div>
					{/if}
					{#if eero.connected_wired_clients_count !== null}
						<div class="info-item">
							<span class="info-label">🔌 Wired</span>
							<span class="info-value">{eero.connected_wired_clients_count}</span>
						</div>
					{/if}
					{#if eero.provides_wifi !== null}
						<div class="info-item">
							<span class="info-label">Provides WiFi</span>
							<span class="info-value">{eero.provides_wifi ? '✓ Yes' : '✗ No'}</span>
						</div>
					{/if}
					{#if eero.bands && eero.bands.length > 0}
						<div class="info-item info-item-vertical">
							<span class="info-label">WiFi Bands</span>
							<div class="chip-list">
								{#each getUniqueBands(eero.bands) as band}
									<span class="chip">{band}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- Network Card -->
			<section class="card detail-card">
				<h2>Network</h2>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">IP Address</span>
						<span class="info-value mono">{eero.ip_address || '—'}</span>
					</div>
					<div class="info-item">
						<span class="info-label">MAC Address</span>
						<span class="info-value mono">{eero.mac_address || '—'}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Serial Number</span>
						<span class="info-value mono">{eero.serial || '—'}</span>
					</div>
					{#if eero.ethernet_addresses && eero.ethernet_addresses.length > 1}
						<div class="info-item info-item-vertical">
							<span class="info-label">Other MACs</span>
							<div class="chip-list">
								{#each eero.ethernet_addresses.slice(1) as mac}
									<span class="chip mono">{mac}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- Hardware Card -->
			<section class="card detail-card">
				<h2>Hardware</h2>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">Model</span>
						<span class="info-value">{eero.model || '—'}</span>
					</div>
					{#if eero.model_number}
						<div class="info-item">
							<span class="info-label">Model Number</span>
							<span class="info-value mono">{eero.model_number}</span>
						</div>
					{/if}
					<div class="info-item">
						<span class="info-label">Firmware</span>
						<span class="info-value mono">{eero.firmware_version || eero.os_version || '—'}</span>
					</div>
					<div class="info-item">
						<span class="info-label">LED Status</span>
						<span class="info-value">
							{eero.led_on ? '💡 On' : '🌑 Off'}
							{#if eero.led_brightness !== null}
								<span class="text-muted">({eero.led_brightness}%)</span>
							{/if}
						</span>
					</div>
				</div>
			</section>

			<!-- Performance Card -->
			<section class="card detail-card">
				<h2>Performance</h2>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">Uptime</span>
						<span class="info-value">{formatUptime(eero.uptime)}</span>
					</div>
					{#if eero.cpu_usage !== null}
						<div class="info-item">
							<span class="info-label">CPU Usage</span>
							<span class="info-value">
								<span class="progress-bar">
									<span class="progress-fill" style="width: {eero.cpu_usage}%"></span>
								</span>
								<span class="mono">{formatPercentage(eero.cpu_usage)}</span>
							</span>
						</div>
					{/if}
					{#if eero.memory_usage !== null}
						<div class="info-item">
							<span class="info-label">Memory Usage</span>
							<span class="info-value">
								<span class="progress-bar">
									<span class="progress-fill" style="width: {eero.memory_usage}%"></span>
								</span>
								<span class="mono">{formatPercentage(eero.memory_usage)}</span>
							</span>
						</div>
					{/if}
					{#if eero.temperature !== null}
						<div class="info-item">
							<span class="info-label">Temperature</span>
							<span class="info-value">{formatTemperature(eero.temperature)}</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- Timestamps Card -->
			<section class="card detail-card">
				<h2>History</h2>
				<div class="info-grid">
					{#if eero.last_heartbeat}
						<div class="info-item">
							<span class="info-label">Last Heartbeat</span>
							<span class="info-value"
								><span class="chip">{formatDate(eero.last_heartbeat)}</span></span
							>
						</div>
					{/if}
					{#if eero.last_reboot}
						<div class="info-item">
							<span class="info-label">Last Reboot</span>
							<span class="info-value"
								><span class="chip">{formatDate(eero.last_reboot)}</span></span
							>
						</div>
					{/if}
					{#if eero.joined}
						<div class="info-item">
							<span class="info-label">Joined Network</span>
							<span class="info-value"><span class="chip">{formatDate(eero.joined)}</span></span>
						</div>
					{/if}
				</div>
			</section>

			<!-- System & ISP Card -->
			<section class="card detail-card">
				<h2>System</h2>
				<div class="info-grid">
					{#if eero.state}
						<div class="info-item">
							<span class="info-label">State</span>
							<span class="info-value">
								<span class="chip" class:online-chip={eero.state === 'ONLINE'}>{eero.state}</span>
							</span>
						</div>
					{/if}
					{#if eero.network_name}
						<div class="info-item">
							<span class="info-label">Network</span>
							<span class="info-value">{eero.network_name}</span>
						</div>
					{/if}
					{#if eero.organization_name}
						<div class="info-item">
							<span class="info-label">ISP</span>
							<span class="info-value">{eero.organization_name}</span>
						</div>
					{/if}
					{#if eero.power_source}
						<div class="info-item">
							<span class="info-label">Power Source</span>
							<span class="info-value">{eero.power_source}</span>
						</div>
					{/if}
					{#if eero.power_saving_active !== null}
						<div class="info-item">
							<span class="info-label">Power Saving</span>
							<span class="info-value">{eero.power_saving_active ? '✓ Active' : 'Off'}</span>
						</div>
					{/if}
					{#if eero.auto_provisioned !== null}
						<div class="info-item">
							<span class="info-label">Auto Provisioned</span>
							<span class="info-value">{eero.auto_provisioned ? '✓ Yes' : 'No'}</span>
						</div>
					{/if}
					{#if eero.retrograde_capable !== null}
						<div class="info-item">
							<span class="info-label">Retrograde Capable</span>
							<span class="info-value">{eero.retrograde_capable ? '✓ Yes' : 'No'}</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- WiFi BSSIDs Card -->
			{#if eero.bssids_with_bands && eero.bssids_with_bands.length > 0}
				<section class="card detail-card">
					<h2>WiFi Radios</h2>
					<div class="bssid-list">
						{#each eero.bssids_with_bands as bssid}
							<div class="bssid-item">
								<span class="band-label">{formatBand(bssid.band)}</span>
								<span class="chip mono">{bssid.ethernet_address}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- IPv6 Addresses Card -->
			{#if eero.ipv6_addresses && eero.ipv6_addresses.length > 0}
				<section class="card detail-card">
					<h2>IPv6 Addresses</h2>
					<div class="ipv6-list">
						{#each eero.ipv6_addresses as addr}
							<div class="ipv6-item">
								<div class="ipv6-header">
									<span class="ipv6-interface">{addr.interface || '—'}</span>
									{#if addr.scope}
										<span class="chip chip-sm chip-muted">{addr.scope}</span>
									{/if}
								</div>
								<div class="ipv6-addr-row">
									<span class="mono text-sm ipv6-address">{addr.address}</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Ethernet Ports Card -->
			{#if eero.ethernet_ports && eero.ethernet_ports.length > 0}
				<section class="card detail-card wide-card">
					<h2>Ethernet Ports</h2>
					<div class="ports-grid">
						{#each eero.ethernet_ports as port, i}
							<div class="port-card" class:has-carrier={port.has_carrier}>
								<div class="port-header">
									<span class="port-name">{port.port_name || `Port ${i + 1}`}</span>
									{#if port.is_wan_port}
										<span class="badge badge-info">WAN</span>
									{/if}
									{#if port.is_lte}
										<span class="badge badge-warning">LTE</span>
									{/if}
								</div>
								<span class="port-status">
									{#if port.has_carrier}
										<span class="text-success">●</span> Connected {#if port.speed}<span
												class="port-speed-badge">{formatPortSpeed(port.speed)}</span
											>{/if}
									{:else}
										<span class="text-muted">○ No link</span>
									{/if}
								</span>
								{#if port.neighbor_location}
									<div class="port-neighbor text-sm text-muted">
										→ {port.neighbor_location}{port.neighbor_port ? ` (${port.neighbor_port})` : ''}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Actions Card -->
			<section class="card detail-card actions-card">
				<h2>Actions</h2>
				<div class="action-buttons">
					<button class="btn btn-secondary" on:click={handleToggleLed} disabled={actionLoading}>
						{#if actionLoading}
							<span class="loading-spinner"></span>
						{/if}
						{eero.led_on ? '🌑 Turn LED Off' : '💡 Turn LED On'}
					</button>
					<button class="btn btn-danger" on:click={handleReboot} disabled={actionLoading}>
						{#if actionLoading}
							<span class="loading-spinner"></span>
						{/if}
						🔄 Reboot Eero
					</button>
				</div>
				<p class="action-warning text-muted text-sm">
					⚠️ Rebooting will temporarily disconnect all devices connected to this node.
				</p>
			</section>
		</div>
	{/if}
</div>

<style>
	.eero-detail-page {
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

	.header-title h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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

	.detail-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.info-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.info-value {
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.mesh-quality {
		color: var(--color-success);
		letter-spacing: 0.1em;
	}

	.info-item-vertical {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		background-color: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
	}

	.online-chip {
		background-color: rgba(34, 197, 94, 0.15);
		color: var(--color-success);
	}

	.bssid-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.bssid-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.band-label {
		font-weight: 500;
	}

	.ipv6-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.ipv6-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.ipv6-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.ipv6-interface {
		font-weight: 500;
	}

	.ipv6-addr-row {
		padding-left: var(--space-3);
	}

	.ipv6-address {
		word-break: break-all;
		color: var(--color-text-secondary);
	}

	.chip-sm {
		padding: 1px 6px;
		font-size: 0.6875rem;
	}

	.chip-muted {
		background-color: var(--color-bg-secondary);
		color: var(--color-text-muted);
	}

	.text-xs {
		font-size: 0.75rem;
	}

	.actions-card {
		grid-column: 1 / -1;
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.action-buttons {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.action-warning {
		margin: 0;
	}

	/* Progress bars for CPU/Memory */
	.progress-bar {
		width: 60px;
		height: 6px;
		background-color: var(--color-bg-tertiary);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background-color: var(--color-accent);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	/* Ethernet ports grid */
	.ports-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	.port-card {
		background-color: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		transition: all var(--transition-fast);
	}

	.port-card.has-carrier {
		border-color: var(--color-success);
		background-color: rgba(16, 185, 129, 0.05);
	}

	.port-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.port-name {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.port-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
		flex-wrap: nowrap;
		white-space: nowrap;
	}

	.port-speed-badge {
		display: inline-block;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		background-color: var(--color-bg-primary);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		margin-left: 4px;
		vertical-align: middle;
	}

	.port-neighbor {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	.text-warning {
		color: var(--color-warning, #f59e0b);
	}

	@media (max-width: 768px) {
		.detail-header {
			flex-direction: column;
			gap: var(--space-4);
		}

		.header-actions {
			width: 100%;
		}

		.header-actions .btn {
			width: 100%;
		}

		.action-buttons {
			flex-direction: column;
		}

		.ports-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
