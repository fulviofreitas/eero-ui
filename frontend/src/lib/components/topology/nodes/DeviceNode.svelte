<!--
  Device Node Component
  
  Custom node for connected devices in the network topology.
  Supports minimal, standard, and detailed display modes.
-->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeDetailLevel } from '$lib/stores/topology';

	export let data: {
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

	export let selected: boolean = false;

	$: detailLevel = data.detailLevel || 'minimal';
	$: statusClass = data.status === 'online' ? 'online' : 'offline';
	$: connectionIcon = data.connectionType === 'wired' ? '🔌' : '📶';

	function inferDeviceIcon(label: string): string {
		const name = label.toLowerCase();
		if (
			name.includes('iphone') ||
			name.includes('android') ||
			name.includes('pixel') ||
			name.includes('phone')
		) {
			return '📱';
		}
		if (name.includes('ipad') || name.includes('tablet')) {
			return '📱';
		}
		if (name.includes('macbook') || name.includes('laptop') || name.includes('notebook')) {
			return '💻';
		}
		if (name.includes('desktop') || name.includes('imac') || name.includes('pc')) {
			return '🖥️';
		}
		if (
			name.includes('tv') ||
			name.includes('apple-tv') ||
			name.includes('roku') ||
			name.includes('chromecast')
		) {
			return '📺';
		}
		if (name.includes('alexa') || name.includes('echo') || name.includes('homepod')) {
			return '🔊';
		}
		if (name.includes('nest') || name.includes('thermostat')) {
			return '🌡️';
		}
		if (name.includes('camera') || name.includes('ring') || name.includes('doorbell')) {
			return '📷';
		}
		if (name.includes('printer')) {
			return '🖨️';
		}
		if (name.includes('watch')) {
			return '⌚';
		}
		if (
			name.includes('playstation') ||
			name.includes('xbox') ||
			name.includes('nintendo') ||
			name.includes('switch')
		) {
			return '🎮';
		}
		return '📟';
	}

	$: deviceIcon = inferDeviceIcon(data.label);
</script>

<div
	class="device-node {statusClass}"
	class:selected
	class:blocked={data.isBlocked}
	class:paused={data.isPaused}
	class:minimal={detailLevel === 'minimal'}
>
	<Handle type="target" position={Position.Top} class="handle" />

	<div class="device-content">
		<span class="device-icon">{deviceIcon}</span>
		<span class="device-label" title={data.label}>{data.label}</span>

		{#if data.ip}
			<span class="device-ip">{data.ip}</span>
		{/if}

		{#if detailLevel !== 'minimal'}
			<div class="device-badges">
				<span class="connection-type" title={data.connectionType}>
					{connectionIcon}
				</span>
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
		background: var(--color-bg-secondary, #12121a);
		border: 1px solid var(--color-border, #1e1e2e);
		border-radius: 8px;
		padding: 8px 12px;
		min-width: 90px;
		max-width: 130px;
		text-align: center;
		font-family: inherit;
		transition:
			border-color 0.2s,
			box-shadow 0.2s,
			opacity 0.2s,
			transform 0.15s;
	}

	.device-node.minimal {
		padding: 6px 10px;
		min-width: 80px;
		max-width: 110px;
	}

	.device-node:hover {
		transform: translateY(-1px);
	}

	.device-node.selected {
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	.device-node.online {
		border-color: var(--color-border, #27272a);
	}

	.device-node.offline {
		border-color: var(--color-border-muted, #1e1e2e);
		opacity: 0.5;
	}

	.device-node.blocked {
		border-color: var(--color-danger, #ef4444);
		opacity: 0.6;
	}

	.device-node.paused {
		border-color: var(--color-warning, #f59e0b);
		opacity: 0.8;
	}

	.device-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	.device-icon {
		font-size: 16px;
	}

	.device-label {
		font-size: 10px;
		font-weight: 500;
		color: var(--color-text-primary, #e4e4e7);
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.device-ip {
		font-size: 8px;
		font-family: var(--font-mono, monospace);
		color: var(--color-text-muted, #71717a);
	}

	.device-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
		margin-top: 2px;
	}

	.connection-type {
		font-size: 10px;
	}

	.signal {
		font-size: 8px;
		font-family: var(--font-mono, monospace);
		color: var(--color-text-muted, #71717a);
	}

	.badge {
		font-size: 7px;
		padding: 1px 4px;
		border-radius: 3px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.badge-blocked {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}

	.badge-paused {
		background: rgba(245, 158, 11, 0.2);
		color: #f59e0b;
	}

	.manufacturer {
		font-size: 7px;
		color: var(--color-text-muted, #71717a);
		margin-top: 2px;
	}

	:global(.device-node .handle) {
		width: 6px;
		height: 6px;
		background: var(--color-border, #3f3f46);
		border: 1px solid var(--color-bg-secondary, #12121a);
	}
</style>
