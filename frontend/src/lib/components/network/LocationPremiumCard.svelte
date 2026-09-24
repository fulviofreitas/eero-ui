<!--
  LocationPremiumCard

  Network detail "Location", "Subscription" and "System" (last reboot) sections. Extracted
  from routes/network/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import InfoRow from '$components/common/InfoRow.svelte';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		network: NetworkDetail;
	}

	let { network }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}

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

{#if network.geo_ip}
	<section class="card info-card">
		<h2>Location</h2>
		<div class="location-display">
			<div class="location-main">
				<span class="location-city">{network.geo_ip.city}</span>
				<span class="location-region">{network.geo_ip.region}, {network.geo_ip.countryCode}</span>
			</div>
			<div class="location-time">
				<span class="time-icon"><Icon name="clock" size={14} /></span>
				<span class="local-time">{getLocalTime(network.geo_ip.timezone)}</span>
			</div>
			<div class="location-details">
				<span class="mono text-sm text-muted">{network.geo_ip.timezone}</span>
			</div>
		</div>
	</section>
{/if}

{#if network.premium_details}
	<section class="card info-card premium-card">
		<h2>Subscription</h2>
		<div class="premium-display">
			<div class="premium-tier">
				<span class="tier-badge">{network.premium_details.tier || 'Free'}</span>
			</div>
			<div class="info-list">
				{#if network.premium_details.payment_method}
					<InfoRow
						label="Payment"
						value={network.premium_details.payment_method.replace(/_/g, ' ')}
					/>
				{/if}
				{#if network.premium_details.next_billing_event_date}
					<InfoRow
						label="Next Billing"
						value={formatDate(network.premium_details.next_billing_event_date)}
					/>
				{/if}
			</div>
		</div>
	</section>
{/if}

{#if network.last_reboot}
	<section class="card info-card">
		<h2>System</h2>
		<div class="info-list">
			<InfoRow label="Last Reboot" value={formatDate(network.last_reboot)} />
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
		color: var(--color-premium);
		background: var(--color-premium-bg);
		border: 1px solid var(--color-premium);
		border-radius: var(--radius-lg);
	}

	.premium-card {
		background: var(--color-bg-secondary);
	}
</style>
