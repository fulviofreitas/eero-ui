<!--
  Device Row Component
  
  Displays a single device in the device list with actions.
-->
<script lang="ts">
	import type { DeviceSummary } from '$api/types';
	import {
		devicesStore,
		uiStore,
		columnVisibility,
		selectionMode,
		selectedDevices,
		toggleDeviceSelection
	} from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import Icon from '$components/common/Icon.svelte';

	export let device: DeviceSummary;

	// Use the store directly for column visibility
	$: isVisible = (columnId: string): boolean => {
		return $columnVisibility[columnId as keyof typeof $columnVisibility] ?? false;
	};

	// Selection state
	$: isSelected = device.id ? $selectedDevices.has(device.id) : false;

	function handleSelect() {
		if (device.id) {
			toggleDeviceSelection(device.id);
		}
	}

	let actionMenuOpen = false;
	let loading = false;

	$: displayName =
		device.display_name || device.nickname || device.hostname || device.mac || 'Unknown Device';
	$: statusLabel = device.blocked ? 'blocked' : device.connected ? 'connected' : 'disconnected';

	function toggleActionMenu() {
		actionMenuOpen = !actionMenuOpen;
	}

	function closeActionMenu() {
		actionMenuOpen = false;
	}

	async function handleBlock() {
		if (!device.id) return;
		closeActionMenu();

		uiStore.confirm({
			title: 'Block Device',
			message: `Are you sure you want to block "${displayName}"? This device will be disconnected from the network.`,
			details: [
				'Blocking a device is not verified end-to-end by the eero SDK - the change is not ' +
					'rolled back automatically here, so confirm the device shows as blocked afterwards.'
			],
			confirmText: 'Block Device',
			danger: true,
			onConfirm: async () => {
				loading = true;
				try {
					await devicesStore.blockDevice(device.id!);
					uiStore.success(`${displayName} has been blocked.`);
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : 'Failed to block device');
				} finally {
					loading = false;
				}
			}
		});
	}

	async function handleUnblock() {
		if (!device.id) return;
		closeActionMenu();

		try {
			loading = true;
			await devicesStore.unblockDevice(device.id);
			uiStore.success(`${displayName} has been unblocked.`);
		} catch (error) {
			uiStore.error(error instanceof Error ? error.message : 'Failed to unblock device');
		} finally {
			loading = false;
		}
	}

	function handleRename() {
		closeActionMenu();
		const newName = prompt('Enter new name:', device.nickname || device.hostname || '');
		if (newName && device.id) {
			devicesStore
				.setNickname(device.id, newName)
				.then(() => uiStore.success('Device renamed successfully.'))
				.catch((error) => uiStore.error(error.message));
		}
	}

	function getSignalIcon(strength: number | null): string {
		if (strength === null) return '━';
		if (strength >= -50) return '▂▄▆█';
		if (strength >= -60) return '▂▄▆░';
		if (strength >= -70) return '▂▄░░';
		return '▂░░░';
	}
</script>

<tr
	class="device-row"
	class:blocked={device.blocked}
	class:disconnected={!device.connected}
	class:selected={isSelected}
>
	<!-- Selection checkbox (only in selection mode) -->
	{#if $selectionMode}
		<td class="select-cell">
			<input type="checkbox" checked={isSelected} on:change={handleSelect} />
		</td>
	{/if}

	<!-- Status & Name -->
	{#if isVisible('name')}
		<td class="device-name">
			<div class="device-name-wrapper">
				<span
					class="status-dot"
					class:online={device.connected && !device.blocked}
					class:offline={!device.connected}
					class:danger={device.blocked}
				></span>
				<div class="name-info">
					{#if device.id}
						<a href="/devices/{device.id}" class="name device-link">{displayName}</a>
					{:else}
						<span class="name">{displayName}</span>
					{/if}
					{#if !isVisible('manufacturer') && device.manufacturer}
						<span class="manufacturer text-muted text-xs">{device.manufacturer}</span>
					{/if}
				</div>
			</div>
		</td>
	{/if}

	<!-- IP Address -->
	{#if isVisible('ip')}
		<td class="mono text-sm">
			{device.ip || '—'}
		</td>
	{/if}

	<!-- MAC Address -->
	{#if isVisible('mac')}
		<td class="mono text-sm text-muted">
			{device.mac || '—'}
		</td>
	{/if}

	<!-- Hostname -->
	{#if isVisible('hostname')}
		<td class="text-sm">
			{device.hostname || '—'}
		</td>
	{/if}

	<!-- Manufacturer -->
	{#if isVisible('manufacturer')}
		<td class="text-sm">
			{device.manufacturer || '—'}
		</td>
	{/if}

	<!-- Device Type -->
	{#if isVisible('deviceType')}
		<td class="text-sm">
			{device.device_type || '—'}
		</td>
	{/if}

	<!-- Connection Type -->
	{#if isVisible('connection')}
		<td class="text-sm">
			{#if device.connected}
				<Icon name={device.wireless ? 'wifi' : 'ethernet'} size={14} />
				{device.wireless ? 'Wireless' : 'Wired'}
			{:else}
				<span class="text-muted">—</span>
			{/if}
		</td>
	{/if}

	<!-- Signal Strength -->
	{#if isVisible('signal')}
		<td>
			{#if device.connected && device.wireless && device.signal_strength}
				<span class="signal mono" title="{device.signal_strength} dBm">
					{getSignalIcon(device.signal_strength)}
					{device.signal_strength} dBm
				</span>
			{:else}
				<span class="text-muted">—</span>
			{/if}
		</td>
	{/if}

	<!-- Frequency -->
	{#if isVisible('frequency')}
		<td class="text-sm">
			{#if device.frequency}
				<span class="badge badge-neutral">{device.frequency}</span>
			{:else}
				<span class="text-muted">—</span>
			{/if}
		</td>
	{/if}

	<!-- Connected To -->
	{#if isVisible('connectedTo')}
		<td class="text-sm">
			{device.connected_to_eero || '—'}
		</td>
	{/if}

	<!-- Profile -->
	{#if isVisible('profile')}
		<td class="text-sm">
			{device.profile_name || '—'}
		</td>
	{/if}

	<!-- Last Active -->
	{#if isVisible('lastActive')}
		<td class="text-sm text-muted">
			{#if device.last_active}
				{new Date(device.last_active).toLocaleString()}
			{:else}
				—
			{/if}
		</td>
	{/if}

	<!-- Status -->
	{#if isVisible('status')}
		<td>
			<StatusBadge status={statusLabel} size="sm" />
		</td>
	{/if}

	<!-- Actions - Always visible -->
	<td class="actions-cell">
		<div class="action-menu-wrapper">
			<button
				class="btn btn-ghost btn-sm action-btn"
				on:click={toggleActionMenu}
				disabled={loading}
				aria-label="Device actions"
			>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					<Icon name="more-vertical" />
				{/if}
			</button>

			{#if actionMenuOpen}
				<div class="action-menu" on:mouseleave={closeActionMenu} role="menu" tabindex="-1">
					<button class="action-item" on:click={handleRename} role="menuitem">
						<Icon name="edit" size={14} /> Rename
					</button>
					{#if device.blocked}
						<button class="action-item" on:click={handleUnblock} role="menuitem">
							<Icon name="check" size={14} /> Unblock
						</button>
					{:else}
						<button class="action-item danger" on:click={handleBlock} role="menuitem">
							<Icon name="x" size={14} /> Block
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</td>
</tr>

<style>
	.device-row {
		transition: background-color var(--transition-fast);
	}

	.device-row:hover {
		background-color: var(--color-bg-tertiary);
	}

	.device-row.blocked {
		opacity: 0.7;
	}

	.device-row.disconnected {
		opacity: 0.6;
	}

	.device-row.selected {
		background-color: var(--color-accent-muted, rgba(59, 130, 246, 0.1));
	}

	.device-row.selected:hover {
		background-color: var(--color-accent-muted, rgba(59, 130, 246, 0.15));
	}

	.select-cell {
		width: 40px;
		text-align: center;
	}

	.select-cell input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
		accent-color: var(--color-accent);
	}

	.device-name {
		min-width: 200px;
	}

	.device-name-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-3);
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

	.connection-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.connection-type {
		font-size: 0.8125rem;
	}

	.signal {
		font-size: 0.625rem;
		letter-spacing: -0.05em;
		color: var(--color-success);
	}

	.actions-cell {
		width: 60px;
		text-align: right;
		position: sticky;
		right: 0;
		background-color: var(--color-bg-secondary);
		z-index: var(--z-base);
	}

	.device-row:hover .actions-cell {
		background-color: var(--color-bg-tertiary);
	}

	.action-menu-wrapper {
		position: relative;
		display: inline-block;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 1.25rem;
	}

	.action-menu {
		position: absolute;
		right: 0;
		top: 100%;
		background-color: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		min-width: 140px;
		z-index: var(--z-dropdown);
		overflow: hidden;
	}

	.action-item {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		background: none;
		border: none;
		color: var(--color-text-primary);
		cursor: pointer;
		font-size: 0.875rem;
	}

	.action-item:hover {
		background-color: var(--color-bg-tertiary);
	}

	.action-item.danger {
		color: var(--color-danger);
	}

	.loading-spinner {
		width: 14px;
		height: 14px;
	}

	td {
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
		vertical-align: middle;
	}
</style>
