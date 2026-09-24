<!--
  Device List Component

  Main device listing with filtering and search. Table itself is DataTable
  (phase-6.0-revamp.md § 6.2 Tier 2) — sort, column visibility, sticky header/actions column and
  keyboard-accessible `aria-sort` headers all come from there now. This component keeps the
  field-scoped search, the three filter groups with live counts, bulk selection, and export,
  which are all orthogonal to how the table itself renders.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		devicesStore,
		deviceFilters,
		filteredDevices,
		deviceCounts,
		isDevicesLoading,
		selectionMode,
		selectedDevices,
		toggleSelectionMode,
		clearSelection
	} from '$stores';
	import type { DeviceSummary } from '$api/types';
	import { api } from '$api/client';
	import { uiStore } from '$stores';
	import DataTable, {
		type DataTableColumn,
		type SortDirection
	} from '$components/common/DataTable.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import DeviceRow from './DeviceRow.svelte';
	import ExportMenu from '$components/common/ExportMenu.svelte';
	import Icon from '$components/common/Icon.svelte';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import Dropdown, { type DropdownItem } from '$components/common/Dropdown.svelte';

	let refreshing = $state(false);
	let profiles: { id: string; name: string }[] = $state([]);
	let loadingProfiles = $state(false);
	let assigningProfile = $state(false);

	// Mirrors DataTable's resolved visible-column set (see DataTable's `onVisibleColumnsChange`)
	// so the name column can suppress its manufacturer sub-label once the Manufacturer column
	// itself is shown, without DataTable needing to know anything about device-list semantics.
	let visibleColumnKeys = $state(
		new Set(['name', 'ip', 'mac', 'connection', 'connectedTo', 'status', 'actions'])
	);

	let selectedCount = $derived($selectedDevices.size);

	let hasActiveFilters = $derived(
		!!$deviceFilters.search ||
			$deviceFilters.status !== 'all' ||
			$deviceFilters.connectionType !== 'all' ||
			$deviceFilters.frequency !== 'all'
	);

	function clearFilters() {
		deviceFilters.set({
			search: '',
			status: 'all',
			connectionType: 'all',
			frequency: 'all',
			sortBy: 'name',
			sortOrder: 'asc'
		});
	}

	async function loadProfiles() {
		if (profiles.length > 0) return;
		loadingProfiles = true;
		try {
			const result = await api.profiles.list();
			profiles = result.map((p) => ({ id: p.id || '', name: p.name })).filter((p) => p.id);
		} catch (_error) {
			uiStore.error('Failed to load profiles');
		} finally {
			loadingProfiles = false;
		}
	}

	let profileItems: DropdownItem[] = $derived(
		loadingProfiles
			? [{ id: '__loading', label: 'Loading profiles…', onSelect: () => {}, disabled: true }]
			: profiles.length === 0
				? [{ id: '__empty', label: 'No profiles available', onSelect: () => {}, disabled: true }]
				: profiles.map((profile) => ({
						id: profile.id,
						label: profile.name,
						onSelect: () => assignToProfile(profile.id, profile.name)
					}))
	);

	async function assignToProfile(profileId: string, profileName: string) {
		if (selectedCount === 0) return;

		const ids = Array.from($selectedDevices);
		assigningProfile = true;

		try {
			await devicesStore.assignToProfile(ids, profileId, profileName);
			uiStore.success(`Assigned ${ids.length} device(s) to "${profileName}"`);
			clearSelection();
			toggleSelectionMode();
			await devicesStore.fetch(true);
		} catch (_error) {
			uiStore.error(
				_error instanceof Error ? _error.message : 'Failed to assign devices to profile'
			);
		} finally {
			assigningProfile = false;
		}
	}

	// Prefetch profiles as soon as there's a selection to assign, so the Dropdown's item list is
	// ready (not empty) by the time the user opens it - Dropdown itself has no "on open" hook.
	$effect(() => {
		if ($selectionMode && selectedCount > 0) {
			loadProfiles();
		}
	});

	onMount(() => {
		devicesStore.fetch();
	});

	async function handleRefresh() {
		refreshing = true;
		await devicesStore.fetch(true);
		refreshing = false;
	}

	function handleSearch(event: Event) {
		const input = event.target as HTMLInputElement;
		deviceFilters.update((f) => ({ ...f, search: input.value }));
	}

	function handleClearSearch() {
		deviceFilters.update((f) => ({ ...f, search: '' }));
	}

	function handleStatusFilter(status: typeof $deviceFilters.status) {
		deviceFilters.update((f) => ({ ...f, status }));
	}

	function handleConnectionFilter(connectionType: typeof $deviceFilters.connectionType) {
		deviceFilters.update((f) => ({ ...f, connectionType }));
	}

	function handleFrequencyFilter(frequency: typeof $deviceFilters.frequency) {
		deviceFilters.update((f) => ({ ...f, frequency }));
	}

	// DataTable's column `key` for the "last active" column is `lastActive` (matches the other
	// column ids); the filter store's sortBy uses the API field name `last_active`. Translate
	// both ways rather than renaming one side and drifting from the other.
	function toFilterSortBy(key: string): typeof $deviceFilters.sortBy {
		return (key === 'lastActive' ? 'last_active' : key) as typeof $deviceFilters.sortBy;
	}

	function toColumnKey(sortBy: string): string {
		return sortBy === 'last_active' ? 'lastActive' : sortBy;
	}

	function handleSort(key: string | null, direction: SortDirection) {
		const sortBy = key ? toFilterSortBy(key) : $deviceFilters.sortBy;
		deviceFilters.update((f) => ({
			...f,
			sortBy,
			sortOrder: direction === 'descending' ? 'desc' : 'asc'
		}));
	}

	function displayName(device: DeviceSummary): string {
		return (
			device.display_name || device.nickname || device.hostname || device.mac || 'Unknown Device'
		);
	}

	function statusLabel(device: DeviceSummary): string {
		return device.blocked ? 'blocked' : device.connected ? 'connected' : 'disconnected';
	}

	function ipSortKey(ip: string | null): string {
		if (!ip) return '';
		return ip
			.split('.')
			.map((n) => Number(n).toString().padStart(3, '0'))
			.join('.');
	}

	function getSignalIcon(strength: number | null): string {
		if (strength === null) return '━';
		if (strength >= -50) return '▂▄▆█';
		if (strength >= -60) return '▂▄▆░';
		if (strength >= -70) return '▂▄░░';
		return '▂░░░';
	}

	function deviceRowClass(device: DeviceSummary): string {
		const classes = ['device-row'];
		if (device.blocked) classes.push('blocked');
		if (!device.connected) classes.push('disconnected');
		if (device.id && $selectedDevices.has(device.id)) classes.push('selected');
		return classes.join(' ');
	}
</script>

{#snippet nameCell(device: DeviceSummary)}
	<div class="device-name-wrapper">
		<span
			class="status-dot"
			class:online={device.connected && !device.blocked}
			class:offline={!device.connected}
			class:danger={device.blocked}
		></span>
		<div class="name-info">
			{#if device.id}
				<a href="/devices/{device.id}" class="name device-link">{displayName(device)}</a>
			{:else}
				<span class="name">{displayName(device)}</span>
			{/if}
			{#if !visibleColumnKeys.has('manufacturer') && device.manufacturer}
				<span class="manufacturer text-muted text-xs">{device.manufacturer}</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet ipCell(device: DeviceSummary)}
	<span class="mono text-sm">{device.ip || '—'}</span>
{/snippet}

{#snippet macCell(device: DeviceSummary)}
	<span class="mono text-sm text-muted">{device.mac || '—'}</span>
{/snippet}

{#snippet hostnameCell(device: DeviceSummary)}
	<span class="text-sm">{device.hostname || '—'}</span>
{/snippet}

{#snippet manufacturerCell(device: DeviceSummary)}
	<span class="text-sm">{device.manufacturer || '—'}</span>
{/snippet}

{#snippet deviceTypeCell(device: DeviceSummary)}
	<span class="text-sm">{device.device_type || '—'}</span>
{/snippet}

{#snippet connectionCell(device: DeviceSummary)}
	<span class="text-sm">
		{#if device.connected}
			<Icon name={device.wireless ? 'wifi' : 'ethernet'} size={14} />
			{device.wireless ? 'Wireless' : 'Wired'}
		{:else}
			<span class="text-muted">—</span>
		{/if}
	</span>
{/snippet}

{#snippet signalCell(device: DeviceSummary)}
	{#if device.connected && device.wireless && device.signal_strength}
		<span class="signal mono" title="{device.signal_strength} dBm">
			{getSignalIcon(device.signal_strength)}
			{device.signal_strength} dBm
		</span>
	{:else}
		<span class="text-muted">—</span>
	{/if}
{/snippet}

{#snippet frequencyCell(device: DeviceSummary)}
	<span class="text-sm">
		{#if device.frequency}
			<span class="badge badge-neutral">{device.frequency}</span>
		{:else}
			<span class="text-muted">—</span>
		{/if}
	</span>
{/snippet}

{#snippet connectedToCell(device: DeviceSummary)}
	<span class="text-sm">{device.connected_to_eero || '—'}</span>
{/snippet}

{#snippet profileCell(device: DeviceSummary)}
	<span class="text-sm">{device.profile_name || '—'}</span>
{/snippet}

{#snippet lastActiveCell(device: DeviceSummary)}
	<span class="text-sm text-muted">
		{device.last_active ? new Date(device.last_active).toLocaleString() : '—'}
	</span>
{/snippet}

{#snippet statusCell(device: DeviceSummary)}
	<StatusBadge status={statusLabel(device)} size="sm" />
{/snippet}

{#snippet actionsCell(device: DeviceSummary)}
	<DeviceRow {device} />
{/snippet}

<div class="device-list-container">
	<!-- Header -->
	<div class="list-header">
		<div class="header-left">
			<h2>Devices</h2>
			<div class="device-counts text-sm text-muted">
				<span>{$filteredDevices.length} filtered</span>
				<span>•</span>
				<span>{$deviceCounts.total} total</span>
				{#if $devicesStore.lastUpdated}
					<span>•</span>
					<span title="Click Refresh to update"
						>Updated {new Date($devicesStore.lastUpdated).toLocaleTimeString()}</span
					>
				{/if}
			</div>
		</div>
		<div class="header-right">
			<!-- Selection Mode Toggle -->
			<button
				class="btn btn-sm"
				class:btn-primary={$selectionMode}
				class:btn-secondary={!$selectionMode}
				onclick={toggleSelectionMode}
			>
				{#if $selectionMode}
					<Icon name="x" size={14} /> Cancel Selection
				{:else}
					<Icon name="checkbox-on" size={14} /> Select
				{/if}
			</button>

			<!-- Profile Assignment (only in selection mode) -->
			{#if $selectionMode && selectedCount > 0}
				<Dropdown
					label={`Assign to Profile (${selectedCount})`}
					items={profileItems}
					disabled={assigningProfile}
					triggerClass="btn btn-primary btn-sm dropdown-trigger"
				>
					{#snippet trigger()}
						<Icon name="folder" size={14} /> Assign to Profile ({selectedCount})
					{/snippet}
				</Dropdown>
			{/if}

			<!-- Export -->
			<ExportMenu data={$filteredDevices} filename="devices" disabled={$isDevicesLoading} />

			<button
				class="btn btn-secondary btn-sm"
				onclick={handleRefresh}
				disabled={refreshing || $isDevicesLoading}
			>
				{#if refreshing}
					<span class="loading-spinner"></span>
				{:else}
					<Icon name="refresh" size={14} />
				{/if}
				Refresh
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="filters">
		<!-- Search Row -->
		<div class="search-row">
			<div class="search-wrapper">
				<input
					type="text"
					class="input search-input"
					placeholder="Search devices... (try: ip=10.0.5, device=phone, mac=AA:BB)"
					value={$deviceFilters.search}
					oninput={handleSearch}
				/>
				{#if $deviceFilters.search}
					<button class="search-clear-btn" onclick={handleClearSearch} title="Clear search">
						×
					</button>
				{/if}
			</div>
		</div>

		<!-- Filter Row -->
		<div class="filter-row">
			<!-- Status Filter -->
			<div class="filter-group">
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'all'}
					onclick={() => handleStatusFilter('all')}
				>
					All
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'connected'}
					onclick={() => handleStatusFilter('connected')}
				>
					<span class="status-dot online"></span>
					Connected ({$deviceCounts.connected})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'disconnected'}
					onclick={() => handleStatusFilter('disconnected')}
				>
					Offline ({$deviceCounts.disconnected})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'blocked'}
					onclick={() => handleStatusFilter('blocked')}
				>
					<span class="status-dot danger"></span>
					Blocked ({$deviceCounts.blocked})
				</button>
			</div>

			<!-- Connection Type Filter -->
			<div class="filter-group">
				<button
					class="filter-btn"
					class:active={$deviceFilters.connectionType === 'all'}
					onclick={() => handleConnectionFilter('all')}
				>
					All Types
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.connectionType === 'wireless'}
					onclick={() => handleConnectionFilter('wireless')}
				>
					<Icon name="wifi" size={14} /> Wireless ({$deviceCounts.wireless})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.connectionType === 'wired'}
					onclick={() => handleConnectionFilter('wired')}
				>
					<Icon name="ethernet" size={14} /> Wired ({$deviceCounts.wired})
				</button>
			</div>

			<!-- Frequency Filter -->
			<div class="filter-group">
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === 'all'}
					onclick={() => handleFrequencyFilter('all')}
				>
					All Bands
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === '2.4GHz'}
					onclick={() => handleFrequencyFilter('2.4GHz')}
				>
					2.4 GHz ({$deviceCounts.freq24})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === '5GHz'}
					onclick={() => handleFrequencyFilter('5GHz')}
				>
					5 GHz ({$deviceCounts.freq5})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === '6GHz'}
					onclick={() => handleFrequencyFilter('6GHz')}
				>
					6 GHz ({$deviceCounts.freq6})
				</button>
			</div>
		</div>
	</div>

	<!-- Table -->
	<div class="table-section">
		{#if $filteredDevices.length === 0 && !$isDevicesLoading && hasActiveFilters}
			<EmptyState title="No devices match your filters.">
				{#snippet action()}
					<button class="btn btn-secondary btn-sm" onclick={clearFilters}>Clear filters</button>
				{/snippet}
			</EmptyState>
		{:else}
			<DataTable
				id="devices"
				columns={[
					{
						key: 'name',
						header: 'Device',
						required: true,
						sortable: true,
						accessor: (d) => d.display_name ?? '',
						render: nameCell
					},
					{
						key: 'ip',
						header: 'IP Address',
						sortable: true,
						accessor: (d) => ipSortKey(d.ip),
						render: ipCell
					},
					{
						key: 'mac',
						header: 'MAC Address',
						sortable: true,
						accessor: (d) => d.mac ?? '',
						render: macCell
					},
					{
						key: 'hostname',
						header: 'Hostname',
						sortable: true,
						visible: false,
						accessor: (d) => d.hostname ?? '',
						render: hostnameCell
					},
					{
						key: 'manufacturer',
						header: 'Manufacturer',
						sortable: true,
						visible: false,
						accessor: (d) => d.manufacturer ?? '',
						render: manufacturerCell
					},
					{
						key: 'deviceType',
						header: 'Device Type',
						sortable: true,
						visible: false,
						accessor: (d) => d.device_type ?? '',
						render: deviceTypeCell
					},
					{
						key: 'connection',
						header: 'Connection',
						sortable: true,
						accessor: (d) => d.connection_type ?? '',
						render: connectionCell
					},
					{
						key: 'signal',
						header: 'Signal',
						sortable: true,
						visible: false,
						accessor: (d) => (d.signal_strength != null ? -d.signal_strength : 100),
						render: signalCell
					},
					{
						key: 'frequency',
						header: 'Frequency',
						sortable: false,
						visible: false,
						render: frequencyCell
					},
					{
						key: 'connectedTo',
						header: 'Connected To',
						sortable: true,
						accessor: (d) => d.connected_to_eero ?? '',
						render: connectedToCell
					},
					{
						key: 'profile',
						header: 'Profile',
						sortable: true,
						visible: false,
						accessor: (d) => d.profile_name ?? '',
						render: profileCell
					},
					{
						key: 'lastActive',
						header: 'Last Active',
						sortable: true,
						visible: false,
						accessor: (d) => d.last_active ?? '',
						render: lastActiveCell
					},
					{
						key: 'status',
						header: 'Status',
						sortable: false,
						render: statusCell
					},
					{
						key: 'actions',
						header: 'Actions',
						required: true,
						align: 'right',
						render: actionsCell
					}
				] as DataTableColumn<DeviceSummary>[]}
				rows={$filteredDevices}
				getRowId={(d) => d.id || d.mac || ''}
				loading={$isDevicesLoading}
				emptyTitle="No devices found on this network."
				sortBy={toColumnKey($deviceFilters.sortBy)}
				sortDirection={$deviceFilters.sortOrder === 'asc' ? 'ascending' : 'descending'}
				onSort={handleSort}
				selectable={$selectionMode}
				selected={$selectedDevices}
				onSelectionChange={(s) => selectedDevices.set(s)}
				stickyHeader
				stickyActionsColumn
				rowClass={deviceRowClass}
				onVisibleColumnsChange={(v) => (visibleColumnKeys = v)}
			/>
		{/if}
	</div>
</div>

<style>
	.device-list-container {
		background-color: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}

	.header-left h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.header-right {
		display: flex;
		gap: var(--space-2);
	}

	.device-counts {
		display: flex;
		gap: var(--space-2);
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background-color: var(--color-bg-primary);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.search-row {
		display: flex;
		gap: var(--space-3);
	}

	.search-wrapper {
		flex: 1;
		position: relative;
		max-width: 500px;
	}

	.search-input {
		width: 100%;
		padding-right: 2.5rem;
	}

	.search-clear-btn {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg-tertiary);
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.search-clear-btn:hover {
		background: var(--color-danger);
		color: white;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.filter-group {
		display: flex;
		gap: var(--space-1);
		background-color: var(--color-bg-tertiary);
		border-radius: var(--radius-md);
		padding: 2px;
	}

	.filter-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		font-size: 0.8125rem;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.filter-btn:hover {
		color: var(--color-text-primary);
	}

	.filter-btn.active {
		background-color: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.table-section {
		padding: var(--space-2) var(--space-4) var(--space-4);
	}

	/* Row markup rendered by DataTable's `<tr class={rowClass(row)}>` (see DeviceList's
	   deviceRowClass) — :global() because DataTable, not this component, owns the element. */
	:global(.device-row.blocked) {
		opacity: 0.7;
	}

	:global(.device-row.disconnected) {
		opacity: 0.6;
	}

	:global(.device-row.selected) {
		background-color: var(--color-accent-muted, rgba(59, 130, 246, 0.1));
	}

	:global(.device-row.selected:hover) {
		background-color: var(--color-accent-muted, rgba(59, 130, 246, 0.15));
	}

	/* Cell content below is rendered via column `render` snippets declared in this component, so
	   (unlike the `<tr>` above) it compiles into this component's own scope and needs no
	   :global() — Svelte scopes a snippet's markup to wherever it's *declared*, not where it's
	   later `{@render}`-ed from. */
	.device-name-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 200px;
	}

	.name-info {
		display: flex;
		flex-direction: column;
	}

	.name {
		font-weight: 500;
	}

	.device-link {
		color: var(--color-text-primary);
		text-decoration: none;
		transition: color var(--transition-fast);
	}

	.device-link:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.manufacturer {
		font-size: 0.75rem;
	}

	.signal {
		font-size: 0.625rem;
		letter-spacing: -0.05em;
		color: var(--color-success);
	}

	@media (max-width: 768px) {
		.search-wrapper {
			max-width: none;
		}

		.filter-row {
			flex-direction: column;
		}

		.filter-group {
			flex-wrap: wrap;
		}
	}
</style>
