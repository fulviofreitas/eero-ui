<!--
  Device List Component

  Main device listing with filtering and search. Table itself is DataTable
  (phase-6.0-revamp.md § 6.2 Tier 2) — sort, column visibility, sticky header/actions column and
  keyboard-accessible `aria-sort` headers all come from there now. This component keeps the
  field-scoped search, the three filter groups with live counts, bulk selection, and export,
  which are all orthogonal to how the table itself renders.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		devicesStore,
		deviceFilters,
		filteredDevices,
		deviceCounts,
		isDevicesLoading,
		selectionMode,
		selectedDevices,
		toggleSelectionMode,
		clearSelection,
		hasDeviceFilterParams,
		deviceFiltersToSearchParams,
		deviceFiltersFromSearchParams,
		deviceFiltersFromStorage,
		defaultDeviceFilters,
		DEVICE_FILTERS_STORAGE_KEY
	} from '$stores';
	import type { DeviceSummary } from '$api/types';
	import { api } from '$api/client';
	import { uiStore } from '$stores';
	import DataTable, {
		type DataTableColumn,
		type SortDirection
	} from '$components/common/DataTable.svelte';
	import VirtualBody from '$components/common/VirtualBody.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import DeviceRow from './DeviceRow.svelte';
	import ExportMenu from '$components/common/ExportMenu.svelte';
	import Icon from '$components/common/Icon.svelte';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import Dropdown, { type DropdownItem } from '$components/common/Dropdown.svelte';

	/** Above this many filtered rows, DataTable renders VirtualBody instead of its own `<tbody>`. */
	const VIRTUALIZE_THRESHOLD = 60;

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
		deviceFilters.set({ ...defaultDeviceFilters });
	}

	// --- URL-encoded, debounced, persisted filters (WP9 § 6.2 Tier 3) -----------------------
	//
	// Initial state prefers the URL (so a shared/bookmarked link wins) and falls back to
	// localStorage, then the plain defaults. Every subsequent change to `$deviceFilters` -
	// whichever UI control caused it - is mirrored back to both, debounced by 250ms so a fast
	// typist in the search box doesn't spam `goto()`/localStorage on every keystroke.

	let filtersInitialized = false;
	let syncTimer: ReturnType<typeof setTimeout> | undefined;

	function loadInitialFilters(): typeof $deviceFilters {
		const url = get(page).url;
		if (hasDeviceFilterParams(url.searchParams)) {
			return deviceFiltersFromSearchParams(url.searchParams);
		}
		if (typeof localStorage !== 'undefined') {
			return deviceFiltersFromStorage(localStorage.getItem(DEVICE_FILTERS_STORAGE_KEY));
		}
		return { ...defaultDeviceFilters };
	}

	$effect(() => {
		const filters = $deviceFilters;
		if (!filtersInitialized) return; // skip the initial store value - nothing to sync yet

		clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			// String concatenation, not `new URL(...)` - the eslint svelte/prefer-svelte-reactivity
			// rule flags mutable URL instances in components, and there's nothing reactive to gain
			// here anyway (this is a one-shot target string for `goto`).
			const params = deviceFiltersToSearchParams(filters);
			const search = params.toString();
			const pathname = get(page).url.pathname;
			goto(search ? `${pathname}?${search}` : pathname, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});

			if (typeof localStorage !== 'undefined') {
				try {
					localStorage.setItem(DEVICE_FILTERS_STORAGE_KEY, JSON.stringify(filters));
				} catch {
					// Storage can be unavailable (private mode quota, etc.) - filters just won't persist.
				}
			}
		}, 250);
	});

	onDestroy(() => clearTimeout(syncTimer));

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

	let bulkActionRunning = $state(false);

	function deviceLabel(id: string): string {
		const device = $filteredDevices.find((d) => d.id === id);
		if (!device) return id;
		return device.display_name || device.nickname || device.hostname || device.mac || id;
	}

	function summarizeBulkResult(
		verb: string,
		result: { ok: string[]; failed: { id: string; message: string }[] }
	): void {
		if (result.failed.length === 0) {
			uiStore.success(`${verb} ${result.ok.length} device(s).`);
			return;
		}
		const names = result.failed.map((f) => deviceLabel(f.id)).join(', ');
		uiStore.warning(`${verb} ${result.ok.length}, failed ${result.failed.length}: ${names}`, 8000);
	}

	/**
	 * Bulk block (WP9 § 6.2 Tier 3). Pessimistic and unverified, same as the single-device path
	 * (plan § 5 / devicesStore.blockDevice) - runs sequentially so each row's own busy/rollback
	 * behaviour still applies, and confirms once up front rather than once per device.
	 */
	function handleBulkBlock() {
		if (selectedCount === 0) return;
		const ids = Array.from($selectedDevices);

		uiStore.confirm({
			title: 'Block Devices',
			message: `Block ${ids.length} selected device(s)? Each will be disconnected from the network.`,
			details: [
				'Blocking is not verified end-to-end by the eero SDK - the change is not rolled back ' +
					'automatically here, so confirm the devices show as blocked afterwards.'
			],
			confirmText: `Block ${ids.length} Device(s)`,
			danger: true,
			onConfirm: async () => {
				bulkActionRunning = true;
				try {
					const result = await devicesStore.blockMany(ids);
					summarizeBulkResult('Blocked', result);
					clearSelection();
				} finally {
					bulkActionRunning = false;
				}
			}
		});
	}

	/** Bulk unblock. Verified (plan § 5) - still confirmed once, since it affects several devices at once. */
	function handleBulkUnblock() {
		if (selectedCount === 0) return;
		const ids = Array.from($selectedDevices);

		uiStore.confirm({
			title: 'Unblock Devices',
			message: `Unblock ${ids.length} selected device(s)?`,
			confirmText: `Unblock ${ids.length} Device(s)`,
			onConfirm: async () => {
				bulkActionRunning = true;
				try {
					const result = await devicesStore.unblockMany(ids);
					summarizeBulkResult('Unblocked', result);
					clearSelection();
				} finally {
					bulkActionRunning = false;
				}
			}
		});
	}

	// Prefetch profiles as soon as there's a selection to assign, so the Dropdown's item list is
	// ready (not empty) by the time the user opens it - Dropdown itself has no "on open" hook.
	$effect(() => {
		if ($selectionMode && selectedCount > 0) {
			loadProfiles();
		}
	});

	onMount(() => {
		deviceFilters.set(loadInitialFilters());
		filtersInitialized = true;
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

<!--
  Virtualized body (WP9 § 6.2 Tier 4). Only above VIRTUALIZE_THRESHOLD rows - small lists keep
  DataTable's own <tbody> with `animate:flip`, since a virtual list recycles DOM nodes across
  unrelated rows (a "move" there would flip the wrong row - see DataTable's `virtualized` prop
  doc comment). Declared as a snippet inside DeviceList's own scope (not a prop DataTable passes
  values into) so it can close over the same selection state/store callbacks the non-virtualized
  path already uses, without DataTable's `body` escape hatch needing to know anything about
  selection.
-->
{#snippet virtualDeviceBody({
	rows,
	columns
}: {
	rows: DeviceSummary[];
	columns: DataTableColumn<DeviceSummary>[];
})}
	<VirtualBody
		{rows}
		{columns}
		getRowId={(d) => d.id || d.mac || ''}
		selectable={$selectionMode}
		selected={$selectedDevices}
		onSelectionChange={(s) => selectedDevices.set(s)}
		rowClass={deviceRowClass}
	/>
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

				<button
					class="btn btn-danger btn-sm"
					onclick={handleBulkBlock}
					disabled={bulkActionRunning}
				>
					<Icon name="x" size={14} /> Block selected
				</button>
				<button
					class="btn btn-secondary btn-sm"
					onclick={handleBulkUnblock}
					disabled={bulkActionRunning}
				>
					<Icon name="check" size={14} /> Unblock selected
				</button>
			{/if}

			<!-- Reset filters -->
			{#if hasActiveFilters}
				<button class="btn btn-secondary btn-sm" onclick={clearFilters}>
					<Icon name="x" size={14} /> Reset filters
				</button>
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
					aria-label="Search devices"
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
				virtualized={$filteredDevices.length > VIRTUALIZE_THRESHOLD}
				body={$filteredDevices.length > VIRTUALIZE_THRESHOLD ? virtualDeviceBody : undefined}
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
		flex-wrap: wrap;
		gap: var(--space-3);
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.header-left {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.header-left h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.header-right {
		display: flex;
		flex-wrap: wrap;
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
	   deviceRowClass) — :global() because DataTable, not this component, owns the element.

	   Dimming is applied per-<td> (via DataTable's data-col attribute), not on the <tr> itself:
	   CSS opacity composites an element and its whole subtree as one group, so a child's own
	   opacity can never "undo" an ancestor's — a status badge inside an opacity:0.6 row would
	   always render at 0.6 regardless of its own opacity. Excluding the status cell from the
	   dimmed selector keeps it legible at a glance for blocked/offline devices. */
	:global(.device-row.blocked td) {
		opacity: 0.7;
	}

	:global(.device-row.disconnected td) {
		opacity: 0.6;
	}

	:global(.device-row.blocked td[data-col='status']),
	:global(.device-row.disconnected td[data-col='status']) {
		opacity: 1;
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
