<!--
  ProfileDevicesSection

  Profile detail "Devices" section: block/list view toggle, the device-card grid and the
  DataTable list view. Extracted from routes/profiles/[id]/+page.svelte (WP5 decomposition).
  View mode and table sort are presentational state owned entirely by this component - nothing
  outside it ever reads them.
-->
<script lang="ts">
	import type { ProfileDevice } from '$api/types';
	import Icon from '$components/common/Icon.svelte';
	import { getDeviceTypeIcon } from '$lib/deviceIcons';
	import DataTable, {
		type DataTableColumn,
		type SortDirection
	} from '$components/common/DataTable.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';

	interface Props {
		devices: ProfileDevice[];
		deviceCount: number;
		loading: boolean;
		onPauseDevice: (device: ProfileDevice) => void;
		onGoToDevice: (device: ProfileDevice) => void;
		onRefresh: () => void;
	}

	let { devices, deviceCount, loading, onPauseDevice, onGoToDevice, onRefresh }: Props = $props();

	let viewMode: 'blocks' | 'list' = $state('blocks');

	// Default sort is name ascending (house rule - see lessons-learned.md); DataTable is driven
	// in controlled mode so the header reflects that default instead of only the data.
	let sortBy: string | null = $state('name');
	let sortDirection: SortDirection = $state('ascending');

	function handleSort(key: string | null, direction: SortDirection) {
		sortBy = key;
		sortDirection = direction;
	}

	function getDeviceKey(device: ProfileDevice, index: number): string {
		return device.id || device.mac || `device-${index}`;
	}
</script>

{#snippet deviceNameCell(device: ProfileDevice)}
	<div class="device-name-cell">
		<span class="device-icon-sm"
			><Icon name={getDeviceTypeIcon(null, device.wireless)} size={14} /></span
		>
		<div>
			<!--
				R2 (WP5 reviewer fix): the row itself has no onRowClick/role="button" any more
				(a nested interactive element inside an interactive row is invalid a11y). The device
				name is the click target instead, as a real button.
			-->
			<button type="button" class="device-name-link" onclick={() => onGoToDevice(device)}>
				{device.display_name || device.nickname || device.hostname || 'Unknown'}
			</button>
			{#if device.manufacturer}
				<span class="text-xs text-muted">{device.manufacturer}</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet deviceIpCell(device: ProfileDevice)}
	<span class="mono text-sm">{device.ip || '—'}</span>
{/snippet}

{#snippet deviceStatusCell(device: ProfileDevice)}
	{#if device.paused}
		<span class="badge badge-warning">Paused</span>
	{:else if device.connected}
		<span class="badge badge-success">Online</span>
	{:else}
		<span class="badge badge-muted">Offline</span>
	{/if}
{/snippet}

{#snippet deviceConnectionCell(device: ProfileDevice)}
	<span class="text-sm">
		<Icon name={device.wireless ? 'wifi' : 'ethernet'} size={14} />
		{device.wireless ? 'Wireless' : 'Wired'}
	</span>
{/snippet}

{#snippet deviceActionsCell(device: ProfileDevice)}
	<button
		class="btn btn-xs {device.paused ? 'btn-primary' : 'btn-warning'}"
		onclick={(e) => {
			e.stopPropagation();
			onPauseDevice(device);
		}}
	>
		{device.paused ? 'Resume' : 'Pause'}
	</button>
{/snippet}

<section class="devices-section">
	<div class="section-header">
		<h2>
			Devices ({devices.length}{deviceCount !== devices.length ? ` of ${deviceCount}` : ''})
		</h2>
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
	</div>

	{#if loading && devices.length === 0}
		<Skeleton variant="table-rows" rows={4} columns={5} />
	{:else if devices.length === 0}
		<EmptyState title="No devices found for this profile.">
			{#snippet action()}
				{#if deviceCount > 0}
					<p class="text-sm text-muted">
						This profile has {deviceCount} assigned devices, but they may not be in the current device
						cache.
					</p>
					<button class="btn btn-secondary btn-sm" onclick={onRefresh}> Refresh </button>
				{:else}
					<p class="text-sm text-muted">Assign devices to this profile using the Eero app.</p>
				{/if}
			{/snippet}
		</EmptyState>
	{:else if viewMode === 'blocks'}
		<!-- Block/Card View -->
		<div class="devices-grid">
			{#each devices as device, index (getDeviceKey(device, index))}
				<a
					href={device.id ? `/devices/${device.id}` : undefined}
					class="card device-card"
					class:paused={device.paused}
					class:offline={!device.connected}
					class:clickable={!!device.id}
				>
					<div class="device-header">
						<div class="device-info">
							<span class="device-icon"
								><Icon name={getDeviceTypeIcon(null, device.wireless)} size={20} /></span
							>
							<div>
								<h3>
									{device.display_name || device.nickname || device.hostname || 'Unknown Device'}
								</h3>
								<span class="text-sm text-muted mono">{device.ip || device.mac || '—'}</span>
							</div>
						</div>
						<div class="device-status">
							{#if device.paused}
								<span class="badge badge-warning">Paused</span>
							{:else if device.connected}
								<span class="status-dot online"></span>
							{:else}
								<span class="status-dot offline"></span>
							{/if}
						</div>
					</div>

					<div class="device-details">
						<div class="detail-row">
							<span class="label">Status</span>
							<span class="value">{device.connected ? 'Online' : 'Offline'}</span>
						</div>
						<div class="detail-row">
							<span class="label">Connection</span>
							<span class="value"
								><Icon name={device.wireless ? 'wifi' : 'ethernet'} size={14} />
								{device.wireless ? 'Wireless' : 'Wired'}</span
							>
						</div>
						{#if device.manufacturer}
							<div class="detail-row">
								<span class="label">Manufacturer</span>
								<span class="value">{device.manufacturer}</span>
							</div>
						{/if}
					</div>

					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div class="device-actions" onclick={(e) => e.stopPropagation()}>
						<button
							class="btn btn-sm {device.paused ? 'btn-primary' : 'btn-warning'}"
							onclick={(e) => {
								e.preventDefault();
								onPauseDevice(device);
							}}
						>
							{device.paused ? '▶ Resume' : '⏸ Pause'}
						</button>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="card devices-list">
			<DataTable
				id="profile-devices"
				columns={[
					{
						key: 'name',
						header: 'Device',
						required: true,
						sortable: true,
						accessor: (d) => (d.display_name || d.nickname || d.hostname || '').toLowerCase(),
						render: deviceNameCell
					},
					{
						key: 'ip',
						header: 'IP Address',
						sortable: true,
						accessor: (d) => d.ip ?? '',
						render: deviceIpCell
					},
					{
						key: 'status',
						header: 'Status',
						sortable: true,
						accessor: (d) => (d.paused ? 'paused' : d.connected ? 'online' : 'offline'),
						render: deviceStatusCell
					},
					{
						key: 'connection',
						header: 'Connection',
						sortable: true,
						accessor: (d) => (d.wireless ? 'wireless' : 'wired'),
						render: deviceConnectionCell
					},
					{
						key: 'actions',
						header: 'Actions',
						required: true,
						align: 'right',
						render: deviceActionsCell
					}
				] as DataTableColumn<ProfileDevice>[]}
				rows={devices}
				getRowId={(d) => d.id || d.mac || ''}
				emptyTitle="No devices found for this profile."
				{sortBy}
				{sortDirection}
				onSort={handleSort}
				rowClass={(d) => {
					const classes = ['profile-device-row'];
					if (d.paused) classes.push('paused');
					if (!d.connected) classes.push('offline');
					return classes.join(' ');
				}}
			/>
		</div>
	{/if}
</section>

<style>
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.section-header h2 {
		font-size: 1rem;
		margin: 0;
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

	.devices-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-4);
	}

	.device-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		text-decoration: none;
		color: inherit;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}

	.device-card.clickable {
		cursor: pointer;
	}

	.device-card.clickable:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-color: var(--color-accent);
	}

	.device-card.paused {
		border-color: var(--color-warning);
		opacity: 0.7;
	}

	.device-card.offline {
		opacity: 0.6;
	}

	.device-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.device-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.device-icon {
		font-size: 1.5rem;
	}

	.device-info h3 {
		margin: 0;
		font-size: 0.9375rem;
	}

	.device-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
	}

	.label {
		color: var(--color-text-secondary);
	}

	.value {
		font-weight: 500;
	}

	.device-actions {
		display: flex;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	.device-actions .btn {
		flex: 1;
	}

	.btn-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	.btn-warning:hover:not(:disabled) {
		background-color: #e0a820;
	}

	.devices-list {
		overflow-x: auto;
	}

	/* `<tr class="profile-device-row paused offline">` is DataTable's own element (rowClass
	   hook), so it needs :global() - cell content above is rendered via `render` snippets
	   declared in this file and is scoped normally.

	   A7 (WP5 a11y fix): dim the row's non-text cells only, not the status badge itself - a
	   dimmed badge combines with its already-thin light-mode contrast margin (see A8) to become
	   unreadable. Excluding the `status` column keeps the badge at full opacity while still
	   visually de-emphasizing the rest of the row. */
	:global(.profile-device-row.paused td:not(:has(.badge))) {
		opacity: 0.7;
	}

	:global(.profile-device-row.offline td:not(:has(.badge))) {
		opacity: 0.6;
	}

	.device-name-cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.device-name-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 500;
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
	}

	.device-name-link:hover,
	.device-name-link:focus-visible {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.device-icon-sm {
		font-size: 1.25rem;
	}

	.device-name-cell div {
		display: flex;
		flex-direction: column;
	}

	.btn-xs {
		padding: var(--space-1) var(--space-2);
		font-size: 0.75rem;
	}

	.badge-success {
		background-color: var(--color-success);
		color: white;
	}

	.badge-muted {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
	}

	.badge-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}
</style>
