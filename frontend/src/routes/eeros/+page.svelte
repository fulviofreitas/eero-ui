<!--
  Eeros Page
  
  List and manage Eero mesh nodes.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { EeroSummary } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import ExportMenu from '$components/common/ExportMenu.svelte';
	import Icon from '$components/common/Icon.svelte';
	import DataTable, {
		type DataTableColumn,
		type SortDirection
	} from '$components/common/DataTable.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';

	let eeros: EeroSummary[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let viewMode: 'blocks' | 'list' = $state('blocks');
	let lastNetworkId: string | null = $state(null);

	// Default sort is location ascending (house rule - see lessons-learned.md); DataTable is
	// driven in controlled mode so the header reflects that default instead of only the data.
	let sortBy: string | null = $state('location');
	let sortDirection: SortDirection = $state('ascending');

	function handleSort(key: string | null, direction: SortDirection) {
		sortBy = key;
		sortDirection = direction;
	}

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchEeros();
	});

	async function fetchEeros(refresh = false) {
		loading = true;
		error = null;
		try {
			const result = await api.eeros.list(refresh);
			// Ensure we have an array, filter out invalid entries, and sort alphabetically by location
			eeros = Array.isArray(result)
				? result
						.filter((e) => e && e.id)
						.sort((a, b) => {
							const nameA = (a.location || a.model || '').toLowerCase();
							const nameB = (b.location || b.model || '').toLowerCase();
							return nameA.localeCompare(nameB);
						})
				: [];
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

	function goToEero(eero: EeroSummary) {
		if (eero.id) goto(`/eeros/${eero.id}`);
	}
	// React to network changes
	$effect(() => {
		if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
			lastNetworkId = $selectedNetworkId;
			fetchEeros(true);
		}
	});
</script>

{#snippet locationCell(eero: EeroSummary)}
	<div class="eero-name-cell">
		<span class="status-dot" class:online={eero.status === 'green'}></span>
		<div>
			<span class="eero-location">{eero.location || eero.model || 'Unknown'}</span>
			{#if eero.is_gateway}
				<span class="badge badge-info badge-sm">Gateway</span>
			{:else}
				<span class="badge badge-secondary badge-sm">Node</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet modelCell(eero: EeroSummary)}
	<span class="text-sm">{eero.model || '—'}</span>
{/snippet}

{#snippet ipAddressCell(eero: EeroSummary)}
	<span class="mono text-sm">{eero.ip_address || '—'}</span>
{/snippet}

{#snippet clientsCell(eero: EeroSummary)}
	<span class="text-sm">{eero.connected_clients_count ?? 0}</span>
{/snippet}

{#snippet connectionCell(eero: EeroSummary)}
	<span class="text-sm">
		<Icon name={eero.wired ? 'ethernet' : 'wifi'} size={14} />
		{eero.wired ? 'Wired' : 'Wireless'}
	</span>
{/snippet}

{#snippet meshQualityCell(eero: EeroSummary)}
	{#if !eero.is_gateway && eero.mesh_quality_bars != null}
		<span class="mesh-quality mono" title="Mesh: {eero.mesh_quality_bars}/5">
			{getMeshQualityBars(eero.mesh_quality_bars)}
		</span>
	{:else}
		<span class="text-muted">—</span>
	{/if}
{/snippet}

{#snippet statusCell(eero: EeroSummary)}
	<StatusBadge status={eero.status || 'unknown'} size="sm" />
{/snippet}

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
					onclick={() => (viewMode = 'blocks')}
					title="Block view"
				>
					▦
				</button>
				<button
					class="toggle-btn"
					class:active={viewMode === 'list'}
					onclick={() => (viewMode = 'list')}
					title="List view"
				>
					<Icon name="menu" size={14} />
				</button>
			</div>
			<ExportMenu data={eeros} filename="eeros" disabled={loading} />
			<button class="btn btn-secondary" onclick={() => fetchEeros(true)} disabled={loading}>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					<Icon name="refresh" size={14} />
				{/if}
				Refresh
			</button>
		</div>
	</header>

	{#if loading && eeros.length === 0}
		<Skeleton variant="table-rows" rows={4} columns={6} />
	{:else if error}
		<ErrorState message={error} onRetry={() => fetchEeros(true)} />
	{:else if eeros.length === 0}
		<EmptyState icon="eeros" title="No eero nodes found." />
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
							<span class="value"
								><Icon name={eero.wired ? 'ethernet' : 'wifi'} size={14} />
								{eero.wired ? 'Wired' : 'Wireless'}</span
							>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="card eeros-list">
			<DataTable
				id="eeros"
				columns={[
					{
						key: 'location',
						header: 'Eero',
						required: true,
						sortable: true,
						accessor: (e) => (e.location || e.model || '').toLowerCase(),
						render: locationCell
					},
					{
						key: 'model',
						header: 'Model',
						sortable: true,
						accessor: (e) => e.model ?? '',
						render: modelCell
					},
					{ key: 'ipAddress', header: 'IP Address', render: ipAddressCell },
					{
						key: 'clients',
						header: 'Clients',
						sortable: true,
						accessor: (e) => e.connected_clients_count ?? 0,
						render: clientsCell
					},
					{ key: 'connection', header: 'Connection', render: connectionCell },
					{
						key: 'meshQuality',
						header: 'Mesh Quality',
						sortable: true,
						accessor: (e) => e.mesh_quality_bars ?? -1,
						render: meshQualityCell
					},
					{
						key: 'status',
						header: 'Status',
						sortable: true,
						accessor: (e) => e.status ?? '',
						render: statusCell
					}
				] as DataTableColumn<EeroSummary>[]}
				rows={eeros}
				getRowId={(e) => e.id}
				emptyTitle="No eero nodes found."
				{sortBy}
				{sortDirection}
				onSort={handleSort}
				onRowClick={goToEero}
				rowClass={(e) => (e.is_gateway ? 'eero-row gateway' : 'eero-row')}
			/>
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
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
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

	/* `<tr class="eero-row gateway">` is DataTable's own element (rowClass hook), so it needs
	   :global() — everything below is rendered via `render` snippets declared in this file and
	   is scoped normally. */
	:global(.eero-row.gateway) {
		background: rgba(59, 130, 246, 0.05);
	}

	:global(.eero-row.gateway:hover) {
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
