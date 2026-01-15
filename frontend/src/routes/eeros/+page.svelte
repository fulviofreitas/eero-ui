<!--
  Eeros Page
  
  List and manage Eero mesh nodes.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { EeroSummary } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';

	let eeros: EeroSummary[] = [];
	let loading = true;
	let error: string | null = null;
	let viewMode: 'blocks' | 'list' = 'blocks';
	let lastNetworkId: string | null = null;

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchEeros();
	});

	// React to network changes
	$: if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
		lastNetworkId = $selectedNetworkId;
		fetchEeros(true);
	}

	async function fetchEeros(refresh = false) {
		loading = true;
		error = null;
		try {
			const result = await api.eeros.list(refresh);
			console.log('Eeros API response:', result);
			// Ensure we have an array and filter out invalid entries
			eeros = Array.isArray(result) 
				? result.filter(e => e && e.id) 
				: [];
			console.log('Eeros after filter:', eeros);
		} catch (err) {
			console.error('Failed to load eeros:', err);
			error = err instanceof Error ? err.message : 'Failed to load eero nodes';
			uiStore.error(error);
			eeros = [];
		} finally {
			loading = false;
		}
	}

	function getMeshQualityBars(bars: number | null | undefined): string {
		if (bars === null || bars === undefined) return '━━━━━';
		const filled = Math.min(Math.max(0, bars), 5);
		return '█'.repeat(filled) + '░'.repeat(5 - filled);
	}

	function getEeroKey(eero: EeroSummary, index: number): string {
		return eero.id || `eero-${index}`;
	}
</script>

<svelte:head>
	<title>Eeros | Eero Dashboard</title>
</svelte:head>

<div class="eeros-page">
	<header class="page-header">
		<div class="header-left">
			<h1>Eero Nodes</h1>
			<p class="text-muted">Manage your mesh network nodes</p>
		</div>
		<div class="header-right">
			<div class="view-toggle">
				<button 
					class="toggle-btn" 
					class:active={viewMode === 'blocks'}
					on:click={() => viewMode = 'blocks'}
					title="Block view"
				>
					▦
				</button>
				<button 
					class="toggle-btn" 
					class:active={viewMode === 'list'}
					on:click={() => viewMode = 'list'}
					title="List view"
				>
					☰
				</button>
			</div>
			<button 
				class="btn btn-secondary"
				on:click={() => fetchEeros(true)}
				disabled={loading}
			>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					↻
				{/if}
				Refresh
			</button>
		</div>
	</header>

	{#if loading && eeros.length === 0}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading eero nodes...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<button class="btn btn-secondary" on:click={() => fetchEeros(true)}>
				Try Again
			</button>
		</div>
	{:else if eeros.length === 0}
		<div class="empty-state">
			<p>No eero nodes found.</p>
		</div>
	{:else if viewMode === 'blocks'}
		<!-- Block/Card View -->
		<div class="eero-grid">
			{#each eeros as eero, index (getEeroKey(eero, index))}
				<a href="/eeros/{eero.id}" class="card eero-card" class:gateway={eero.is_gateway}>
					<div class="eero-header">
						<div class="eero-name">
							<span class="status-dot" class:online={eero.status === 'green'}></span>
							<h3>{eero.location || eero.model || 'Unknown'}</h3>
						</div>
						{#if eero.is_gateway}
							<span class="badge badge-info">Gateway</span>
						{:else}
							<span class="badge badge-secondary">Node</span>
						{/if}
					</div>

					<div class="eero-status">
						<StatusBadge status={eero.status || 'unknown'} />
					</div>

					<div class="eero-details">
						<div class="detail-row">
							<span class="label">Model</span>
							<span class="value">{eero.model || '—'}</span>
						</div>
						<div class="detail-row">
							<span class="label">Firmware</span>
							<span class="value mono">{eero.firmware_version || '—'}</span>
						</div>
						<div class="detail-row">
							<span class="label">IP Address</span>
							<span class="value mono">{eero.ip_address || '—'}</span>
						</div>
						<div class="detail-row">
							<span class="label">Clients</span>
							<span class="value">{eero.connected_clients_count ?? 0}</span>
						</div>
						{#if !eero.is_gateway && eero.mesh_quality_bars != null}
							<div class="detail-row">
								<span class="label">Mesh Quality</span>
								<span class="value mesh-quality mono" title="{eero.mesh_quality_bars}/5">
									{getMeshQualityBars(eero.mesh_quality_bars)}
								</span>
							</div>
						{/if}
						<div class="detail-row">
							<span class="label">Connection</span>
							<span class="value">{eero.wired ? '🔌 Wired' : '📶 Wireless'}</span>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="card eeros-list">
			<table class="eeros-table">
				<thead>
					<tr>
						<th>Eero</th>
						<th>Model</th>
						<th>IP Address</th>
						<th>Clients</th>
						<th>Connection</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each eeros as eero, index (getEeroKey(eero, index))}
						<tr 
							class="clickable"
							class:gateway={eero.is_gateway}
							on:click={() => eero.id && window.location.assign(`/eeros/${eero.id}`)}
						>
							<td class="eero-name-cell">
								<span class="status-dot" class:online={eero.status === 'green'}></span>
								<div>
									<span class="eero-location">{eero.location || eero.model || 'Unknown'}</span>
									{#if eero.is_gateway}
										<span class="badge badge-info badge-sm">Gateway</span>
									{:else}
										<span class="badge badge-secondary badge-sm">Node</span>
									{/if}
								</div>
							</td>
							<td class="text-sm">{eero.model || '—'}</td>
							<td class="mono text-sm">{eero.ip_address || '—'}</td>
							<td class="text-sm">{eero.connected_clients_count ?? 0}</td>
							<td class="text-sm">
								{eero.wired ? '🔌 Wired' : '📶 Wireless'}
								{#if !eero.is_gateway && eero.mesh_quality_bars != null}
									<span class="mesh-quality mono" title="Mesh: {eero.mesh_quality_bars}/5">
										{getMeshQualityBars(eero.mesh_quality_bars)}
									</span>
								{/if}
							</td>
							<td>
								<StatusBadge status={eero.status || 'unknown'} size="sm" />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.eeros-page {
		max-width: 1200px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: var(--space-6);
	}

	.header-left h1 {
		margin-bottom: var(--space-1);
	}

	.loading-state,
	.empty-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.loading-state {
		flex-direction: row;
	}

	.eero-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--space-4);
	}

	.eero-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
		cursor: pointer;
	}

	.eero-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-color: var(--color-accent);
	}

	.eero-card.gateway {
		border-color: var(--color-accent);
	}

	.eero-card.gateway:hover {
		border-color: var(--color-accent-hover);
	}

	.eero-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.eero-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.eero-name h3 {
		margin: 0;
		font-size: 1rem;
	}

	.eero-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
	}

	.label {
		color: var(--color-text-secondary);
	}

	.value {
		font-weight: 500;
	}

	.mesh-quality {
		color: var(--color-success);
		letter-spacing: 0.1em;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.view-toggle {
		display: flex;
		gap: var(--space-1);
		background: var(--color-bg-tertiary);
		padding: var(--space-1);
		border-radius: var(--radius-md);
	}

	.toggle-btn {
		padding: var(--space-1) var(--space-2);
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 1rem;
		color: var(--color-text-secondary);
		transition: all 0.15s ease;
	}

	.toggle-btn:hover {
		color: var(--color-text-primary);
	}

	.toggle-btn.active {
		background: var(--color-bg-secondary);
		color: var(--color-accent);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	/* List View Styles */
	.eeros-list {
		overflow-x: auto;
	}

	.eeros-table {
		width: 100%;
		border-collapse: collapse;
	}

	.eeros-table th,
	.eeros-table td {
		text-align: left;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.eeros-table th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		font-weight: 600;
		background: var(--color-bg-primary);
	}

	.eeros-table tbody tr {
		transition: background-color 0.15s ease;
	}

	.eeros-table tbody tr.clickable {
		cursor: pointer;
	}

	.eeros-table tbody tr:hover {
		background: var(--color-bg-tertiary);
	}

	.eeros-table tbody tr.gateway {
		background: rgba(59, 130, 246, 0.05);
	}

	.eeros-table tbody tr.gateway:hover {
		background: rgba(59, 130, 246, 0.1);
	}

	.eero-name-cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.eero-name-cell div {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.eero-location {
		font-weight: 500;
	}

	.badge-sm {
		font-size: 0.625rem;
		padding: 1px 4px;
	}

</style>
