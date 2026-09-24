<!--
  NetworkStatusCard

  Dashboard "Network Status" stat card. Extracted from routes/+page.svelte (WP5 decomposition)
  with no behavioural change: same markup, same data, same link target.
-->
<script lang="ts">
	import type { NetworkDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		network: NetworkDetail;
	}

	let { network }: Props = $props();
</script>

<a href="/network/{network.id}" class="card stat-card network-status-card clickable-card">
	<div class="stat-header">
		<span class="stat-label">Network Status</span>
	</div>
	<div class="network-status-header">
		<div class="network-status-indicator" class:online={network.status === 'online'}>
			<span class="pulse-ring"></span>
			<span class="status-core"></span>
		</div>
		<div class="network-status-title">
			<span class="network-name">{network.name}</span>
			<span class="network-status-label"
				>{network.status === 'online' ? 'Connected' : network.status}</span
			>
		</div>
	</div>

	<div class="network-info-grid">
		{#if network.isp_name}
			<div class="network-info-item">
				<span class="info-icon"><Icon name="globe" size={16} /></span>
				<div class="info-content">
					<span class="info-label">ISP</span>
					<span class="info-value">{network.isp_name}</span>
				</div>
			</div>
		{/if}
		{#if network.public_ip}
			<div class="network-info-item">
				<span class="info-icon"><Icon name="router" size={16} /></span>
				<div class="info-content">
					<span class="info-label">Public IP</span>
					<span class="info-value mono">{network.public_ip}</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="network-features">
		{#if network.wpa3}
			<span class="feature-badge">WPA3</span>
		{/if}
		{#if network.ipv6_upstream}
			<span class="feature-badge">IPv6</span>
		{/if}
		{#if network.band_steering}
			<span class="feature-badge">Band Steering</span>
		{/if}
		{#if network.sqm}
			<span class="feature-badge">SQM</span>
		{/if}
	</div>

	<span class="card-hint">View network details →</span>
</a>

<style>
	.stat-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.network-status-card {
		gap: var(--space-3);
	}

	.network-status-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.network-status-indicator {
		position: relative;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.network-status-indicator .status-core {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--color-danger);
		position: relative;
		z-index: var(--z-base);
	}

	.network-status-indicator.online .status-core {
		background: var(--color-success);
	}

	.network-status-indicator .pulse-ring {
		position: absolute;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--color-danger);
		opacity: 0.3;
	}

	.network-status-indicator.online .pulse-ring {
		border-color: var(--color-success);
		animation: pulse-ring 2s ease-out infinite;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(0.8);
			opacity: 0.5;
		}
		50% {
			transform: scale(1);
			opacity: 0.2;
		}
		100% {
			transform: scale(0.8);
			opacity: 0.5;
		}
	}

	.network-status-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.network-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.network-status-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success);
		font-weight: 500;
	}

	.network-status-indicator:not(.online) + .network-status-title .network-status-label {
		color: var(--color-danger);
	}

	.network-info-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-surface-elevated);
		border-radius: var(--radius-md);
	}

	.network-info-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.network-info-item .info-icon {
		font-size: 1rem;
		width: 24px;
		text-align: center;
	}

	.network-info-item .info-content {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.network-info-item .info-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.network-info-item .info-value {
		font-size: 0.8125rem;
		color: var(--color-text);
		font-weight: 500;
	}

	.network-features {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.feature-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 3px 8px;
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-full);
		opacity: 0.9;
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.clickable-card {
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast),
			box-shadow var(--transition-fast);
		position: relative;
	}

	.clickable-card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.card-hint {
		font-size: 0.75rem;
		color: var(--color-accent);
		opacity: 0;
		transition: opacity var(--transition-fast);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.clickable-card:hover .card-hint {
		opacity: 1;
	}
</style>
