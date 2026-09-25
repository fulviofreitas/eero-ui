<!--
  EeroNetworkHardwareCard

  Eero detail "Network" and "Hardware" cards. Extracted from routes/eeros/[id]/+page.svelte
  (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		eero: EeroDetail;
	}

	let { eero }: Props = $props();
</script>

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
				<Icon name={eero.led_on ? 'lightbulb' : 'moon'} size={14} />
				{eero.led_on ? 'On' : 'Off'}
				{#if eero.led_brightness !== null}
					<span class="text-muted">({eero.led_brightness}%)</span>
				{/if}
			</span>
		</div>
	</div>
</section>

<style>
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

	.info-item-vertical {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
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
</style>
