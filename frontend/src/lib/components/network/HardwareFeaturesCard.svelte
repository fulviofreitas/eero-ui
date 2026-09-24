<!--
  HardwareFeaturesCard

  Network detail "Connected Hardware", "Features" and "Integrations" sections. Extracted from
  routes/network/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		network: NetworkDetail;
	}

	let { network }: Props = $props();
</script>

<section class="card info-card">
	<h2>Connected Hardware</h2>
	<div class="hardware-stats">
		<a href="/devices" class="hardware-stat clickable">
			<span class="stat-icon"><Icon name="devices" size={20} /></span>
			<span class="stat-number">{network.device_count}</span>
			<span class="stat-label">Devices</span>
		</a>
		<a href="/eeros" class="hardware-stat clickable">
			<span class="stat-icon"><Icon name="eeros" size={20} /></span>
			<span class="stat-number">{network.eero_count}</span>
			<span class="stat-label">Eero Nodes</span>
		</a>
	</div>
</section>

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
		transition:
			background-color var(--transition-fast),
			transform var(--transition-fast);
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
		transition: background var(--transition-normal);
	}

	.feature-item.enabled {
		background: var(--color-success-bg);
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

	@media (max-width: 768px) {
		.hardware-stats {
			flex-direction: column;
		}
	}
</style>
