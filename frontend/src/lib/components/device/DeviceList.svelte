<!--
  Device List Component
  
  Main device listing with filtering and search.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		devicesStore,
		deviceFilters,
		filteredDevices,
		deviceCounts,
		isDevicesLoading,
		columnVisibility,
		toggleColumn as toggleColumnStore,
		selectionMode,
		selectedDevices,
		toggleSelectionMode,
		selectAllDevices,
		clearSelection
	} from '$stores';
	import type { ColumnVisibility } from '$stores/devices';
	import { api } from '$api/client';
	import { uiStore } from '$stores';
	import DeviceRow from './DeviceRow.svelte';

	let refreshing = false;
	let columnSelectorOpen = false;
	let profileSelectorOpen = false;
	let profiles: { id: string; name: string }[] = [];
	let loadingProfiles = false;
	let assigningProfile = false;

	// Column definitions - all available columns (Actions is always shown, not in selector)
	const allColumns: {
		id: keyof ColumnVisibility;
		label: string;
		required: boolean;
		sortable: boolean;
		sortKey?: string;
	}[] = [
		{ id: 'name', label: 'Device', required: true, sortable: true, sortKey: 'name' },
		{ id: 'ip', label: 'IP Address', required: false, sortable: true, sortKey: 'ip' },
		{ id: 'mac', label: 'MAC Address', required: false, sortable: true, sortKey: 'mac' },
		{ id: 'hostname', label: 'Hostname', required: false, sortable: true, sortKey: 'hostname' },
		{
			id: 'manufacturer',
			label: 'Manufacturer',
			required: false,
			sortable: true,
			sortKey: 'manufacturer'
		},
		{
			id: 'deviceType',
			label: 'Device Type',
			required: false,
			sortable: true,
			sortKey: 'deviceType'
		},
		{
			id: 'connection',
			label: 'Connection Type',
			required: false,
			sortable: true,
			sortKey: 'connection'
		},
		{ id: 'signal', label: 'Signal Strength', required: false, sortable: true, sortKey: 'signal' },
		{ id: 'frequency', label: 'Frequency', required: false, sortable: false },
		{
			id: 'connectedTo',
			label: 'Connected To',
			required: false,
			sortable: true,
			sortKey: 'connectedTo'
		},
		{ id: 'profile', label: 'Profile', required: false, sortable: true, sortKey: 'profile' },
		{
			id: 'lastActive',
			label: 'Last Active',
			required: false,
			sortable: true,
			sortKey: 'last_active'
		},
		{ id: 'status', label: 'Status', required: false, sortable: false }
	];

	function handleToggleColumn(columnId: keyof ColumnVisibility) {
		const column = allColumns.find((c) => c.id === columnId);
		if (column?.required) return; // Can't toggle required columns
		toggleColumnStore(columnId);
	}

	// Selection mode helpers
	$: selectedCount = $selectedDevices.size;
	$: allSelected =
		$filteredDevices.length > 0 &&
		$filteredDevices.every((d) => d.id && $selectedDevices.has(d.id));

	function handleSelectAll() {
		if (allSelected) {
			clearSelection();
		} else {
			const ids = $filteredDevices.map((d) => d.id).filter((id): id is string => !!id);
			selectAllDevices(ids);
		}
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

	async function assignToProfile(profileId: string, profileName: string) {
		if (selectedCount === 0) return;

		assigningProfile = true;

		try {
			// Note: This would require a backend endpoint to assign devices to profiles
			// For now, show a message about the feature
			uiStore.success(
				`Would assign ${selectedCount} device(s) to "${profileName}". (API endpoint needed)`
			);
			profileSelectorOpen = false;
			toggleSelectionMode();
		} catch (_error) {
			uiStore.error('Failed to assign devices to profile');
		} finally {
			assigningProfile = false;
		}
	}

	onMount(() => {
		devicesStore.fetch();

		// Close column selector when clicking outside
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as HTMLElement;
			if (!target.closest('.column-selector')) {
				columnSelectorOpen = false;
			}
		}

		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
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

	function handleSort(sortBy: typeof $deviceFilters.sortBy) {
		deviceFilters.update((f) => ({
			...f,
			sortBy,
			sortOrder: f.sortBy === sortBy && f.sortOrder === 'asc' ? 'desc' : 'asc'
		}));
	}
</script>

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
				on:click={toggleSelectionMode}
			>
				{#if $selectionMode}
					✕ Cancel Selection
				{:else}
					☑ Select
				{/if}
			</button>

			<!-- Profile Assignment (only in selection mode) -->
			{#if $selectionMode && selectedCount > 0}
				<div class="profile-selector">
					<button
						class="btn btn-primary btn-sm"
						on:click={() => {
							profileSelectorOpen = !profileSelectorOpen;
							loadProfiles();
						}}
						disabled={assigningProfile}
					>
						📁 Assign to Profile ({selectedCount})
					</button>
					{#if profileSelectorOpen}
						<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
						<div class="profile-dropdown" on:click|stopPropagation>
							<div class="profile-dropdown-header">
								<span class="text-sm text-muted">Select Profile</span>
							</div>
							{#if loadingProfiles}
								<div class="profile-loading">
									<span class="loading-spinner"></span>
									Loading profiles...
								</div>
							{:else if profiles.length === 0}
								<div class="profile-empty">No profiles available</div>
							{:else}
								{#each profiles as profile}
									<button
										class="profile-option"
										on:click={() => assignToProfile(profile.id, profile.name)}
									>
										{profile.name}
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Column Selector -->
			<div class="column-selector">
				<button
					class="btn btn-secondary btn-sm"
					on:click={() => (columnSelectorOpen = !columnSelectorOpen)}
				>
					⚙ Columns
				</button>
				{#if columnSelectorOpen}
					<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
					<div class="column-dropdown" on:click|stopPropagation>
						<div class="column-dropdown-header">
							<span class="text-sm text-muted">Show/Hide Columns</span>
						</div>
						{#each allColumns as column}
							<label class="column-option" class:disabled={column.required}>
								<input
									type="checkbox"
									checked={$columnVisibility[column.id]}
									disabled={column.required}
									on:change={() => handleToggleColumn(column.id)}
								/>
								<span>{column.label}</span>
								{#if column.required}
									<span class="required-badge">Required</span>
								{/if}
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<button
				class="btn btn-secondary btn-sm"
				on:click={handleRefresh}
				disabled={refreshing || $isDevicesLoading}
			>
				{#if refreshing}
					<span class="loading-spinner"></span>
				{:else}
					↻
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
					on:input={handleSearch}
				/>
				{#if $deviceFilters.search}
					<button class="search-clear-btn" on:click={handleClearSearch} title="Clear search">
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
					on:click={() => handleStatusFilter('all')}
				>
					All
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'connected'}
					on:click={() => handleStatusFilter('connected')}
				>
					<span class="status-dot online"></span>
					Connected ({$deviceCounts.connected})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'disconnected'}
					on:click={() => handleStatusFilter('disconnected')}
				>
					Offline ({$deviceCounts.disconnected})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.status === 'blocked'}
					on:click={() => handleStatusFilter('blocked')}
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
					on:click={() => handleConnectionFilter('all')}
				>
					All Types
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.connectionType === 'wireless'}
					on:click={() => handleConnectionFilter('wireless')}
				>
					📶 Wireless ({$deviceCounts.wireless})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.connectionType === 'wired'}
					on:click={() => handleConnectionFilter('wired')}
				>
					🔌 Wired ({$deviceCounts.wired})
				</button>
			</div>

			<!-- Frequency Filter -->
			<div class="filter-group">
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === 'all'}
					on:click={() => handleFrequencyFilter('all')}
				>
					All Bands
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === '2.4GHz'}
					on:click={() => handleFrequencyFilter('2.4GHz')}
				>
					2.4 GHz ({$deviceCounts.freq24})
				</button>
				<button
					class="filter-btn"
					class:active={$deviceFilters.frequency === '5GHz'}
					on:click={() => handleFrequencyFilter('5GHz')}
				>
					5 GHz ({$deviceCounts.freq5})
				</button>
			</div>
		</div>
	</div>

	<!-- Table -->
	<div class="table-wrapper">
		{#if $isDevicesLoading && $filteredDevices.length === 0}
			<!-- Loading skeleton -->
			<div class="loading-container">
				<span class="loading-spinner"></span>
				<span>Loading devices...</span>
			</div>
		{:else if $filteredDevices.length === 0}
			<!-- Empty state -->
			<div class="empty-state">
				{#if $deviceFilters.search || $deviceFilters.status !== 'all' || $deviceFilters.connectionType !== 'all' || $deviceFilters.frequency !== 'all'}
					<p>No devices match your filters.</p>
					<button
						class="btn btn-secondary btn-sm"
						on:click={() =>
							deviceFilters.set({
								search: '',
								status: 'all',
								connectionType: 'all',
								frequency: 'all',
								sortBy: 'name',
								sortOrder: 'asc'
							})}
					>
						Clear filters
					</button>
				{:else}
					<p>No devices found on this network.</p>
				{/if}
			</div>
		{:else}
			<table class="table device-table">
				<thead>
					<tr>
						<!-- Selection checkbox (only in selection mode) -->
						{#if $selectionMode}
							<th class="select-header">
								<input
									type="checkbox"
									checked={allSelected}
									on:change={handleSelectAll}
									title="Select all"
								/>
							</th>
						{/if}
						{#if $columnVisibility.name}
							<th class="sortable" on:click={() => handleSort('name')}>
								Device
								{#if $deviceFilters.sortBy === 'name'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.ip}
							<th class="sortable" on:click={() => handleSort('ip')}>
								IP Address
								{#if $deviceFilters.sortBy === 'ip'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.mac}
							<th class="sortable" on:click={() => handleSort('mac')}>
								MAC Address
								{#if $deviceFilters.sortBy === 'mac'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.hostname}
							<th class="sortable" on:click={() => handleSort('hostname')}>
								Hostname
								{#if $deviceFilters.sortBy === 'hostname'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.manufacturer}
							<th class="sortable" on:click={() => handleSort('manufacturer')}>
								Manufacturer
								{#if $deviceFilters.sortBy === 'manufacturer'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.deviceType}
							<th class="sortable" on:click={() => handleSort('deviceType')}>
								Device Type
								{#if $deviceFilters.sortBy === 'deviceType'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.connection}
							<th class="sortable" on:click={() => handleSort('connection')}>
								Connection
								{#if $deviceFilters.sortBy === 'connection'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.signal}
							<th class="sortable" on:click={() => handleSort('signal')}>
								Signal
								{#if $deviceFilters.sortBy === 'signal'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.frequency}
							<th>Frequency</th>
						{/if}
						{#if $columnVisibility.connectedTo}
							<th class="sortable" on:click={() => handleSort('connectedTo')}>
								Connected To
								{#if $deviceFilters.sortBy === 'connectedTo'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.profile}
							<th class="sortable" on:click={() => handleSort('profile')}>
								Profile
								{#if $deviceFilters.sortBy === 'profile'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.lastActive}
							<th class="sortable" on:click={() => handleSort('last_active')}>
								Last Active
								{#if $deviceFilters.sortBy === 'last_active'}
									<span class="sort-indicator"
										>{$deviceFilters.sortOrder === 'asc' ? '↑' : '↓'}</span
									>
								{/if}
							</th>
						{/if}
						{#if $columnVisibility.status}
							<th>Status</th>
						{/if}
						<!-- Actions always visible -->
						<th class="actions-header">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each $filteredDevices as device (device.id || device.mac)}
						<DeviceRow {device} />
					{/each}
				</tbody>
			</table>
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

	.column-selector,
	.profile-selector {
		position: relative;
	}

	.profile-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-1);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 200px;
		z-index: 100;
	}

	.profile-dropdown-header {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.profile-option {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-primary);
		transition: background-color var(--transition-fast);
	}

	.profile-option:hover {
		background-color: var(--color-bg-primary);
	}

	.profile-loading,
	.profile-empty {
		padding: var(--space-3);
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.profile-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
	}

	.select-header {
		width: 40px;
		text-align: center;
	}

	.select-header input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
		accent-color: var(--color-accent);
	}

	.column-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-1);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 200px;
		z-index: 100;
	}

	.column-dropdown-header {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.column-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.column-option:hover {
		background-color: var(--color-bg-primary);
	}

	.column-option.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.column-option input[type='checkbox'] {
		accent-color: var(--color-accent);
	}

	.required-badge {
		margin-left: auto;
		font-size: 0.625rem;
		padding: 1px 4px;
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
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
		transition: all var(--transition-fast);
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
		transition: all var(--transition-fast);
	}

	.filter-btn:hover {
		color: var(--color-text-primary);
	}

	.filter-btn.active {
		background-color: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.table-wrapper {
		overflow-x: auto;
		overflow-y: visible;
	}

	.device-table {
		width: 100%;
		min-width: max-content;
	}

	.device-table th {
		background-color: var(--color-bg-primary);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.sortable {
		cursor: pointer;
		user-select: none;
	}

	.sortable:hover {
		color: var(--color-text-primary);
	}

	.sort-indicator {
		margin-left: var(--space-1);
		font-size: 0.75rem;
	}

	.actions-header {
		width: 60px;
		text-align: right;
		position: sticky;
		right: 0;
		background-color: var(--color-bg-primary);
		z-index: 2;
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--color-text-secondary);
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
