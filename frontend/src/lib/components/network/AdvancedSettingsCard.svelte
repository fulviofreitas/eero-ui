<!--
  AdvancedSettingsCard

  Network detail "DHCP", "Dynamic DNS" and "Firmware" sections. Extracted from
  routes/network/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		network: NetworkDetail;
	}

	let { network }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}
</script>

{#if network.dhcp}
	<section class="card info-card">
		<h2>DHCP</h2>
		<div class="info-list">
			<InfoRow
				label="Range"
				value="{network.dhcp.starting_address} - {network.dhcp.ending_address}"
				mono
			/>
			<InfoRow label="Subnet Mask" value={network.dhcp.subnet_mask} mono />
			<InfoRow
				label="Lease Time"
				value="{Math.floor(network.dhcp.lease_time_seconds / 3600)} hours"
			/>
		</div>
	</section>
{/if}

{#if network.ddns?.enabled}
	<section class="card info-card">
		<h2>Dynamic DNS</h2>
		<div class="info-list">
			<div class="badge-row">
				<span class="badge-row-label">Status</span>
				<span class="badge badge-success">Enabled</span>
			</div>
			<InfoRow label="Hostname" value={network.ddns.subdomain} mono />
		</div>
	</section>
{/if}

{#if network.updates}
	<section class="card info-card">
		<h2>Firmware</h2>
		<div class="info-list">
			<InfoRow label="Current Version" value={network.updates.target_firmware || '—'} mono />
			<div class="badge-row">
				<span class="badge-row-label">Update Available</span>
				<span class="badge {network.updates.has_update ? 'badge-warning' : 'badge-success'}">
					{network.updates.has_update ? 'Yes' : 'Up to date'}
				</span>
			</div>
			{#if network.updates.last_update_started}
				<InfoRow label="Last Update" value={formatDate(network.updates.last_update_started)} />
			{/if}
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
</style>
