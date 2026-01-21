<!--
  Gateway Node Component
  
  Custom node for the gateway eero (main router) in the network topology.
-->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	export let data: {
		label: string;
		status: 'online' | 'offline';
		deviceCount?: number;
		model?: string;
		wired?: boolean;
		ipAddress?: string;
	};

	export let selected: boolean = false;

	$: statusClass = data.status === 'online' ? 'online' : 'offline';
</script>

<div class="gateway-node {statusClass}" class:selected>
	<Handle type="target" position={Position.Top} class="handle" />

	<div class="gateway-badge">Gateway</div>

	<div class="node-content">
		<div class="node-header">
			<span class="node-icon">🌐</span>
			<span class="node-label">{data.label}</span>
		</div>

		<div class="node-info">
			<span class="status-dot {statusClass}"></span>
			<span class="model-text">{data.model || 'eero'}</span>
		</div>

		<div class="node-metrics">
			<span class="metric" title="Connected Devices">
				💻 {data.deviceCount ?? 0}
			</span>
			<span class="metric connection-type">
				{data.wired ? '🔌 Wired' : '📶 Wireless'}
			</span>
		</div>

		{#if data.ipAddress}
			<div class="node-ip">{data.ipAddress}</div>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} class="handle" />
</div>

<style>
	.gateway-node {
		background: var(--color-bg-secondary, #12121a);
		border: 2px solid var(--color-accent, #3b82f6);
		border-radius: 12px;
		padding: 14px 18px;
		min-width: 180px;
		font-family: inherit;
		position: relative;
		transition:
			border-color 0.2s,
			box-shadow 0.2s,
			transform 0.15s;
	}

	.gateway-node:hover {
		transform: translateY(-1px);
	}

	.gateway-node.selected {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
	}

	.gateway-node.online {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
	}

	.gateway-node.offline {
		border-color: var(--color-danger, #ef4444);
		opacity: 0.7;
	}

	.gateway-badge {
		position: absolute;
		top: -10px;
		right: -10px;
		background: linear-gradient(135deg, var(--color-accent, #3b82f6) 0%, #2563eb 100%);
		color: white;
		font-size: 10px;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 6px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
	}

	.node-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.node-icon {
		font-size: 20px;
	}

	.node-label {
		font-weight: 600;
		color: var(--color-text-primary, #e4e4e7);
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 130px;
	}

	.node-info {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background-color: var(--color-text-muted, #71717a);
		flex-shrink: 0;
	}

	.status-dot.online {
		background-color: #22c55e;
		box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
	}

	.status-dot.offline {
		background-color: #ef4444;
	}

	.model-text {
		font-size: 11px;
		color: var(--color-text-muted, #71717a);
	}

	.node-metrics {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		color: var(--color-text-secondary, #a1a1aa);
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.node-ip {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--color-text-muted, #71717a);
		text-align: center;
		margin-top: 2px;
	}

	:global(.gateway-node .handle) {
		width: 10px;
		height: 10px;
		background: var(--color-accent, #3b82f6);
		border: 2px solid var(--color-bg-secondary, #12121a);
	}
</style>
