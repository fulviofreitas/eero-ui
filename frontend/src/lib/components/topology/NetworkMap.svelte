<!--
  NetworkMap Component
  
  Main topology visualization using @xyflow/svelte.
  Displays eero mesh network with connected devices.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		BackgroundVariant,
		type NodeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { goto } from '$app/navigation';
	import {
		topologyStore,
		selectedNode,
		layoutOptionsStore,
		filteredTopology,
		type TopologyNodeData
	} from '$lib/stores/topology';

	import EeroNode from './nodes/EeroNode.svelte';
	import DeviceNode from './nodes/DeviceNode.svelte';
	import GatewayNode from './nodes/GatewayNode.svelte';

	// Props
	export let readonly: boolean = false;
	export let onNodeClick: ((nodeId: string) => void) | undefined = undefined;

	// Custom node types registration
	const nodeTypes: NodeTypes = {
		gateway: GatewayNode,
		eero: EeroNode,
		device: DeviceNode
	};

	// Local reactive state bound to store
	let nodes = $filteredTopology.nodes;
	let edges = $filteredTopology.edges;

	// Keep in sync with store changes
	$: nodes = $filteredTopology.nodes;
	$: edges = $filteredTopology.edges;

	// Load topology on mount
	onMount(() => {
		topologyStore.loadTopology();
	});

	onDestroy(() => {
		topologyStore.clear();
	});

	// Handle node click - xyflow uses { node, event } directly
	function handleNodeClick({ node }: { node: { id: string; data: TopologyNodeData } }) {
		if (node) {
			topologyStore.selectNode(node.id);
			onNodeClick?.(node.id);
		}
	}

	// Handle pane click (deselect)
	function handlePaneClick() {
		topologyStore.selectNode(null);
	}

	// Navigation is handled from the details panel instead of double-click

	// Keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			topologyStore.selectNode(null);
		}
	}

	// Refresh topology
	function refresh() {
		topologyStore.loadTopology();
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="topology-container">
	<!-- Controls bar -->
	<div class="map-controls">
		<label class="control-option">
			<input type="checkbox" bind:checked={$layoutOptionsStore.showDevices} />
			<span>Show Devices</span>
		</label>
		<label class="control-option">
			<input type="checkbox" bind:checked={$layoutOptionsStore.showOfflineDevices} />
			<span>Show Offline</span>
		</label>
		<button class="refresh-btn" on:click={refresh} disabled={$filteredTopology.loading}>
			{#if $filteredTopology.loading}
				<span class="loading-spinner small"></span>
			{:else}
				↻
			{/if}
		</button>
	</div>

	{#if $filteredTopology.loading && nodes.length === 0}
		<div class="loading-overlay">
			<span class="loading-spinner"></span>
			<span>Loading network topology...</span>
		</div>
	{:else if $filteredTopology.error}
		<div class="error-overlay">
			<span class="error-icon">⚠️</span>
			<span>{$filteredTopology.error}</span>
			<button class="retry-btn" on:click={refresh}>Retry</button>
		</div>
	{:else if nodes.length === 0}
		<div class="empty-overlay">
			<span class="empty-icon">📡</span>
			<span>No topology data available</span>
			<button class="retry-btn" on:click={refresh}>Refresh</button>
		</div>
	{:else}
		<SvelteFlow
			{nodes}
			{edges}
			{nodeTypes}
			fitView
			minZoom={0.2}
			maxZoom={2}
			nodesDraggable={!readonly}
			nodesConnectable={false}
			elementsSelectable={true}
			panOnScroll={true}
			zoomOnScroll={true}
			onnodeclick={handleNodeClick}
			onpaneclick={handlePaneClick}
		>
			<Background variant={BackgroundVariant.Dots} gap={20} size={1} />

			<Controls showZoom={true} showFitView={true} showLock={!readonly} />

			<MiniMap
				nodeColor={(node) => {
					if (node.type === 'gateway') return '#3b82f6';
					if (node.type === 'eero') {
						return node.data.status === 'online' ? '#22c55e' : '#ef4444';
					}
					return node.data.status === 'online' ? '#6b7280' : '#3f3f46';
				}}
				maskColor="rgba(0, 0, 0, 0.8)"
			/>
		</SvelteFlow>
	{/if}

	<!-- Selected node details panel -->
	{#if $selectedNode}
		<div class="details-panel">
			<div class="details-header">
				<h3>{$selectedNode.data.label}</h3>
				<button class="close-btn" on:click={() => topologyStore.selectNode(null)}>×</button>
			</div>

			<div class="details-content">
				<dl>
					<dt>Type</dt>
					<dd class="capitalize">{$selectedNode.data.type}</dd>

					<dt>Status</dt>
					<dd>
						<span class="status-badge" class:online={$selectedNode.data.status === 'online'}>
							{$selectedNode.data.status}
						</span>
					</dd>

					{#if $selectedNode.data.model}
						<dt>Model</dt>
						<dd>{$selectedNode.data.model}</dd>
					{/if}

					{#if $selectedNode.data.ipAddress || $selectedNode.data.ip}
						<dt>IP Address</dt>
						<dd class="mono">{$selectedNode.data.ipAddress || $selectedNode.data.ip}</dd>
					{/if}

					{#if $selectedNode.data.mac}
						<dt>MAC</dt>
						<dd class="mono">{$selectedNode.data.mac}</dd>
					{/if}

					{#if $selectedNode.data.meshQuality !== undefined}
						<dt>Mesh Quality</dt>
						<dd>{$selectedNode.data.meshQuality}/5</dd>
					{/if}

					{#if $selectedNode.data.deviceCount !== undefined}
						<dt>Connected Devices</dt>
						<dd>{$selectedNode.data.deviceCount}</dd>
					{/if}

					{#if $selectedNode.data.signal !== undefined}
						<dt>Signal Strength</dt>
						<dd>{$selectedNode.data.signal} dBm</dd>
					{/if}

					{#if $selectedNode.data.manufacturer}
						<dt>Manufacturer</dt>
						<dd>{$selectedNode.data.manufacturer}</dd>
					{/if}

					{#if $selectedNode.data.profileName}
						<dt>Profile</dt>
						<dd>{$selectedNode.data.profileName}</dd>
					{/if}
				</dl>
			</div>

			<div class="details-actions">
				<button
					class="btn btn-sm btn-primary"
					on:click={() => {
						const data = $selectedNode?.data;
						if (!data) return;
						if (data.type === 'gateway' || data.type === 'eero') {
							goto(`/eeros/${data.id}`);
						} else {
							goto(`/devices/${data.id}`);
						}
					}}
				>
					View Details
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.topology-container {
		width: 100%;
		height: 100%;
		min-height: 500px;
		position: relative;
		background: var(--color-bg-primary, #0a0a0f);
		border-radius: 8px;
		overflow: hidden;
	}

	/* Override Svelte Flow default styles for dark theme */
	:global(.svelte-flow) {
		background: var(--color-bg-primary, #0a0a0f) !important;
	}

	:global(.svelte-flow__attribution) {
		display: none;
	}

	:global(.svelte-flow__controls) {
		background: var(--color-bg-secondary, #12121a);
		border: 1px solid var(--color-border, #27272a);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	:global(.svelte-flow__controls-button) {
		background: var(--color-bg-secondary, #12121a);
		border-bottom: 1px solid var(--color-border, #27272a);
		fill: var(--color-text-secondary, #a1a1aa);
		width: 28px;
		height: 28px;
	}

	:global(.svelte-flow__controls-button:hover) {
		background: var(--color-bg-tertiary, #1e1e2e);
	}

	:global(.svelte-flow__controls-button:last-child) {
		border-bottom: none;
	}

	:global(.svelte-flow__minimap) {
		background: var(--color-bg-secondary, #12121a) !important;
		border: 1px solid var(--color-border, #27272a);
		border-radius: 8px;
	}

	:global(.svelte-flow__background pattern circle) {
		fill: rgba(255, 255, 255, 0.05);
	}

	/* Map controls */
	.map-controls {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--color-bg-secondary, #12121a);
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid var(--color-border, #27272a);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.control-option {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--color-text-secondary, #a1a1aa);
		cursor: pointer;
		user-select: none;
	}

	.control-option input[type='checkbox'] {
		width: 14px;
		height: 14px;
		cursor: pointer;
	}

	.control-option:hover {
		color: var(--color-text-primary, #e4e4e7);
	}

	.refresh-btn {
		background: var(--color-bg-tertiary, #1e1e2e);
		border: 1px solid var(--color-border, #27272a);
		color: var(--color-text-secondary, #a1a1aa);
		width: 28px;
		height: 28px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		transition: all 0.15s;
	}

	.refresh-btn:hover:not(:disabled) {
		background: var(--color-bg-secondary, #12121a);
		border-color: var(--color-accent, #3b82f6);
		color: var(--color-accent, #3b82f6);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Loading/Error/Empty overlays */
	.loading-overlay,
	.error-overlay,
	.empty-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		background: rgba(0, 0, 0, 0.85);
		color: var(--color-text-secondary, #a1a1aa);
		z-index: 20;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border, #27272a);
		border-top-color: var(--color-accent, #3b82f6);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-spinner.small {
		width: 14px;
		height: 14px;
		border-width: 2px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-icon,
	.empty-icon {
		font-size: 36px;
	}

	.retry-btn {
		margin-top: 8px;
		padding: 8px 20px;
		background: var(--color-accent, #3b82f6);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
		font-weight: 500;
		transition: background 0.15s;
	}

	.retry-btn:hover {
		background: var(--color-accent-hover, #2563eb);
	}

	/* Details panel */
	.details-panel {
		position: absolute;
		top: 60px;
		right: 12px;
		width: 260px;
		max-height: calc(100% - 80px);
		overflow: auto;
		background: var(--color-bg-secondary, #12121a);
		border: 1px solid var(--color-border, #27272a);
		border-radius: 10px;
		z-index: 15;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-border, #27272a);
	}

	.details-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-text-primary, #e4e4e7);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted, #71717a);
		font-size: 20px;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}

	.close-btn:hover {
		color: var(--color-text-primary, #e4e4e7);
	}

	.details-content {
		padding: 12px 16px;
	}

	.details-content dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 12px;
		font-size: 12px;
	}

	.details-content dt {
		color: var(--color-text-muted, #71717a);
	}

	.details-content dd {
		margin: 0;
		color: var(--color-text-primary, #e4e4e7);
		text-align: right;
	}

	.details-content .mono {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
	}

	.details-content .capitalize {
		text-transform: capitalize;
	}

	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.status-badge.online {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.details-actions {
		padding: 12px 16px;
		border-top: 1px solid var(--color-border, #27272a);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border: none;
		width: 100%;
	}

	.btn-sm {
		padding: 6px 12px;
		font-size: 12px;
	}

	.btn-primary {
		background: var(--color-accent, #3b82f6);
		color: white;
	}

	.btn-primary:hover {
		background: var(--color-accent-hover, #2563eb);
	}
</style>
