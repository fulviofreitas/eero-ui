<!--
  NetworkHealthCard

  Network detail "Network Health" section - renders the arbitrary `network.health` object
  returned by the API as status tiles. Extracted from routes/network/[id]/+page.svelte
  (WP5 decomposition), including its formatting helpers (acronym map, label/value/status
  inference), which are used nowhere else in the route.
-->
<script lang="ts">
	interface Props {
		health: Record<string, unknown>;
	}

	let { health }: Props = $props();

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
		let label = key.replace(/_/g, ' ');
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
</script>

{#if health && Object.keys(health).length > 0}
	<section class="card info-card health-section">
		<h2>Network Health</h2>
		<div class="health-grid">
			{#each Object.entries(health) as [key, value]}
				{@const status = getHealthStatus(value)}
				{#if typeof value === 'boolean'}
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

<style>
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
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast);
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
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.status-ring.bad {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.status-ring.warning {
		background: var(--color-warning-bg);
		color: var(--color-warning);
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
		color: var(--color-warning);
	}

	.health-tile-status.neutral {
		color: var(--color-text-secondary);
	}

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
		background: var(--color-warning);
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
		color: var(--color-warning);
	}

	.detail-value.neutral {
		color: var(--color-text-primary);
	}

	@media (max-width: 768px) {
		.health-section {
			grid-column: span 1;
		}

		.health-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
