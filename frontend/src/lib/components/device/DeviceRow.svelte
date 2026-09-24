<!--
  Device Row Actions

  Was the full `<tr>` for a device (13 hand-rolled `<td>`s plus this menu). DeviceList now
  delegates row/cell rendering to DataTable (see phase-6.0-revamp.md § 6.2 Tier 2), which owns
  the `<tr>` and every visible column via `DataTableColumn.render` snippets defined in
  DeviceList.svelte. This component's only remaining job is the per-row action menu
  (rename/block/unblock), rendered as the "actions" column's `render` snippet — the one piece of
  row behaviour too stateful (loading, open/closed, confirm dialogs) to inline as a snippet.

  The mouseleave-only close is a known, pre-existing accessibility gap (phase-6.0-revamp.md
  § 6.1: "closes on mouseleave only") — left as-is here; converting every dropdown to a
  keyboard-navigable menu is Tier 3 / WP9 work, not this migration.
-->
<script lang="ts">
	import type { DeviceSummary } from '$api/types';
	import { devicesStore, uiStore } from '$stores';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		device: DeviceSummary;
	}

	let { device }: Props = $props();

	let actionMenuOpen = $state(false);
	let loading = $state(false);

	let displayName = $derived(
		device.display_name || device.nickname || device.hostname || device.mac || 'Unknown Device'
	);

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
</script>

<div class="action-menu-wrapper">
	<button
		class="btn btn-ghost btn-sm action-btn"
		onclick={toggleActionMenu}
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
		<div class="action-menu" onmouseleave={closeActionMenu} role="menu" tabindex="-1">
			<button class="action-item" onclick={handleRename} role="menuitem">
				<Icon name="edit" size={14} /> Rename
			</button>
			{#if device.blocked}
				<button class="action-item" onclick={handleUnblock} role="menuitem">
					<Icon name="check" size={14} /> Unblock
				</button>
			{:else}
				<button class="action-item danger" onclick={handleBlock} role="menuitem">
					<Icon name="x" size={14} /> Block
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
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
</style>
