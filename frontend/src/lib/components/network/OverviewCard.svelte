<!--
  OverviewCard

  Network detail "Overview", "Connection" and "Technical" sections. Extracted from
  routes/network/[id]/+page.svelte (WP5 decomposition). Uses the shared InfoRow primitive in
  place of the bespoke `dt`/`dd` `.info-row` markup that was duplicated across this file,
  devices/[id] and profiles/[id].
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		network: NetworkDetail;
		networkId: string;
	}

	let { network, networkId }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}

	function formatSimpleValue(value: string): string {
		if (!value) return '—';
		const lower = value.toLowerCase();
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
		return value.charAt(0).toUpperCase() + value.slice(1);
	}
</script>

<section class="card info-card">
	<h2>Overview</h2>
	<div class="info-list">
		<InfoRow label="Name" value={network.name} />
		<div class="badge-row">
			<span class="badge-row-label">Status</span>
			<StatusBadge status={network.status === 'online' ? 'connected' : 'disconnected'} />
		</div>
		<InfoRow label="Owner" value={network.owner || '—'} />
		{#if network.network_customer_type}
			<InfoRow label="Type" value={network.network_customer_type} />
		{/if}
		{#if network.premium_status}
			<div class="badge-row">
				<span class="badge-row-label">Premium Status</span>
				<span class="badge badge-success">{network.premium_status}</span>
			</div>
		{/if}
		{#if network.created_at}
			<InfoRow label="Created" value={formatDate(network.created_at)} />
		{/if}
	</div>
</section>

<section class="card info-card">
	<h2>Connection</h2>
	<div class="info-list">
		<InfoRow label="Public IP" value={network.public_ip || '—'} mono />
		<InfoRow label="Gateway IP" value={network.gateway_ip || '—'} mono />
		<InfoRow label="WAN Type" value={network.wan_type || '—'} />
		<InfoRow label="Gateway" value={formatSimpleValue(network.gateway || '')} />
		{#if network.ip_settings}
			<div class="badge-row">
				<span class="badge-row-label">Double NAT</span>
				<span class="badge {network.ip_settings.double_nat ? 'badge-warning' : 'badge-success'}">
					{network.ip_settings.double_nat ? 'Detected' : 'No'}
				</span>
			</div>
		{/if}
		<InfoRow label="ISP" value={network.isp_name || '—'} />
	</div>
</section>

<section class="card info-card wide-card">
	<h2>Technical</h2>
	<div class="info-list technical-list">
		<InfoRow label="Network ID" value={networkId || '—'} mono />
	</div>
</section>

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

	.info-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.badge-row:last-child {
		border-bottom: none;
	}

	.badge-row-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.technical-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-2) var(--space-6);
	}
</style>
