<!--
  PowerSavingControls

  WP8 settings-class write control for the "power-thread" family
  (phase-6.0-revamp.md § 5, § 7 WP8, family 8): the power-saving
  enable/schedule_enabled toggles. Attaches to SecurityWanCard's
  `powerThreadControls` snippet seam.

  Every write here is treated as rebooting the whole mesh: gated behind
  ExperimentalGate, confirmed through a danger dialog naming the reboot and
  the operator's own disconnection, and never two settings writes in one
  Save. `changed: false` shows an "already set" info toast rather than the
  applying state. The schedules themselves are NOT settings-class - see
  `PowerSavingSchedulesCard.svelte`.
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let wanState = $derived($securityWanStore);

	const REBOOT_DETAILS = [
		'Every eero on this network will restart, and all connected devices will lose internet ' +
			'access for a minute or two.',
		'If you are connected to this network right now, you will lose your own connection while ' +
			'it restarts.'
	];

	let powerSaving = $derived(
		(wanState.advanced?.power_saving as {
			enable?: unknown;
			power_saving_schedule_enabled?: unknown;
		} | null) ?? null
	);
	let enabled = $derived(Boolean(powerSaving?.enable));
	let scheduleEnabled = $derived(Boolean(powerSaving?.power_saving_schedule_enabled));

	function requestToggle(
		field: 'enable' | 'schedule_enabled',
		label: string,
		nextEnabled: boolean
	) {
		uiStore.confirm({
			title: `Update ${label}`,
			message: `${nextEnabled ? 'Enable' : 'Disable'} ${label} for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextEnabled ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const body =
						field === 'enable' ? { enable: nextEnabled } : { schedule_enabled: nextEnabled };
					const result = await securityWanStore.updatePowerSaving(networkId, body);
					if (!result.changed) {
						uiStore.info(`${label} is already set to that value.`);
						return;
					}
					uiStore.success(`${label} applied. Your network is restarting.`);
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : `Failed to update ${label}`);
				}
			}
		});
	}
</script>

<ExperimentalGate>
	<div class="power-saving-controls">
		<div class="control-row">
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				disabled={wanState.applying}
				onclick={() => requestToggle('enable', 'Power Saving', !enabled)}
			>
				{enabled ? 'Disable Power Saving' : 'Enable Power Saving'}
			</button>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				disabled={wanState.applying}
				onclick={() => requestToggle('schedule_enabled', 'Power Saving Schedule', !scheduleEnabled)}
			>
				{scheduleEnabled ? 'Disable Power Saving Schedule' : 'Enable Power Saving Schedule'}
			</button>
		</div>
	</div>
</ExperimentalGate>

<style>
	.control-row {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
</style>
