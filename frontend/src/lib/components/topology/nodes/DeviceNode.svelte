<!--
  Device Node Component
  
  Custom node for connected devices in the network topology.
  Supports minimal, standard, and detailed display modes.
-->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { CLIENT_HEIGHT, type NodeDetailLevel } from '#lib/stores/topology.js';
	import Icon from '$components/common/Icon.svelte';
	import { inferDeviceIconFromLabel } from '#lib/deviceIcons.js';

	interface Props {
		data: {
			label: string;
			status: 'online' | 'offline';
			signal?: number;
			connectionType?: 'wired' | 'wireless';
			ip?: string;
			mac?: string;
			manufacturer?: string;
			isBlocked?: boolean;
			isPaused?: boolean;
			profileName?: string;
			detailLevel?: NodeDetailLevel;
		};
		selected?: boolean;
	}

	let { data, selected = false }: Props = $props();

	let detailLevel = $derived(data.detailLevel || 'minimal');
	let statusClass = $derived(data.status === 'online' ? 'online' : 'offline');
	let deviceIcon = $derived(inferDeviceIconFromLabel(data.label));
</script>

<div
	class="device-node {statusClass}"
	class:wired={data.connectionType === 'wired'}
	style:height="{CLIENT_HEIGHT[detailLevel]}px"
	class:selected
	class:blocked={data.isBlocked}
	class:paused={data.isPaused}
	class:minimal={detailLevel === 'minimal'}
>
	<Handle type="target" position={Position.Left} class="handle" />

	<div class="device-content">
		<span class="device-icon"><Icon name={deviceIcon} size={16} /></span>
		<span class="connection-icon" title={data.connectionType === 'wired' ? 'Wired' : 'Wireless'}>
			<Icon name={data.connectionType === 'wired' ? 'ethernet' : 'wifi'} size={12} />
		</span>
		<span class="device-label" title={data.label}>{data.label}</span>

		{#if data.ip}
			<span class="device-ip">{data.ip}</span>
		{/if}

		{#if detailLevel !== 'minimal'}
			<div class="device-badges">
				{#if detailLevel === 'detailed' && data.signal !== undefined && data.signal !== null}
					<span class="signal" title="Signal: {data.signal} dBm">
						{data.signal} dBm
					</span>
				{/if}
				{#if data.isBlocked}
					<span class="badge badge-blocked">Blocked</span>
				{/if}
				{#if data.isPaused}
					<span class="badge badge-paused">Paused</span>
				{/if}
			</div>

			{#if detailLevel === 'detailed' && data.manufacturer}
				<span class="manufacturer" title={data.manufacturer}>
					{data.manufacturer.length > 15
						? data.manufacturer.slice(0, 15) + '...'
						: data.manufacturer}
				</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.device-node {
		--connection-color: var(--color-accent);
		background: color-mix(in srgb, var(--connection-color) 12%, var(--color-bg-secondary));
		border: 1px solid color-mix(in srgb, var(--connection-color) 50%, var(--color-border));
		border-left: 3px solid var(--connection-color);
		border-radius: var(--radius-lg);
		padding: 8px 12px;
		width: 160px;
		box-sizing: border-box;
		position: relative;
		text-align: center;
		font-family: inherit;
		transition:
			border-color var(--transition-normal),
			box-shadow var(--transition-normal),
			opacity var(--transition-normal),
			transform var(--transition-fast);
	}

	.device-node.minimal {
		padding: 6px 10px;
	}

	.device-node.wired {
		--connection-color: var(--color-success);
	}

	.connection-icon {
		position: absolute;
		top: 8px;
		right: 8px;
		color: var(--connection-color);
	}

	.device-node:hover {
		transform: translateY(-1px);
	}

	.device-node.selected {
		border-color: var(--color-accent);
		box-shadow: var(--focus-ring);
	}

	.device-node.offline {
		border-color: var(--color-border-muted);
		opacity: 0.65;
	}

	.device-node.blocked {
		border-color: var(--color-danger);
		opacity: 0.6;
	}

	.device-node.paused {
		border-color: var(--color-warning);
		opacity: 0.8;
	}

	.device-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	.device-icon {
		color: var(--color-text-secondary);
	}

	.device-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-primary);
		max-width: 132px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.device-ip {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	.device-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
		margin-top: 2px;
	}

	.signal {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	.badge {
		font-size: var(--text-xs);
		padding: 1px 4px;
		border-radius: 3px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.badge-blocked {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.badge-paused {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	.manufacturer {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	:global(.device-node .handle) {
		width: 6px;
		height: 6px;
		background: var(--color-border);
		border: 1px solid var(--color-bg-secondary);
	}
</style>
