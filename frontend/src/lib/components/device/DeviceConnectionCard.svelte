<!--
  DeviceConnectionCard

  Device detail "Connection" and "Transfer Rates" sections. Extracted from
  routes/devices/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { DeviceDetail } from '$api/types';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		device: DeviceDetail;
		statusLabel: string;
	}

	let { device, statusLabel }: Props = $props();

	function getSignalBars(bars: number | null): string {
		if (bars === null) return '━━━━';
		return '█'.repeat(Math.min(bars, 4)) + '░'.repeat(Math.max(0, 4 - bars));
	}
</script>

<section class="card info-card">
	<h2>Connection</h2>
	<div class="info-list">
		<div class="badge-row">
			<span class="badge-row-label">Status</span>
			<StatusBadge status={statusLabel} />
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Type</span>
			<span class="badge-row-value">
				<Icon name={device.wireless ? 'wifi' : 'ethernet'} size={14} />
				{device.wireless ? 'Wireless' : 'Wired'}
			</span>
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Connected To</span>
			<span class="badge-row-value">
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
			</span>
		</div>
		{#if device.wireless}
			<InfoRow label="SSID" value={device.ssid || '—'} />
			<div class="badge-row">
				<span class="badge-row-label">Frequency</span>
				<span class="badge-row-value">
					{#if device.frequency}
						<span class="badge badge-neutral">{device.frequency}</span>
						{#if device.frequency_mhz}
							<span class="text-muted">({device.frequency_mhz} MHz)</span>
						{/if}
					{:else}
						—
					{/if}
				</span>
			</div>
			<InfoRow label="Channel" value={device.channel || '—'} />
			<div class="badge-row">
				<span class="badge-row-label">Signal Strength</span>
				<span class="badge-row-value">
					{#if device.signal_strength}
						<span class="signal mono">{getSignalBars(device.signal_bars)}</span>
						<span>{device.signal_strength} dBm</span>
					{:else}
						—
					{/if}
				</span>
			</div>
		{/if}
		<InfoRow label="Auth" value={device.auth || '—'} />
	</div>
</section>

{#if device.rx_bitrate || device.tx_bitrate}
	<section class="card info-card">
		<h2>Transfer Rates</h2>
		<div class="info-list">
			{#if device.tx_bitrate}
				<InfoRow label="TX Bitrate" value={device.tx_bitrate} mono />
			{/if}
			{#if device.rx_bitrate}
				<InfoRow label="RX Bitrate" value={device.rx_bitrate} mono />
			{/if}
		</div>
	</section>
{/if}

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
		gap: var(--space-4);
	}

	.badge-row-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.badge-row-value {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		text-align: right;
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
</style>
