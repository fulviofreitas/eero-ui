<!--
  DeviceSecondaryWanToggle

  Per-device secondary-WAN-access deny toggle (phase-6.0-revamp.md § 5,
  § 7 WP8, family 10): `PUT /devices/{id}/secondary-wan-access`. Rendered
  on the device detail page, next to the block/unblock action.

  Settings-class by its own SDK docstring - treated as a mesh reboot: gated
  behind ExperimentalGate, confirmed through a danger dialog naming the
  reboot and the operator's own disconnection, pessimistic (no optimistic
  flip). No getter is exposed on `DeviceDetail`, so this control tracks its
  own local last-known state rather than the device's true current value -
  a documented gap, not a silent skip.
-->
<script lang="ts">
	import { devicesStore, uiStore } from '$stores';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		deviceId: string;
	}

	let { deviceId }: Props = $props();

	let denied = $state(false);
	let applying = $state(false);

	const REBOOT_DETAILS = [
		'Every eero on this network will restart, and all connected devices will lose internet ' +
			'access for a minute or two.',
		'If you are connected to this network right now, you will lose your own connection while ' +
			'it restarts.'
	];

	function requestToggle() {
		const nextDeny = !denied;
		uiStore.confirm({
			title: 'Update Secondary WAN Access',
			message: `${nextDeny ? 'Deny' : 'Allow'} secondary-WAN access for this device?`,
			details: REBOOT_DETAILS,
			confirmText: nextDeny ? 'Deny & Restart Network' : 'Allow & Restart Network',
			danger: true,
			onConfirm: async () => {
				applying = true;
				try {
					const changed = await devicesStore.setSecondaryWanAccess(deviceId, nextDeny);
					if (!changed) {
						uiStore.info('Secondary WAN access is already set to that value.');
						return;
					}
					denied = nextDeny;
					uiStore.success('Secondary WAN access applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(
						error instanceof Error ? error.message : 'Failed to update secondary WAN access'
					);
				} finally {
					applying = false;
				}
			}
		});
	}
</script>

<ExperimentalGate>
	<button
		type="button"
		class="btn btn-secondary btn-sm"
		onclick={requestToggle}
		disabled={applying}
	>
		{#if applying}<span class="loading-spinner"></span>{/if}
		{denied ? 'Allow Secondary WAN Access' : 'Deny Secondary WAN Access'}
	</button>
</ExperimentalGate>
