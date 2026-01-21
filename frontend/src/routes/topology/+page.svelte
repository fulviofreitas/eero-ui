<!--
  Topology Page
  
  Visual network topology map showing eero mesh nodes and connected devices.
-->
<script lang="ts">
	import NetworkMap from '$lib/components/topology/NetworkMap.svelte';
</script>

<svelte:head>
	<title>Network Topology | Eero Dashboard</title>
</svelte:head>

<div class="topology-page">
	<header class="page-header">
		<div class="header-left">
			<h1>Network Topology</h1>
			<p class="text-muted">Visual map of your eero mesh network and connected devices</p>
		</div>
		<div class="header-right">
			<div class="legend">
				<div class="legend-item">
					<span class="legend-color gateway"></span>
					<span>Gateway</span>
				</div>
				<div class="legend-item">
					<span class="legend-color eero"></span>
					<span>Eero Node</span>
				</div>
				<div class="legend-item">
					<span class="legend-color device"></span>
					<span>Device</span>
				</div>
			</div>
		</div>
	</header>

	<div class="topology-wrapper">
		<NetworkMap />
	</div>

	<div class="topology-tips">
		<p>
			<strong>Tip:</strong> Drag nodes to rearrange. Double-click a node to view details. Use scroll to
			zoom, and drag the canvas to pan.
		</p>
	</div>
</div>

<style>
	.topology-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: calc(100vh - 120px);
		min-height: 600px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.header-left h1 {
		margin-bottom: var(--space-1);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-text-secondary);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.legend-color.gateway {
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
		box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
	}

	.legend-color.eero {
		background: #22c55e;
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
	}

	.legend-color.device {
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
	}

	.topology-wrapper {
		flex: 1;
		min-height: 500px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.topology-tips {
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.topology-tips p {
		margin: 0;
	}

	.topology-tips strong {
		color: var(--color-text-primary);
	}
</style>
