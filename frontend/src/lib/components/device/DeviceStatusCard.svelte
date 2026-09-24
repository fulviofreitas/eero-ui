<!--
  DeviceStatusCard

  Device detail "Status", "Activity" and "Technical" sections. Extracted from
  routes/devices/[id]/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { DeviceDetail } from '$api/types';
	import Icon from '$components/common/Icon.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		device: DeviceDetail;
	}

	let { device }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}
</script>

<section class="card info-card">
	<h2>Status</h2>
	<div class="info-list">
		<div class="badge-row">
			<span class="badge-row-label">Connected</span>
			<span
				class="status-indicator"
				class:status-success={device.connected}
				class:status-muted={!device.connected}
			>
				{device.connected ? '● Connected' : '○ Disconnected'}
			</span>
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Blocked</span>
			<span
				class="status-indicator"
				class:status-danger={device.blocked}
				class:status-success={!device.blocked}
			>
				<Icon name={device.blocked ? 'x' : 'check'} size={14} />
				{device.blocked ? 'Blocked' : 'Allowed'}
			</span>
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Paused</span>
			<span
				class="status-indicator"
				class:status-warning={device.paused}
				class:status-success={!device.paused}
			>
				{device.paused ? '⏸ Paused' : '▶ Active'}
			</span>
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Guest Network</span>
			{#if device.is_guest}
				<span class="status-indicator status-info">
					<Icon name="person" size={14} /> Yes
				</span>
			{:else}
				<span class="status-indicator status-muted">No</span>
			{/if}
		</div>
		<div class="badge-row">
			<span class="badge-row-label">Private MAC</span>
			{#if device.is_private}
				<span class="status-indicator status-warning">
					<Icon name="lock" size={14} /> Randomized
				</span>
			{:else}
				<span class="status-indicator status-muted">No</span>
			{/if}
		</div>
	</div>
</section>

<section class="card info-card">
	<h2>Activity</h2>
	<div class="info-list">
		<InfoRow label="Last Active" value={formatDate(device.last_active)} />
		<InfoRow label="First Seen" value={formatDate(device.first_active)} />
	</div>
</section>

<section class="card info-card wide-card">
	<h2>Technical</h2>
	<div class="info-list technical-list">
		<InfoRow label="Device ID" value={device.id || '—'} mono />
		<InfoRow label="Network ID" value={device.network_id || '—'} mono />
		{#if device.url}
			<InfoRow label="API URL" value={device.url} mono />
		{/if}
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
		gap: var(--space-4);
	}

	.badge-row-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status-success {
		color: var(--color-success);
		background-color: rgba(34, 197, 94, 0.1);
	}

	.status-danger {
		color: var(--color-danger);
		background-color: rgba(239, 68, 68, 0.1);
	}

	.status-warning {
		color: var(--color-warning);
		background-color: rgba(245, 158, 11, 0.1);
	}

	.status-info {
		color: var(--color-accent);
		background-color: rgba(59, 130, 246, 0.1);
	}

	.status-muted {
		color: var(--color-text-secondary);
		background-color: var(--color-bg-tertiary);
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.technical-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: var(--space-2) var(--space-6);
	}
</style>
