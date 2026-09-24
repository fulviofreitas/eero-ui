<!--
  EeroPerformanceHistoryCard

  Eero detail "Performance", "History" and "System" cards. Extracted from
  routes/eeros/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';
	import {
		formatUptime,
		formatPercentage,
		formatTemperature,
		formatDate
	} from '$lib/utils/eero-format';

	interface Props {
		eero: EeroDetail;
	}

	let { eero }: Props = $props();
</script>

<section class="card detail-card">
	<h2>Performance</h2>
	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">Uptime</span>
			<span class="info-value">{formatUptime(eero.uptime)}</span>
		</div>
		{#if eero.cpu_usage !== null}
			<div class="info-item">
				<span class="info-label">CPU Usage</span>
				<span class="info-value">
					<span class="progress-bar">
						<span class="progress-fill" style="width: {eero.cpu_usage}%"></span>
					</span>
					<span class="mono">{formatPercentage(eero.cpu_usage)}</span>
				</span>
			</div>
		{/if}
		{#if eero.memory_usage !== null}
			<div class="info-item">
				<span class="info-label">Memory Usage</span>
				<span class="info-value">
					<span class="progress-bar">
						<span class="progress-fill" style="width: {eero.memory_usage}%"></span>
					</span>
					<span class="mono">{formatPercentage(eero.memory_usage)}</span>
				</span>
			</div>
		{/if}
		{#if eero.temperature !== null}
			<div class="info-item">
				<span class="info-label">Temperature</span>
				<span class="info-value">{formatTemperature(eero.temperature)}</span>
			</div>
		{/if}
	</div>
</section>

<section class="card detail-card">
	<h2>History</h2>
	<div class="info-grid">
		{#if eero.last_heartbeat}
			<div class="info-item">
				<span class="info-label">Last Heartbeat</span>
				<span class="info-value"><span class="chip">{formatDate(eero.last_heartbeat)}</span></span>
			</div>
		{/if}
		{#if eero.last_reboot}
			<div class="info-item">
				<span class="info-label">Last Reboot</span>
				<span class="info-value"><span class="chip">{formatDate(eero.last_reboot)}</span></span>
			</div>
		{/if}
		{#if eero.joined}
			<div class="info-item">
				<span class="info-label">Joined Network</span>
				<span class="info-value"><span class="chip">{formatDate(eero.joined)}</span></span>
			</div>
		{/if}
	</div>
</section>

<section class="card detail-card">
	<h2>System</h2>
	<div class="info-grid">
		{#if eero.state}
			<div class="info-item">
				<span class="info-label">State</span>
				<span class="info-value">
					<span class="chip" class:online-chip={eero.state === 'ONLINE'}>{eero.state}</span>
				</span>
			</div>
		{/if}
		{#if eero.network_name}
			<div class="info-item">
				<span class="info-label">Network</span>
				<span class="info-value">{eero.network_name}</span>
			</div>
		{/if}
		{#if eero.organization_name}
			<div class="info-item">
				<span class="info-label">ISP</span>
				<span class="info-value">{eero.organization_name}</span>
			</div>
		{/if}
		{#if eero.power_source}
			<div class="info-item">
				<span class="info-label">Power Source</span>
				<span class="info-value">{eero.power_source}</span>
			</div>
		{/if}
		{#if eero.power_saving_active !== null}
			<div class="info-item">
				<span class="info-label">Power Saving</span>
				<span class="info-value">
					{#if eero.power_saving_active}<Icon name="check" size={14} /> Active{:else}Off{/if}
				</span>
			</div>
		{/if}
		{#if eero.auto_provisioned !== null}
			<div class="info-item">
				<span class="info-label">Auto Provisioned</span>
				<span class="info-value">
					{#if eero.auto_provisioned}<Icon name="check" size={14} /> Yes{:else}No{/if}
				</span>
			</div>
		{/if}
		{#if eero.retrograde_capable !== null}
			<div class="info-item">
				<span class="info-label">Retrograde Capable</span>
				<span class="info-value">
					{#if eero.retrograde_capable}<Icon name="check" size={14} /> Yes{:else}No{/if}
				</span>
			</div>
		{/if}
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

	.chip {
		background-color: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
	}

	.online-chip {
		background-color: rgba(34, 197, 94, 0.15);
		color: var(--color-success);
	}

	.progress-bar {
		width: 60px;
		height: 6px;
		background-color: var(--color-bg-tertiary);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background-color: var(--color-accent);
		border-radius: 3px;
		transition: width 0.3s ease;
	}
</style>
