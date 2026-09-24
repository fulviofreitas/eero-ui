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
		type TopologyNodeData,
		type LayoutType,
		type NodeDetailLevel
	} from '$lib/stores/topology';

	import EeroNode from './nodes/EeroNode.svelte';
	import DeviceNode from './nodes/DeviceNode.svelte';
	import GatewayNode from './nodes/GatewayNode.svelte';
	import Icon from '$components/common/Icon.svelte';
	import type { IconName } from '$lib/icons/paths';

	interface Props {
		// Props
		readonly?: boolean;
		onNodeClick?: ((nodeId: string) => void) | undefined;
	}

	let { readonly = false, onNodeClick = undefined }: Props = $props();

	// Layout options for dropdown
	const layoutOptions: { value: LayoutType; label: string; icon: IconName }[] = [
		{ value: 'hierarchy', label: 'Hierarchy (Top-Down)', icon: 'bar-chart' },
		{ value: 'horizontal', label: 'Horizontal (Left-Right)', icon: 'ruler' },
		{ value: 'radial', label: 'Radial (Circular)', icon: 'target' },
		{ value: 'force', label: 'Force-Directed (Organic)', icon: 'globe' }
	];

	const detailOptions: { value: NodeDetailLevel; label: string }[] = [
		{ value: 'minimal', label: 'Minimal (Icon, Name, IP)' },
		{ value: 'standard', label: 'Standard (+Model, Metrics)' },
		{ value: 'detailed', label: 'Detailed (All Info)' }
	];

	// Custom node types registration
	const nodeTypes: NodeTypes = {
		gateway: GatewayNode,
		eero: EeroNode,
		device: DeviceNode
	};

	// Local reactive state bound to store
	let nodes = $derived(
		$filteredTopology.nodes.map((node) => ({
			...node,
			data: {
				...node.data,
				detailLevel: $layoutOptionsStore.detailLevel
			}
		}))
	);
	let edges = $derived($filteredTopology.edges);

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

	// Handle layout change
	function handleLayoutChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		layoutOptionsStore.update((opts) => ({
			...opts,
			layoutType: target.value as LayoutType
		}));
		// Re-fetch to recalculate positions
		topologyStore.loadTopology();
	}

	// Handle detail level change
	function handleDetailChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		layoutOptionsStore.update((opts) => ({
			...opts,
			detailLevel: target.value as NodeDetailLevel
		}));
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="topology-container">
	<!-- Controls bar -->
	<div class="map-controls">
		<div class="control-group">
			<label class="control-label" for="topology-layout-select">Layout:</label>
			<select
				id="topology-layout-select"
				class="control-select"
				value={$layoutOptionsStore.layoutType}
				onchange={handleLayoutChange}
			>
				{#each layoutOptions as opt}
					<!-- Native <option> cannot render an <Icon>; label text stands alone here. -->
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="control-group">
			<label class="control-label" for="topology-detail-select">Detail:</label>
			<select
				id="topology-detail-select"
				class="control-select"
				value={$layoutOptionsStore.detailLevel}
				onchange={handleDetailChange}
			>
				{#each detailOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="control-divider"></div>

		<label class="control-option">
			<input type="checkbox" bind:checked={$layoutOptionsStore.showDevices} />
			<span>Devices</span>
		</label>
		<label class="control-option">
			<input type="checkbox" bind:checked={$layoutOptionsStore.showOfflineDevices} />
			<span>Offline</span>
		</label>

		<button class="refresh-btn" onclick={refresh} disabled={$filteredTopology.loading}>
			{#if $filteredTopology.loading}
				<span class="loading-spinner small"></span>
			{:else}
				<Icon name="refresh" label="Refresh topology" />
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
			<span class="error-icon"><Icon name="alert-triangle" size={36} /></span>
			<span>{$filteredTopology.error}</span>
			<button class="retry-btn" onclick={refresh}>Retry</button>
		</div>
	{:else if nodes.length === 0}
		<div class="empty-overlay">
			<span class="empty-icon"><Icon name="router" size={36} /></span>
			<span>No topology data available</span>
			<button class="retry-btn" onclick={refresh}>Refresh</button>
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
					if (node.type === 'gateway') return 'var(--color-accent)';
					if (node.type === 'eero') {
						return node.data.status === 'online' ? 'var(--color-success)' : 'var(--color-danger)';
					}
					return node.data.status === 'online'
						? 'var(--color-text-secondary)'
						: 'var(--color-border)';
				}}
				maskColor="var(--color-overlay)"
			/>
		</SvelteFlow>
	{/if}

	<!-- Legend for edge colors -->
	<div class="edge-legend">
		<div class="legend-item">
			<span class="legend-line wired"></span>
			<span>Wired</span>
		</div>
		<div class="legend-item">
			<span class="legend-line wireless"></span>
			<span>Wireless</span>
		</div>
		<div class="legend-item">
			<span class="legend-line mesh"></span>
			<span>Mesh</span>
		</div>
	</div>

	<!-- Selected node details panel -->
	{#if $selectedNode}
		<div class="details-panel">
			<div class="details-header">
				<h3>{$selectedNode.data.label}</h3>
				<button
					class="close-btn"
					onclick={() => topologyStore.selectNode(null)}
					aria-label="Close details"
				>
					<Icon name="close" size={16} />
				</button>
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

					{#if $selectedNode.data.connectionType}
						<dt>Connection</dt>
						<dd class="capitalize">{$selectedNode.data.connectionType}</dd>
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
					onclick={() => {
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
		background: var(--color-bg-primary);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	/* Override Svelte Flow default styles to follow the active theme */
	:global(.svelte-flow) {
		background: var(--color-bg-primary) !important;
	}

	:global(.svelte-flow__attribution) {
		display: none;
	}

	:global(.svelte-flow__controls) {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	:global(.svelte-flow__controls-button) {
		background: var(--color-bg-secondary);
		border-bottom: 1px solid var(--color-border);
		fill: var(--color-text-secondary);
		width: 28px;
		height: 28px;
	}

	:global(.svelte-flow__controls-button:hover) {
		background: var(--color-bg-tertiary);
	}

	:global(.svelte-flow__controls-button:last-child) {
		border-bottom: none;
	}

	:global(.svelte-flow__minimap) {
		background: var(--color-bg-secondary) !important;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	/* Was a fixed 5%-white dot; invisible on a light background. Token-derived so it stays
	   faintly visible on both themes (see --chart-grid in app.css). */
	:global(.svelte-flow__background pattern circle) {
		fill: var(--chart-grid);
	}

	/* Map controls */
	.map-controls {
		position: absolute;
		top: 12px;
		left: 12px;
		right: 12px;
		z-index: var(--z-dropdown);
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		background: var(--color-bg-secondary);
		padding: 8px 14px;
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-md);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.control-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.control-select {
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 4px 8px;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		min-width: 140px;
	}

	.control-select:hover {
		border-color: var(--color-accent);
	}

	.control-select:focus {
		border-color: var(--color-accent);
	}

	.control-select:focus-visible {
		box-shadow: var(--focus-ring);
	}

	.control-select option {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.control-divider {
		width: 1px;
		height: 20px;
		background: var(--color-border);
	}

	.control-option {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		user-select: none;
	}

	.control-option input[type='checkbox'] {
		width: 12px;
		height: 12px;
		cursor: pointer;
	}

	.control-option:hover {
		color: var(--color-text-primary);
	}

	.refresh-btn {
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
		margin-left: auto;
	}

	.refresh-btn:hover:not(:disabled) {
		background: var(--color-bg-secondary);
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Edge legend */
	.edge-legend {
		position: absolute;
		bottom: 12px;
		left: 60px; /* Offset to avoid overlapping with xyflow controls */
		z-index: var(--z-dropdown);
		display: flex;
		align-items: center;
		gap: 16px;
		background: var(--color-bg-secondary);
		padding: 8px 14px;
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.legend-line {
		width: 24px;
		height: 2px;
		border-radius: 1px;
	}

	.legend-line.wired {
		background: var(--color-success);
	}

	.legend-line.wireless {
		background: repeating-linear-gradient(
			90deg,
			var(--color-accent) 0px,
			var(--color-accent) 6px,
			transparent 6px,
			transparent 9px
		);
	}

	.legend-line.mesh {
		background: linear-gradient(
			90deg,
			var(--color-success),
			var(--color-accent),
			var(--color-warning)
		);
	}

	/* Loading/Error/Empty overlays. --color-overlay tracks --color-bg-primary per theme, so the
	   text tokens rendered on top always have the contrast that theme expects (previously a fixed
	   black scrim paired with light-theme muted text — dark-on-dark). */
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
		background: var(--color-overlay);
		color: var(--color-text-secondary);
		z-index: var(--z-sticky);
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-accent);
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

	.error-icon {
		color: var(--color-danger);
	}

	.empty-icon {
		color: var(--color-text-muted);
	}

	.retry-btn {
		margin-top: 8px;
		padding: 8px 20px;
		background: var(--color-accent);
		color: #ffffff;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 500;
		transition: background-color var(--transition-fast);
	}

	.retry-btn:hover {
		background: var(--color-accent-hover);
	}

	/* Details panel */
	.details-panel {
		position: absolute;
		top: 70px;
		right: 12px;
		width: 260px;
		max-height: calc(100% - 90px);
		overflow: auto;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		z-index: var(--z-sticky);
		box-shadow: var(--shadow-lg);
	}

	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-border);
	}

	.details-header h3 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color var(--transition-fast);
	}

	.close-btn:hover {
		color: var(--color-text-primary);
	}

	.details-content {
		padding: 12px 16px;
	}

	.details-content dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 12px;
		font-size: var(--text-xs);
	}

	.details-content dt {
		color: var(--color-text-muted);
	}

	.details-content dd {
		margin: 0;
		color: var(--color-text-primary);
		text-align: right;
	}

	.details-content .mono {
		font-family: var(--font-mono);
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
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.status-badge.online {
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.details-actions {
		padding: 12px 16px;
		border-top: 1px solid var(--color-border);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		border: none;
		width: 100%;
	}

	.btn-sm {
		padding: 6px 12px;
		font-size: var(--text-xs);
	}

	.btn-primary {
		background: var(--color-accent);
		color: #ffffff;
	}

	.btn-primary:hover {
		background: var(--color-accent-hover);
	}
</style>
