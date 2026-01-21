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
	</header>

	<div class="topology-wrapper">
		<NetworkMap />
	</div>

	<div class="topology-tips">
		<p>
			<strong>Tip:</strong> Drag nodes to rearrange. Click a node to view details. Use scroll to zoom,
			and drag the canvas to pan. Change layout and detail level using the controls above.
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
