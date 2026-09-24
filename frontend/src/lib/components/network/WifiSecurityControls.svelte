<!--
  WifiSecurityControls

  WP8 settings-class write controls for the "wifi-security" family
  (phase-6.0-revamp.md § 5, § 7 WP8): per-band WPA3, the four envelope
  security toggles (wpa3, band_steering, upnp, ipv6 - each its own Save),
  MLO mode, 802.11r fast transition, Passpoint, and proxied nodes.
  Attaches to SecurityWanCard's `wifiSecurityControls` snippet seam.

  Every write here is treated as rebooting the whole mesh: gated behind
  ExperimentalGate, confirmed through a danger dialog naming the reboot and
  the operator's own disconnection, and never two settings writes in one
  Save (each control submits exactly one PUT).
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import type { SecurityEnvelopeField, Wpa3BandMode } from '$api/types';
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

	const WPA3_MODES: Wpa3BandMode[] = ['WPA2', 'WPA2_WPA3', 'WPA3'];

	let wpa3PerBand = $derived(
		(wanState.security?.wpa3_per_band as { band_2_4_ghz?: string; band_5_ghz?: string } | null) ??
			null
	);

	let mloMode = $derived(
		((wanState.advanced as unknown as { mlo_mode?: string })?.mlo_mode as
			'disabled' | 'single' | 'multi' | null) ?? null
	);

	function requestWpa3Band(band: '2_4_ghz' | '5_ghz', mode: Wpa3BandMode) {
		const current = band === '2_4_ghz' ? wpa3PerBand?.band_2_4_ghz : wpa3PerBand?.band_5_ghz;
		if (mode === current) return;
		uiStore.confirm({
			title: 'Update WPA3',
			message: `Set the ${band === '2_4_ghz' ? '2.4 GHz' : '5 GHz'} band to ${mode}?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const body = band === '2_4_ghz' ? { band_2_4_ghz: mode } : { band_5_ghz: mode };
					const result = await securityWanStore.updateWpa3PerBand(networkId, body);
					if (!result.changed) {
						uiStore.info('WPA3 is already set to that value.');
						return;
					}
					uiStore.success('WPA3 settings applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : 'Failed to update WPA3');
				}
			}
		});
	}

	function envelopeValue(field: SecurityEnvelopeField): boolean {
		if (field === 'ipv6') return Boolean(wanState.security?.ipv6);
		return Boolean(wanState.security?.[field]);
	}

	function envelopeLabel(field: SecurityEnvelopeField): string {
		return { wpa3: 'WPA3', band_steering: 'Band Steering', upnp: 'UPnP', ipv6: 'IPv6' }[field];
	}

	function requestToggleEnvelope(field: SecurityEnvelopeField) {
		const nextValue = !envelopeValue(field);
		uiStore.confirm({
			title: `Update ${envelopeLabel(field)}`,
			message: `${nextValue ? 'Enable' : 'Disable'} ${envelopeLabel(field)} for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextValue ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateSecurityField(networkId, {
						[field]: nextValue
					});
					if (!result.changed) {
						uiStore.info(`${envelopeLabel(field)} is already set to that value.`);
						return;
					}
					uiStore.success(`${envelopeLabel(field)} applied. Your network is restarting.`);
				} catch (error) {
					uiStore.error(
						error instanceof Error ? error.message : `Failed to update ${envelopeLabel(field)}`
					);
				}
			}
		});
	}

	function requestMlo(mode: 'disabled' | 'single' | 'multi') {
		if (mode === mloMode) return;
		uiStore.confirm({
			title: 'Update MLO',
			message: `Set MLO (Multi-Link Operation) mode to ${mode}?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateMlo(networkId, mode);
					if (!result.changed) {
						uiStore.info('MLO is already set to that value.');
						return;
					}
					uiStore.success('MLO mode applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : 'Failed to update MLO mode');
				}
			}
		});
	}

	function requestSimpleReboot(
		title: string,
		nextEnabled: boolean,
		action: (networkId: string, enabled: boolean) => Promise<{ changed: boolean }>,
		label: string
	) {
		uiStore.confirm({
			title: `Update ${title}`,
			message: `${nextEnabled ? 'Enable' : 'Disable'} ${title} for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextEnabled ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await action(networkId, nextEnabled);
					if (!result.changed) {
						uiStore.info(`${title} is already set to that value.`);
						return;
					}
					uiStore.success(`${title} applied. Your network is restarting.`);
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : `Failed to update ${label}`);
				}
			}
		});
	}

	let fastTransitionEnabled = $derived(
		Boolean((wanState.security?.fast_transition as { enabled?: unknown } | null)?.enabled)
	);
	let passpointEnabled = $derived(
		Boolean((wanState.security as unknown as { passpoint?: unknown })?.passpoint)
	);
	let proxiedNodesEnabled = $derived(
		Boolean(
			(wanState.advanced as unknown as { proxied_nodes_enabled?: unknown })?.proxied_nodes_enabled
		)
	);
</script>

<ExperimentalGate>
	<div class="wifi-security-controls">
		<div class="control-group">
			<span class="control-label">WPA3 - 2.4 GHz</span>
			<div class="control-row">
				{#each WPA3_MODES as mode (mode)}
					<label class="radio-inline">
						<input
							type="radio"
							name="wpa3-2-4-{networkId}"
							checked={wpa3PerBand?.band_2_4_ghz === mode}
							disabled={wanState.applying}
							onchange={() => requestWpa3Band('2_4_ghz', mode)}
						/>
						{mode}
					</label>
				{/each}
			</div>
		</div>

		<div class="control-group">
			<span class="control-label">WPA3 - 5 GHz</span>
			<div class="control-row">
				{#each WPA3_MODES as mode (mode)}
					<label class="radio-inline">
						<input
							type="radio"
							name="wpa3-5-{networkId}"
							checked={wpa3PerBand?.band_5_ghz === mode}
							disabled={wanState.applying}
							onchange={() => requestWpa3Band('5_ghz', mode)}
						/>
						{mode}
					</label>
				{/each}
			</div>
		</div>

		<div class="control-row">
			{#each ['wpa3', 'band_steering', 'upnp', 'ipv6'] as field (field)}
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					onclick={() => requestToggleEnvelope(field as SecurityEnvelopeField)}
					disabled={wanState.applying}
				>
					{envelopeValue(field as SecurityEnvelopeField) ? 'Disable' : 'Enable'}
					{envelopeLabel(field as SecurityEnvelopeField)}
				</button>
			{/each}
		</div>

		<div class="control-group">
			<span class="control-label">MLO mode</span>
			<div class="control-row">
				{#each ['disabled', 'single', 'multi'] as const as mode (mode)}
					<label class="radio-inline">
						<input
							type="radio"
							name="mlo-mode-{networkId}"
							checked={mloMode === mode}
							disabled={wanState.applying}
							onchange={() => requestMlo(mode)}
						/>
						{mode}
					</label>
				{/each}
			</div>
		</div>

		<div class="control-row">
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				disabled={wanState.applying}
				onclick={() =>
					requestSimpleReboot(
						'Fast Transition',
						!fastTransitionEnabled,
						(id, enabled) => securityWanStore.updateFastTransition(id, enabled),
						'fast transition'
					)}
			>
				{fastTransitionEnabled ? 'Disable Fast Transition' : 'Enable Fast Transition'}
			</button>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				disabled={wanState.applying}
				onclick={() =>
					requestSimpleReboot(
						'Passpoint',
						!passpointEnabled,
						(id, enabled) => securityWanStore.updatePasspoint(id, enabled),
						'Passpoint'
					)}
			>
				{passpointEnabled ? 'Disable Passpoint' : 'Enable Passpoint'}
			</button>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				disabled={wanState.applying}
				onclick={() =>
					requestSimpleReboot(
						'Proxied Nodes',
						!proxiedNodesEnabled,
						(id, enabled) => securityWanStore.updateProxiedNodes(id, enabled),
						'proxied nodes'
					)}
			>
				{proxiedNodesEnabled ? 'Disable Proxied Nodes' : 'Enable Proxied Nodes'}
			</button>
		</div>
	</div>
</ExperimentalGate>

<style>
	.wifi-security-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.control-row {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.control-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.radio-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}
</style>
