<!--
  Gateway Node Component
  
  Custom node for the gateway eero (main router) in the network topology.
  Supports minimal, standard, and detailed display modes.
-->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeDetailLevel } from '$lib/stores/topology';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		data: {
			label: string;
			status: 'online' | 'offline';
			deviceCount?: number;
			model?: string;
			wired?: boolean;
			ipAddress?: string;
			detailLevel?: NodeDetailLevel;
		};
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();

	let detailLevel = $derived(data.detailLevel || 'minimal');
	let statusClass = $derived(data.status === 'online' ? 'online' : 'offline');
</script>

<div class="gateway-node {statusClass}" class:selected class:minimal={detailLevel === 'minimal'}>
	<Handle type="target" position={Position.Top} class="handle" />

	<div class="gateway-badge">Gateway</div>

	<div class="node-content">
		<div class="node-header">
			<span class="node-icon"><Icon name="globe" size={18} /></span>
			<span class="node-label">{data.label}</span>
		</div>

		{#if data.ipAddress}
			<div class="node-ip">{data.ipAddress}</div>
		{/if}

		{#if detailLevel !== 'minimal'}
			<div class="node-info">
				<span class="status-dot {statusClass}"></span>
				<span class="model-text">{data.model || 'eero'}</span>
			</div>

			<div class="node-metrics">
				<span class="metric" title="Connected Devices">
					<Icon name="laptop" size={12} />
					{data.deviceCount ?? 0}
				</span>
				{#if detailLevel === 'detailed'}
					<span class="metric connection-type">
						<Icon name={data.wired ? 'ethernet' : 'wifi'} size={12} />
						{data.wired ? 'Wired' : 'Wireless'}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} class="handle" />
</div>

<style>
	.gateway-node {
		background: var(--color-bg-secondary);
		border: 2px solid var(--color-accent);
		border-radius: var(--radius-xl);
		padding: 14px 18px;
		min-width: 150px;
		font-family: inherit;
		position: relative;
		transition:
			border-color var(--transition-normal),
			box-shadow var(--transition-normal),
			transform var(--transition-fast);
	}

	.gateway-node.minimal {
		padding: 10px 14px;
		min-width: 120px;
	}

	.gateway-node:hover {
		transform: translateY(-1px);
	}

	.gateway-node.selected {
		border-color: var(--color-accent);
		box-shadow: var(--focus-ring);
	}

	.gateway-node.online {
		border-color: var(--color-accent);
		box-shadow: var(--shadow-md);
	}

	.gateway-node.offline {
		border-color: var(--color-danger);
		opacity: 0.7;
	}

	.gateway-badge {
		position: absolute;
		top: -10px;
		right: -10px;
		background: var(--color-accent);
		color: #ffffff;
		font-size: 9px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		box-shadow: var(--shadow-sm);
	}

	.node-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.node-icon {
		color: var(--color-accent);
	}

	.node-label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 110px;
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
		background-color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.status-dot.online {
		background-color: var(--color-success);
		box-shadow: 0 0 8px var(--color-success);
	}

	.status-dot.offline {
		background-color: var(--color-danger);
	}

	.model-text {
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.node-metrics {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 10px;
		color: var(--color-text-secondary);
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.node-ip {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		text-align: center;
	}

	:global(.gateway-node .handle) {
		width: 10px;
		height: 10px;
		background: var(--color-accent);
		border: 2px solid var(--color-bg-secondary);
	}
</style>
