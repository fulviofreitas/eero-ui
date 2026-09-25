<!--
  Eero Node Component
  
  Custom node for eero mesh nodes in the network topology.
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
			meshQuality?: number;
			deviceCount?: number;
			model?: string;
			wired?: boolean;
			ipAddress?: string;
			detailLevel?: NodeDetailLevel;
		};
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();

	function getQualityClass(quality: number | undefined): string {
		if (quality === undefined || quality === null) return 'unknown';
		if (quality >= 4) return 'excellent';
		if (quality >= 3) return 'good';
		if (quality >= 2) return 'fair';
		return 'poor';
	}

	function getMeshQualityBars(bars: number | undefined): string {
		if (bars === undefined || bars === null) return '━━━━━';
		const filled = Math.min(Math.max(0, bars), 5);
		return '█'.repeat(filled) + '░'.repeat(5 - filled);
	}
	let detailLevel = $derived(data.detailLevel || 'minimal');
	let statusClass = $derived(data.status === 'online' ? 'online' : 'offline');
	let qualityClass = $derived(getQualityClass(data.meshQuality));
</script>

<div class="eero-node {statusClass}" class:selected class:minimal={detailLevel === 'minimal'}>
	<Handle type="target" position={Position.Top} class="handle" />

	<div class="node-content">
		<div class="node-header">
			<span class="node-icon"><Icon name="eeros" size={16} /></span>
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
				{#if detailLevel === 'detailed' && data.meshQuality !== undefined}
					<span
						class="metric mesh-quality {qualityClass}"
						title="Mesh Quality: {data.meshQuality}/5"
					>
						{getMeshQualityBars(data.meshQuality)}
					</span>
				{/if}
				<span class="metric connection-type">
					<Icon name={data.wired ? 'ethernet' : 'wifi'} size={12} />
				</span>
			</div>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} class="handle" />
</div>

<style>
	.eero-node {
		background: var(--color-bg-secondary);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 12px 16px;
		min-width: 140px;
		font-family: inherit;
		transition:
			border-color var(--transition-normal),
			box-shadow var(--transition-normal),
			transform var(--transition-fast);
	}

	.eero-node.minimal {
		padding: 8px 12px;
		min-width: 100px;
	}

	.eero-node:hover {
		transform: translateY(-1px);
	}

	.eero-node.selected {
		border-color: var(--color-accent);
		box-shadow: var(--focus-ring);
	}

	.eero-node.online {
		border-color: var(--color-success);
	}

	.eero-node.offline {
		border-color: var(--color-danger);
		opacity: 0.7;
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
		color: var(--color-text-secondary);
	}

	.node-label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: var(--text-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100px;
	}

	.node-info {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.status-dot.online {
		background-color: var(--color-success);
		box-shadow: 0 0 6px var(--color-success);
	}

	.status-dot.offline {
		background-color: var(--color-danger);
	}

	.model-text {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.node-metrics {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.mesh-quality {
		font-family: monospace;
		letter-spacing: 0.05em;
	}

	.mesh-quality.excellent {
		color: var(--color-success);
	}
	.mesh-quality.good {
		color: var(--color-accent);
	}
	.mesh-quality.fair {
		color: var(--color-warning);
	}
	.mesh-quality.poor {
		color: var(--color-danger);
	}
	.mesh-quality.unknown {
		color: var(--color-text-muted);
	}

	.node-ip {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		text-align: center;
	}

	:global(.eero-node .handle) {
		width: 8px;
		height: 8px;
		background: var(--color-border);
		border: 2px solid var(--color-bg-secondary);
	}
</style>
