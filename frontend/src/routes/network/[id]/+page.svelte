<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { NetworkDetail } from '$api/types';
	import { uiStore } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import SpeedtestChart from '$lib/components/charts/SpeedtestChart.svelte';

	let network: NetworkDetail | null = null;
	let loading = true;
	let error: string | null = null;
	let speedTestLoading = false;
	let guestToggleLoading = false;

	$: networkId = $page.params.id;

	onMount(() => {
		console.log('Network page mounted, ID:', networkId);
		fetchNetwork();
	});

	async function fetchNetwork(refresh = false) {
		console.log('Fetching network with ID:', networkId);

		if (!networkId) {
			console.error('Network ID is missing');
			error = 'Invalid network ID';
			loading = false;
			return;
		}

		loading = true;
		error = null;
		try {
			const result = await api.networks.get(networkId, refresh);
			console.log('Network detail result:', result);
			network = result;
		} catch (err) {
			console.error('Failed to load network:', err);
			error = err instanceof Error ? err.message : 'Failed to load network details';
		} finally {
			loading = false;
		}
	}

	async function handleSpeedTest() {
		if (!networkId) return;

		speedTestLoading = true;
		uiStore.info('Running speed test... This may take up to 60 seconds.');

		try {
			await api.networks.speedTest(networkId);
			uiStore.success('Speed test completed!');
			// Refresh network to get updated speed test data
			await fetchNetwork(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Speed test failed');
		} finally {
			speedTestLoading = false;
		}
	}

	async function handleToggleGuestNetwork() {
		if (!network || !networkId) return;

		const enabling = !network.guest_network_enabled;
		guestToggleLoading = true;

		try {
			await api.networks.toggleGuestNetwork(networkId, enabling);
			uiStore.success(`Guest network ${enabling ? 'enabled' : 'disabled'}.`);
			await fetchNetwork(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to toggle guest network');
		} finally {
			guestToggleLoading = false;
		}
	}

	function formatSpeed(mbps: number | null): string {
		if (mbps === null) return '—';
		return `${mbps.toFixed(1)} Mbps`;
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}

	function _getSettingValue(settings: Record<string, unknown> | null, key: string): string {
		if (!settings || settings[key] === undefined) return '—';
		const value = settings[key];
		if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	// Acronym mappings with correct capitalization
	const ACRONYM_MAP: Record<string, string> = {
		dns: 'DNS',
		upnp: 'UPnP',
		ipv6: 'IPv6',
		ipv4: 'IPv4',
		wpa3: 'WPA3',
		wpa2: 'WPA2',
		wpa: 'WPA',
		wan: 'WAN',
		lan: 'LAN',
		nat: 'NAT',
		dhcp: 'DHCP',
		ssid: 'SSID',
		ip: 'IP',
		isp: 'ISP',
		sqm: 'SQM',
		vpn: 'VPN',
		ddns: 'DDNS',
		https: 'HTTPS',
		http: 'HTTP',
		udp: 'UDP',
		tcp: 'TCP',
		iot: 'IoT',
		qos: 'QoS',
		pppoe: 'PPPoE',
		vlan: 'VLAN',
		mac: 'MAC',
		id: 'ID'
	};

	function formatLabel(key: string): string {
		// Replace underscores with spaces
		let label = key.replace(/_/g, ' ');

		// Capitalize each word, using acronym map for known acronyms
		label = label
			.split(' ')
			.map((word) => {
				const lower = word.toLowerCase();
				if (ACRONYM_MAP[lower]) {
					return ACRONYM_MAP[lower];
				}
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join(' ');

		return label;
	}

	function formatHealthObject(obj: unknown): { entries: [string, unknown][]; isSimple: boolean } {
		if (obj === null || obj === undefined) return { entries: [], isSimple: true };
		if (typeof obj !== 'object') return { entries: [['value', obj]], isSimple: true };

		const entries = Object.entries(obj as Record<string, unknown>);
		return { entries, isSimple: entries.length <= 2 };
	}

	function formatValue(val: unknown): string {
		if (val === null || val === undefined) return '—';
		if (typeof val === 'boolean') return val ? 'Yes' : 'No';
		if (typeof val === 'object') return JSON.stringify(val);
		return String(val);
	}

	function getHealthStatus(value: unknown): 'good' | 'warning' | 'bad' | 'neutral' {
		if (typeof value === 'boolean') return value ? 'good' : 'bad';
		if (typeof value === 'string') {
			const lower = value.toLowerCase();
			if (
				['connected', 'online', 'up', 'ok', 'good', 'active', 'enabled', 'true'].some((s) =>
					lower.includes(s)
				)
			)
				return 'good';
			if (
				['disconnected', 'offline', 'down', 'error', 'failed', 'disabled', 'false'].some((s) =>
					lower.includes(s)
				)
			)
				return 'bad';
			if (['warning', 'degraded', 'slow', 'limited'].some((s) => lower.includes(s)))
				return 'warning';
		}
		return 'neutral';
	}

	function getStatusIcon(status: 'good' | 'warning' | 'bad' | 'neutral'): string {
		switch (status) {
			case 'good':
				return '●';
			case 'warning':
				return '◐';
			case 'bad':
				return '○';
			default:
				return '◌';
		}
	}

	// Format simple values with proper capitalization
	function formatSimpleValue(value: string): string {
		if (!value) return '—';
		const lower = value.toLowerCase();
		// Check acronym map first
		if (ACRONYM_MAP[lower]) return ACRONYM_MAP[lower];
		// Known compound names
		const knownValues: Record<string, string> = {
			dnsfilter: 'DNSFilter',
			cloudflare: 'Cloudflare',
			opendns: 'OpenDNS',
			nextdns: 'NextDNS',
			automatic: 'Automatic',
			manual: 'Manual',
			custom: 'Custom',
			disabled: 'Disabled',
			enabled: 'Enabled'
		};
		if (knownValues[lower]) return knownValues[lower];
		// Default: capitalize first letter
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	// Get current time in a specific timezone
	function getLocalTime(timezone: string): string {
		try {
			return new Date().toLocaleString('en-US', {
				timeZone: timezone,
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return '—';
		}
	}
</script>

<svelte:head>
	<title>{network?.name || 'Network'} | Eero Dashboard</title>
</svelte:head>

<div class="network-detail-page">
	<header class="page-header">
		<h1>Network</h1>
		<p class="text-muted">View and manage your network settings</p>
	</header>

	{#if loading}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading network details...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" on:click={() => fetchNetwork(true)}> Try Again </button>
				<button class="btn btn-ghost" on:click={() => goto('/')}> Back to Dashboard </button>
			</div>
		</div>
	{:else if !network}
		<div class="empty-state">
			<p>No network data available.</p>
			<div class="error-actions">
				<button class="btn btn-secondary" on:click={() => fetchNetwork(true)}> Try Again </button>
				<button class="btn btn-ghost" on:click={() => goto('/')}> Back to Dashboard </button>
			</div>
		</div>
	{:else}
		<!-- Header -->
		<header class="detail-header">
			<div class="header-info">
				<div class="header-title">
					<span class="network-icon">🌐</span>
					<div>
						<h1>{network.name}</h1>
						{#if network.isp_name}
							<span class="text-muted">{network.isp_name}</span>
						{/if}
					</div>
				</div>
				<div class="header-meta">
					<StatusBadge status={network.status === 'online' ? 'connected' : 'disconnected'} />
					{#if network.public_ip}
						<span class="text-muted">•</span>
						<span class="mono text-muted">{network.public_ip}</span>
					{/if}
				</div>
			</div>
			<div class="header-actions">
				<button class="btn btn-secondary" on:click={() => fetchNetwork(true)} disabled={loading}>
					↻ Refresh
				</button>
			</div>
		</header>

		<!-- Info Grid -->
		<div class="info-grid">
			<!-- Overview -->
			<section class="card info-card">
				<h2>Overview</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Name</dt>
						<dd>{network.name}</dd>
					</div>
					<div class="info-row">
						<dt>Status</dt>
						<dd>
							<StatusBadge status={network.status === 'online' ? 'connected' : 'disconnected'} />
						</dd>
					</div>
					<div class="info-row">
						<dt>Owner</dt>
						<dd>{network.owner || '—'}</dd>
					</div>
					{#if network.network_customer_type}
						<div class="info-row">
							<dt>Type</dt>
							<dd>{network.network_customer_type}</dd>
						</div>
					{/if}
					{#if network.premium_status}
						<div class="info-row">
							<dt>Premium Status</dt>
							<dd>
								<span class="badge badge-success">{network.premium_status}</span>
							</dd>
						</div>
					{/if}
					{#if network.created_at}
						<div class="info-row">
							<dt>Created</dt>
							<dd>{formatDate(network.created_at)}</dd>
						</div>
					{/if}
				</dl>
			</section>

			<!-- Connection -->
			<section class="card info-card">
				<h2>Connection</h2>
				<dl class="info-list">
					<div class="info-row">
						<dt>Public IP</dt>
						<dd class="mono">{network.public_ip || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Gateway IP</dt>
						<dd class="mono">{network.gateway_ip || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>WAN Type</dt>
						<dd>{network.wan_type || '—'}</dd>
					</div>
					<div class="info-row">
						<dt>Gateway</dt>
						<dd>{formatSimpleValue(network.gateway || '')}</dd>
					</div>
					{#if network.ip_settings}
						<div class="info-row">
							<dt>Double NAT</dt>
							<dd>
								<span
									class="badge {network.ip_settings.double_nat ? 'badge-warning' : 'badge-success'}"
								>
									{network.ip_settings.double_nat ? 'Detected' : 'No'}
								</span>
							</dd>
						</div>
					{/if}
					<div class="info-row">
						<dt>ISP</dt>
						<dd>{network.isp_name || '—'}</dd>
					</div>
				</dl>
			</section>

			<!-- Devices & Eeros -->
			<section class="card info-card">
				<h2>Connected Hardware</h2>
				<div class="hardware-stats">
					<a href="/devices" class="hardware-stat clickable">
						<span class="stat-icon">📱</span>
						<span class="stat-number">{network.device_count}</span>
						<span class="stat-label">Devices</span>
					</a>
					<a href="/eeros" class="hardware-stat clickable">
						<span class="stat-icon">📡</span>
						<span class="stat-number">{network.eero_count}</span>
						<span class="stat-label">Eero Nodes</span>
					</a>
				</div>
			</section>

			<!-- Guest Network -->
			<section class="card info-card">
				<h2>Guest Network</h2>
				<div class="guest-network-section">
					<div class="guest-status">
						<span class="guest-icon">{network.guest_network_enabled ? '✅' : '❌'}</span>
						<span class="guest-label">
							{network.guest_network_enabled ? 'Enabled' : 'Disabled'}
						</span>
					</div>
					<button
						class="btn {network.guest_network_enabled ? 'btn-secondary' : 'btn-primary'}"
						on:click={handleToggleGuestNetwork}
						disabled={guestToggleLoading}
					>
						{#if guestToggleLoading}
							<span class="loading-spinner"></span>
						{/if}
						{network.guest_network_enabled ? 'Disable' : 'Enable'} Guest Network
					</button>
				</div>
			</section>

			<!-- Speed Test -->
			<section class="card info-card speed-test-card">
				<div class="card-header-flex">
					<h2>Speed Test</h2>
					<button
						class="btn btn-primary btn-sm"
						on:click={handleSpeedTest}
						disabled={speedTestLoading}
					>
						{#if speedTestLoading}
							<span class="loading-spinner"></span>
							Running...
						{:else}
							▶ Run Test
						{/if}
					</button>
				</div>

				{#if network.speed_test && (network.speed_test.download_mbps || network.speed_test.upload_mbps || network.speed_test.down?.value || network.speed_test.up?.value)}
					<div class="speed-results">
						<div class="speed-item download">
							<div class="speed-icon">↓</div>
							<div class="speed-data">
								<span class="speed-value">
									{formatSpeed(
										network.speed_test.down?.value ?? network.speed_test.download_mbps ?? null
									)}
								</span>
								<span class="speed-label">Download</span>
							</div>
						</div>
						<div class="speed-item upload">
							<div class="speed-icon">↑</div>
							<div class="speed-data">
								<span class="speed-value">
									{formatSpeed(
										network.speed_test.up?.value ?? network.speed_test.upload_mbps ?? null
									)}
								</span>
								<span class="speed-label">Upload</span>
							</div>
						</div>
					</div>
					{#if network.speed_test.date || network.speed_test.timestamp}
						<p class="text-muted text-sm speed-timestamp">
							Last tested: {formatDate(
								network.speed_test.date ?? network.speed_test.timestamp ?? null
							)}
						</p>
					{/if}
				{:else}
					<p class="text-muted text-sm">
						No speed test data available. Run a test to measure your network speed.
					</p>
				{/if}
			</section>

			<!-- Health -->
			{#if network.health && Object.keys(network.health).length > 0}
				<section class="card info-card health-section">
					<h2>Network Health</h2>
					<div class="health-grid">
						{#each Object.entries(network.health) as [key, value]}
							{@const status = getHealthStatus(value)}
							{#if typeof value === 'boolean'}
								<!-- Boolean: Simple status tile -->
								<div class="health-tile" class:status-good={value} class:status-bad={!value}>
									<div class="health-tile-icon">
										<span class="status-ring {status}">{getStatusIcon(status)}</span>
									</div>
									<div class="health-tile-content">
										<span class="health-tile-label">{formatLabel(key)}</span>
										<span class="health-tile-status {status}">{value ? 'Active' : 'Inactive'}</span>
									</div>
								</div>
							{:else if typeof value === 'object' && value !== null}
								<!-- Object: Expandable details tile -->
								{@const parsed = formatHealthObject(value)}
								<div class="health-tile health-tile-complex">
									<div class="health-tile-header">
										<span class="health-tile-label">{formatLabel(key)}</span>
									</div>
									<div class="health-tile-details">
										{#each parsed.entries as [subKey, subVal]}
											{@const subStatus = getHealthStatus(subVal)}
											<div class="health-detail-row">
												<span class="detail-key">{formatLabel(subKey)}</span>
												<span class="detail-value {subStatus}">
													<span class="detail-dot {subStatus}"></span>
													{formatValue(subVal)}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{:else if value !== null && value !== undefined}
								<!-- Simple value tile -->
								{@const valStatus = getHealthStatus(value)}
								<div class="health-tile">
									<div class="health-tile-icon">
										<span class="status-ring {valStatus}">{getStatusIcon(valStatus)}</span>
									</div>
									<div class="health-tile-content">
										<span class="health-tile-label">{formatLabel(key)}</span>
										<span class="health-tile-status {valStatus}">{value}</span>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</section>
			{/if}

			<!-- Features -->
			<section class="card info-card">
				<h2>Features</h2>
				<div class="feature-grid">
					<div class="feature-item" class:enabled={network.upnp}>
						<span class="feature-icon">{network.upnp ? '●' : '○'}</span>
						<span class="feature-label">UPnP</span>
					</div>
					<div class="feature-item" class:enabled={network.wpa3}>
						<span class="feature-icon">{network.wpa3 ? '●' : '○'}</span>
						<span class="feature-label">WPA3</span>
					</div>
					<div class="feature-item" class:enabled={network.ipv6_upstream}>
						<span class="feature-icon">{network.ipv6_upstream ? '●' : '○'}</span>
						<span class="feature-label">IPv6</span>
					</div>
					<div class="feature-item" class:enabled={network.sqm}>
						<span class="feature-icon">{network.sqm ? '●' : '○'}</span>
						<span class="feature-label">SQM</span>
					</div>
					<div class="feature-item" class:enabled={network.band_steering}>
						<span class="feature-icon">{network.band_steering ? '●' : '○'}</span>
						<span class="feature-label">Band Steering</span>
					</div>
					<div class="feature-item" class:enabled={network.thread}>
						<span class="feature-icon">{network.thread ? '●' : '○'}</span>
						<span class="feature-label">Thread</span>
					</div>
					<div class="feature-item" class:enabled={network.backup_internet_enabled}>
						<span class="feature-icon">{network.backup_internet_enabled ? '●' : '○'}</span>
						<span class="feature-label">Backup Internet</span>
					</div>
					<div class="feature-item" class:enabled={network.power_saving}>
						<span class="feature-icon">{network.power_saving ? '●' : '○'}</span>
						<span class="feature-label">Power Saving</span>
					</div>
				</div>
			</section>

			<!-- Location -->
			{#if network.geo_ip}
				<section class="card info-card">
					<h2>Location</h2>
					<div class="location-display">
						<div class="location-main">
							<span class="location-city">{network.geo_ip.city}</span>
							<span class="location-region"
								>{network.geo_ip.region}, {network.geo_ip.countryCode}</span
							>
						</div>
						<div class="location-time">
							<span class="time-icon">🕐</span>
							<span class="local-time">{getLocalTime(network.geo_ip.timezone)}</span>
						</div>
						<div class="location-details">
							<span class="mono text-sm text-muted">{network.geo_ip.timezone}</span>
						</div>
					</div>
				</section>
			{/if}

			<!-- DNS -->
			{#if network.dns}
				<section class="card info-card">
					<h2>DNS Configuration</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>Mode</dt>
							<dd>
								<span class="badge badge-info">{formatSimpleValue(network.dns.mode)}</span>
							</dd>
						</div>
						<div class="info-row">
							<dt>Caching</dt>
							<dd>
								<span class="badge {network.dns.caching ? 'badge-success' : 'badge-neutral'}">
									{network.dns.caching ? 'Enabled' : 'Disabled'}
								</span>
							</dd>
						</div>
						{#if network.dns.parent?.ips}
							<div class="info-row">
								<dt>Upstream DNS</dt>
								<dd class="mono text-sm">{network.dns.parent.ips.join(', ')}</dd>
							</div>
						{/if}
						{#if network.dns.custom?.ips}
							<div class="info-row">
								<dt>Custom DNS</dt>
								<dd class="mono text-sm">{network.dns.custom.ips.join(', ')}</dd>
							</div>
						{/if}
					</dl>
				</section>
			{/if}

			<!-- Premium DNS -->
			{#if network.premium_dns}
				<section class="card info-card">
					<h2>Security & Filtering</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>DNS Provider</dt>
							<dd>{formatSimpleValue(network.premium_dns.dns_provider || '')}</dd>
						</div>
						<div class="info-row">
							<dt>Policies</dt>
							<dd>
								<span
									class="badge {network.premium_dns.dns_policies_enabled
										? 'badge-success'
										: 'badge-neutral'}"
								>
									{network.premium_dns.dns_policies_enabled ? 'Enabled' : 'Disabled'}
								</span>
							</dd>
						</div>
						{#if network.premium_dns.dns_policies}
							<div class="info-row">
								<dt>Block Malware</dt>
								<dd>
									<span
										class="badge {network.premium_dns.dns_policies.block_malware
											? 'badge-success'
											: 'badge-neutral'}"
									>
										{network.premium_dns.dns_policies.block_malware ? 'Enabled' : 'Disabled'}
									</span>
								</dd>
							</div>
							<div class="info-row">
								<dt>Ad Blocking</dt>
								<dd>
									<span
										class="badge {network.premium_dns.dns_policies.ad_block
											? 'badge-success'
											: 'badge-neutral'}"
									>
										{network.premium_dns.dns_policies.ad_block ? 'Enabled' : 'Disabled'}
									</span>
								</dd>
							</div>
						{/if}
					</dl>
				</section>
			{/if}

			<!-- DHCP -->
			{#if network.dhcp}
				<section class="card info-card">
					<h2>DHCP</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>Range</dt>
							<dd class="mono">{network.dhcp.starting_address} - {network.dhcp.ending_address}</dd>
						</div>
						<div class="info-row">
							<dt>Subnet Mask</dt>
							<dd class="mono">{network.dhcp.subnet_mask}</dd>
						</div>
						<div class="info-row">
							<dt>Lease Time</dt>
							<dd>{Math.floor(network.dhcp.lease_time_seconds / 3600)} hours</dd>
						</div>
					</dl>
				</section>
			{/if}

			<!-- DDNS -->
			{#if network.ddns?.enabled}
				<section class="card info-card">
					<h2>Dynamic DNS</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>Status</dt>
							<dd>
								<span class="badge badge-success">Enabled</span>
							</dd>
						</div>
						<div class="info-row">
							<dt>Hostname</dt>
							<dd class="mono">{network.ddns.subdomain}</dd>
						</div>
					</dl>
				</section>
			{/if}

			<!-- Updates -->
			{#if network.updates}
				<section class="card info-card">
					<h2>Firmware</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>Current Version</dt>
							<dd class="mono">{network.updates.target_firmware || '—'}</dd>
						</div>
						<div class="info-row">
							<dt>Update Available</dt>
							<dd>
								<span
									class="badge {network.updates.has_update ? 'badge-warning' : 'badge-success'}"
								>
									{network.updates.has_update ? 'Yes' : 'Up to date'}
								</span>
							</dd>
						</div>
						{#if network.updates.last_update_started}
							<div class="info-row">
								<dt>Last Update</dt>
								<dd>{formatDate(network.updates.last_update_started)}</dd>
							</div>
						{/if}
					</dl>
				</section>
			{/if}

			<!-- Integrations -->
			<section class="card info-card">
				<h2>Integrations</h2>
				<div class="feature-grid">
					<div class="feature-item" class:enabled={network.amazon_account_linked}>
						<span class="feature-icon">{network.amazon_account_linked ? '●' : '○'}</span>
						<span class="feature-label">Amazon</span>
					</div>
					<div class="feature-item" class:enabled={network.alexa_skill}>
						<span class="feature-icon">{network.alexa_skill ? '●' : '○'}</span>
						<span class="feature-label">Alexa</span>
					</div>
					{#if network.homekit}
						<div class="feature-item" class:enabled={network.homekit.enabled}>
							<span class="feature-icon">{network.homekit.enabled ? '●' : '○'}</span>
							<span class="feature-label">HomeKit</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- Premium -->
			{#if network.premium_details}
				<section class="card info-card premium-card">
					<h2>Subscription</h2>
					<div class="premium-display">
						<div class="premium-tier">
							<span class="tier-badge">{network.premium_details.tier || 'Free'}</span>
						</div>
						<dl class="info-list">
							{#if network.premium_details.payment_method}
								<div class="info-row">
									<dt>Payment</dt>
									<dd>{network.premium_details.payment_method.replace(/_/g, ' ')}</dd>
								</div>
							{/if}
							{#if network.premium_details.next_billing_event_date}
								<div class="info-row">
									<dt>Next Billing</dt>
									<dd>{formatDate(network.premium_details.next_billing_event_date)}</dd>
								</div>
							{/if}
						</dl>
					</div>
				</section>
			{/if}

			<!-- Last Reboot -->
			{#if network.last_reboot}
				<section class="card info-card">
					<h2>System</h2>
					<dl class="info-list">
						<div class="info-row">
							<dt>Last Reboot</dt>
							<dd>{formatDate(network.last_reboot)}</dd>
						</div>
					</dl>
				</section>
			{/if}

			<!-- Technical -->
			<section class="card info-card wide-card">
				<h2>Technical</h2>
				<dl class="info-list technical-list">
					<div class="info-row">
						<dt>Network ID</dt>
						<dd class="mono text-sm">{networkId || '—'}</dd>
					</div>
				</dl>
			</section>
		</div>

		<!-- Speedtest History Chart -->
		{#if networkId}
			<section class="network-charts">
				<SpeedtestChart {networkId} />
			</section>
		{/if}
	{/if}
</div>

<style>
	.network-detail-page {
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: var(--space-4);
	}

	.page-header h1 {
		margin-bottom: var(--space-1);
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
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		padding: var(--space-6);
		background-color: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.network-icon {
		font-size: 2rem;
	}

	.header-title h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: calc(2rem + var(--space-3));
	}

	.header-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: var(--space-4);
	}

	.info-card {
		display: flex;
		flex-direction: column;
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
	}

	.hardware-stats {
		display: flex;
		gap: var(--space-4);
	}

	.hardware-stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-4);
		background-color: var(--color-bg-primary);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		transition: all var(--transition-fast);
	}

	.hardware-stat.clickable:hover {
		background-color: var(--color-bg-tertiary);
		transform: translateY(-2px);
	}

	.stat-icon {
		font-size: 1.5rem;
		margin-bottom: var(--space-2);
	}

	.stat-number {
		font-size: 2rem;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.guest-network-section {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.guest-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.guest-icon {
		font-size: 1.5rem;
	}

	.guest-label {
		font-size: 1.125rem;
		font-weight: 500;
	}

	.speed-test-card {
		grid-column: span 2;
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.technical-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-2) var(--space-6);
	}

	.technical-list .info-row {
		border-bottom: none;
	}

	.card-header-flex {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.card-header-flex h2 {
		margin: 0;
		padding: 0;
		border: none;
	}

	.speed-results {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-4);
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

	.speed-item.download .speed-value {
		color: var(--color-success);
	}

	.speed-item.upload .speed-value {
		color: var(--color-accent);
	}

	.speed-timestamp {
		margin-top: var(--space-4);
		text-align: center;
	}

	/* Health Section Styles */
	.health-section {
		grid-column: span 2;
	}

	.health-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
	}

	.health-tile {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		background-color: var(--color-bg-primary);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border-muted);
		transition: all var(--transition-fast);
	}

	.health-tile:hover {
		border-color: var(--color-border);
		transform: translateY(-1px);
	}

	.health-tile.status-good {
		border-left: 3px solid var(--color-success);
	}

	.health-tile.status-bad {
		border-left: 3px solid var(--color-danger);
	}

	.health-tile-icon {
		flex-shrink: 0;
	}

	.status-ring {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.status-ring.good {
		background: rgba(16, 185, 129, 0.15);
		color: var(--color-success);
	}

	.status-ring.bad {
		background: rgba(239, 68, 68, 0.15);
		color: var(--color-danger);
	}

	.status-ring.warning {
		background: rgba(245, 158, 11, 0.15);
		color: var(--color-warning, #f59e0b);
	}

	.status-ring.neutral {
		background: var(--color-bg-tertiary);
		color: var(--color-text-muted);
	}

	.health-tile-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.health-tile-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-primary);
		line-height: 1.3;
	}

	.health-tile-status {
		font-size: 0.75rem;
		font-weight: 500;
	}

	.health-tile-status.good {
		color: var(--color-success);
	}

	.health-tile-status.bad {
		color: var(--color-danger);
	}

	.health-tile-status.warning {
		color: var(--color-warning, #f59e0b);
	}

	.health-tile-status.neutral {
		color: var(--color-text-secondary);
	}

	/* Complex tile with nested details */
	.health-tile-complex {
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
		border-left: 3px solid var(--color-accent);
	}

	.health-tile-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.health-tile-header .health-tile-label {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.health-tile-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.health-detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.detail-key {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.detail-value {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.detail-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.detail-dot.good {
		background: var(--color-success);
		box-shadow: 0 0 4px var(--color-success);
	}

	.detail-dot.bad {
		background: var(--color-danger);
		box-shadow: 0 0 4px var(--color-danger);
	}

	.detail-dot.warning {
		background: var(--color-warning, #f59e0b);
	}

	.detail-dot.neutral {
		background: var(--color-text-muted);
	}

	.detail-value.good {
		color: var(--color-success);
	}

	.detail-value.bad {
		color: var(--color-danger);
	}

	.detail-value.warning {
		color: var(--color-warning, #f59e0b);
	}

	.detail-value.neutral {
		color: var(--color-text-primary);
	}

	.settings-card {
		grid-column: span 2;
	}

	.settings-card .info-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: var(--space-2);
	}

	/* Feature Grid */
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: var(--space-3);
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--color-bg-tertiary);
		transition: all 0.15s ease;
	}

	.feature-item.enabled {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%);
	}

	.feature-icon {
		font-size: 0.625rem;
		color: var(--color-text-muted);
	}

	.feature-item.enabled .feature-icon {
		color: var(--color-success);
	}

	.feature-label {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.feature-item.enabled .feature-label {
		color: var(--color-text-primary);
	}

	/* Location Display */
	.location-display {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.location-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.location-city {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.location-region {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.location-time {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-md);
	}

	.time-icon {
		font-size: 1rem;
	}

	.local-time {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.location-details {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	/* Premium Display */
	.premium-display {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.premium-tier {
		display: flex;
		justify-content: center;
	}

	.tier-badge {
		display: inline-block;
		padding: var(--space-2) var(--space-4);
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: capitalize;
		color: #fbbf24;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: var(--radius-lg);
	}

	.premium-card {
		background: linear-gradient(
			135deg,
			var(--color-bg-secondary) 0%,
			rgba(251, 191, 36, 0.02) 100%
		);
	}

	/* Badge info variant */
	.badge-info {
		background: rgba(59, 130, 246, 0.1);
		color: #3b82f6;
		border: 1px solid rgba(59, 130, 246, 0.2);
	}

	/* Speedtest Chart Section */
	.network-charts {
		margin-top: var(--space-6);
	}

	@media (max-width: 768px) {
		.detail-header {
			flex-direction: column;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions button {
			flex: 1;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.speed-test-card,
		.settings-card,
		.health-section {
			grid-column: span 1;
		}

		.health-grid {
			grid-template-columns: 1fr;
		}

		.speed-results {
			grid-template-columns: 1fr 1fr;
		}

		.hardware-stats {
			flex-direction: column;
		}

		.guest-network-section {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
