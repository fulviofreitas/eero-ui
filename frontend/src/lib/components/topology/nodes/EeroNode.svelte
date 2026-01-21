<!--
  Eero Node Component
  
  Custom node for eero mesh nodes in the network topology.
-->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	export let data: {
		label: string;
		status: 'online' | 'offline';
		meshQuality?: number;
		deviceCount?: number;
		model?: string;
		wired?: boolean;
		ipAddress?: string;
	};

	export let selected: boolean = false;

	$: statusClass = data.status === 'online' ? 'online' : 'offline';
	$: qualityClass = getQualityClass(data.meshQuality);

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
</script>

<div class="eero-node {statusClass}" class:selected>
	<Handle type="target" position={Position.Top} class="handle" />

	<div class="node-content">
		<div class="node-header">
			<span class="node-icon">📡</span>
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
			{#if data.meshQuality !== undefined}
				<span class="metric mesh-quality {qualityClass}" title="Mesh Quality: {data.meshQuality}/5">
					{getMeshQualityBars(data.meshQuality)}
				</span>
			{/if}
			<span class="metric connection-type">
				{data.wired ? '🔌' : '📶'}
			</span>
		</div>

		{#if data.ipAddress}
			<div class="node-ip">{data.ipAddress}</div>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} class="handle" />
</div>

<style>
	.eero-node {
		background: var(--color-bg-secondary, #12121a);
		border: 2px solid var(--color-border, #1e1e2e);
		border-radius: 10px;
		padding: 12px 16px;
		min-width: 160px;
		font-family: inherit;
		transition:
			border-color 0.2s,
			box-shadow 0.2s,
			transform 0.15s;
	}

	.eero-node:hover {
		transform: translateY(-1px);
	}

	.eero-node.selected {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
	}

	.eero-node.online {
		border-color: var(--color-success, #22c55e);
	}

	.eero-node.offline {
		border-color: var(--color-danger, #ef4444);
		opacity: 0.7;
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
		font-size: 18px;
	}

	.node-label {
		font-weight: 600;
		color: var(--color-text-primary, #e4e4e7);
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
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
		background-color: var(--color-text-muted, #71717a);
		flex-shrink: 0;
	}

	.status-dot.online {
		background-color: #22c55e;
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
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
		gap: 10px;
		font-size: 11px;
		color: var(--color-text-secondary, #a1a1aa);
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
		color: #22c55e;
	}
	.mesh-quality.good {
		color: #3b82f6;
	}
	.mesh-quality.fair {
		color: #f59e0b;
	}
	.mesh-quality.poor {
		color: #ef4444;
	}
	.mesh-quality.unknown {
		color: var(--color-text-muted, #71717a);
	}

	.node-ip {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--color-text-muted, #71717a);
		text-align: center;
		margin-top: 2px;
	}

	:global(.eero-node .handle) {
		width: 8px;
		height: 8px;
		background: var(--color-border, #3f3f46);
		border: 2px solid var(--color-bg-secondary, #12121a);
	}
</style>
