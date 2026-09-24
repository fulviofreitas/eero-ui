<!--
  UpdatesControls

  WP8 settings-class write control for the "updates" family
  (phase-6.0-revamp.md § 5, § 7 WP8, family 11): "Apply update". Attaches
  to SecurityWanCard's `updatesControls` snippet seam. Shown only when
  `security.updates.available` is truthy.

  Reboot-class by design: every node reboots (`scope: "all_nodes"`), so this
  is gated behind ExperimentalGate and confirmed through a danger dialog
  naming the reboot and the operator's own disconnection. The backend 409s
  with `no_update_available`/`update_in_progress` rather than a `changed`
  flag - both are shown as an inline note rather than the applying state.
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let wanState = $derived($securityWanStore);

	let updates = $derived((wanState.security?.updates as { available?: unknown } | null) ?? null);
	let updateAvailable = $derived(Boolean(updates?.available));

	let note: string | null = $state(null);

	function requestApply() {
		note = null;
		uiStore.confirm({
			title: 'Apply Firmware Update',
			message: 'Apply the pending firmware update to every node on this network?',
			details: [
				'Every eero on this network will restart, one at a time or all together depending on ' +
					'the update, and all connected devices will lose internet access while it applies.',
				'If you are connected to this network right now, you will lose your own connection ' +
					'while it restarts.'
			],
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					await securityWanStore.applyNetworkUpdate(networkId);
					uiStore.success('Update applied. Every node is restarting.');
				} catch (error) {
					if (error instanceof ApiClientError && error.status === 409) {
						note = error.detail;
						return;
					}
					uiStore.error(error instanceof Error ? error.message : 'Failed to apply update');
				}
			}
		});
	}
</script>

{#if updateAvailable}
	<ExperimentalGate>
		<div class="updates-controls">
			{#if note}<p class="field-note">{note}</p>{/if}
			<button
				type="button"
				class="btn btn-primary btn-sm"
				onclick={requestApply}
				disabled={wanState.applying}
			>
				{#if wanState.applying}<span class="loading-spinner"></span>{/if}
				Apply Update
			</button>
		</div>
	</ExperimentalGate>
{/if}

<style>
	.updates-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-note {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}
</style>
