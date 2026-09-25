<!--
  Device Row Actions

  Was the full `<tr>` for a device (13 hand-rolled `<td>`s plus this menu). DeviceList now
  delegates row/cell rendering to DataTable (see phase-6.0-revamp.md § 6.2 Tier 2), which owns
  the `<tr>` and every visible column via `DataTableColumn.render` snippets defined in
  DeviceList.svelte. This component's only remaining job is the per-row action menu
  (rename/block/unblock), rendered as the "actions" column's `render` snippet — the one piece of
  row behaviour too stateful (loading, confirm dialogs) to inline as a snippet.

  A11Y (WP5 A6): the menu itself is the Dropdown primitive (aria-haspopup/expanded, focus-in on
  open, Escape closes and refocuses the trigger, outside-click closes) instead of the previous
  hand-rolled div with a mouseleave-only close.
-->
<script lang="ts">
	import type { DeviceSummary } from '$api/types';
	import { devicesStore, uiStore } from '$stores';
	import Icon from '$components/common/Icon.svelte';
	import Dropdown, { type DropdownItem } from '$components/common/Dropdown.svelte';

	interface Props {
		device: DeviceSummary;
	}

	let { device }: Props = $props();

	let loading = $state(false);

	let displayName = $derived(
		device.display_name || device.nickname || device.hostname || device.mac || 'Unknown Device'
	);

	let menuItems = $derived<DropdownItem[]>([
		{ id: 'rename', label: 'Rename', icon: 'edit', onSelect: handleRename },
		device.blocked
			? { id: 'unblock', label: 'Unblock', icon: 'check', onSelect: handleUnblock }
			: { id: 'block', label: 'Block', icon: 'x', danger: true, onSelect: handleBlock }
	]);

	async function handleBlock() {
		if (!device.id) return;

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
		const newName = prompt('Enter new name:', device.nickname || device.hostname || '');
		if (newName && device.id) {
			devicesStore
				.setNickname(device.id, newName)
				.then(() => uiStore.success('Device renamed successfully.'))
				.catch((error) => uiStore.error(error.message));
		}
	}
</script>

<Dropdown
	label="Device actions"
	items={menuItems}
	disabled={loading}
	triggerClass="btn btn-ghost btn-sm action-btn"
>
	{#snippet trigger()}
		{#if loading}
			<span class="loading-spinner"></span>
		{:else}
			<Icon name="more-vertical" />
		{/if}
	{/snippet}
</Dropdown>

<style>
	:global(.action-btn) {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 1.25rem;
	}

	.loading-spinner {
		width: 14px;
		height: 14px;
	}
</style>
