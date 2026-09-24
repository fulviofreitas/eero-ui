<!--
  DeviceIdentificationCard

  Device detail "Identification" and "Network" sections. Extracted from
  routes/devices/[id]/+page.svelte (WP5 decomposition). Uses the shared InfoRow primitive in
  place of the bespoke `dt`/`dd` `.info-row` markup duplicated across this file,
  network/[id] and profiles/[id].
-->
<script lang="ts">
	import type { DeviceDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';
	import { getDeviceTypeIcon } from '$lib/deviceIcons';

	interface Props {
		device: DeviceDetail;
	}

	let { device }: Props = $props();
</script>

<section class="card info-card">
	<h2>Identification</h2>
	<div class="info-list">
		<InfoRow label="Display Name" value={device.display_name || '—'} />
		<InfoRow label="Nickname" value={device.nickname || '—'} />
		<InfoRow label="Hostname" value={device.hostname || '—'} mono />
		<InfoRow label="Manufacturer" value={device.manufacturer || '—'} />
		<InfoRow label="Model" value={device.model_name || '—'} />
		<div class="badge-row">
			<span class="badge-row-label">Device Type</span>
			<span class="badge-row-value">
				{#if device.device_type}
					<span class="device-type-badge">
						<Icon name={getDeviceTypeIcon(device.device_type, device.wireless)} size={14} />
						{device.device_type}
					</span>
				{:else}
					—
				{/if}
			</span>
		</div>
	</div>
</section>

<section class="card info-card">
	<h2>Network</h2>
	<div class="info-list">
		<InfoRow label="IP Address" value={device.ip || '—'} mono />
		<InfoRow label="IPv4" value={device.ipv4 || '—'} mono />
		{#if device.ips && device.ips.length > 1}
			<InfoRow label="All IPs" value={device.ips.join(', ')} mono />
		{/if}
		<InfoRow label="MAC Address" value={device.mac || '—'} mono />
		<InfoRow label="Subnet" value={device.subnet_kind || '—'} />
	</div>
</section>

<style>
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
		display: flex;
		flex-direction: column;
	}

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
	}

	.badge-row-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.device-type-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
