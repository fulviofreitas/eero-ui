<!--
  PremiumDnsCard

  Network detail "Security & Filtering" section (premium DNS provider/policies summary — not
  to be confused with DnsSettingsCard/DnsCachingCard, which own the actual DNS write forms).
  Extracted from routes/network/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		network: NetworkDetail;
	}

	let { network }: Props = $props();

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

{#if network.premium_dns}
	<section class="card info-card">
		<h2>Security &amp; Filtering</h2>
		<div class="info-list">
			<InfoRow
				label="DNS Provider"
				value={formatSimpleValue(network.premium_dns.dns_provider || '')}
			/>
			<div class="badge-row">
				<span class="badge-row-label">Policies</span>
				<span
					class="badge {network.premium_dns.dns_policies_enabled
						? 'badge-success'
						: 'badge-neutral'}"
				>
					{network.premium_dns.dns_policies_enabled ? 'Enabled' : 'Disabled'}
				</span>
			</div>
			{#if network.premium_dns.dns_policies}
				<div class="badge-row">
					<span class="badge-row-label">Block Malware</span>
					<span
						class="badge {network.premium_dns.dns_policies.block_malware
							? 'badge-success'
							: 'badge-neutral'}"
					>
						{network.premium_dns.dns_policies.block_malware ? 'Enabled' : 'Disabled'}
					</span>
				</div>
				<div class="badge-row">
					<span class="badge-row-label">Ad Blocking</span>
					<span
						class="badge {network.premium_dns.dns_policies.ad_block
							? 'badge-success'
							: 'badge-neutral'}"
					>
						{network.premium_dns.dns_policies.ad_block ? 'Enabled' : 'Disabled'}
					</span>
				</div>
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
