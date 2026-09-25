<!--
  EeroRadiosCard

  Eero detail "WiFi Radios" (BSSIDs) and "IPv6 Addresses" cards. Extracted from
  routes/eeros/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import { formatBand } from '$lib/utils/eero-format';

	interface Props {
		eero: EeroDetail;
	}

	let { eero }: Props = $props();
</script>

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

	.chip {
		background-color: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
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
</style>
