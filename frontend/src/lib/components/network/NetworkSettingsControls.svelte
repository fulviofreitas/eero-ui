<!--
  NetworkSettingsControls

  WP8 settings-class write controls for the "network" family
  (phase-6.0-revamp.md § 5, § 7 WP8): SQM, DHCP mode/manual lease range,
  WAN connection mode, and NAT port randomization. Attaches to
  SecurityWanCard's `networkControls` snippet seam.

  Every write here is treated as rebooting the whole mesh: gated behind
  ExperimentalGate, confirmed through a danger dialog naming the reboot and
  the operator's own disconnection, and never two settings writes in one
  Save (each button/form submits exactly one PUT). `changed: false` shows
  an "already set" info toast rather than the applying state.
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import {
		dhcpCustomLeaseIsValid,
		validateDhcpCustomLease,
		type DhcpCustomLeaseForm
	} from '$lib/utils/dhcp-form';

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

	let sqmEnabled = $derived(Boolean(wanState.security?.sqm));
	let natEnabled = $derived(Boolean(wanState.advanced?.nat_port_randomization));
	let connectionMode = $derived(
		(wanState.advanced?.connection_mode as 'BRIDGE' | 'NAT' | null) ?? null
	);

	let dhcpMode = $state<'automatic' | 'manual'>('automatic');
	let leaseForm = $state<DhcpCustomLeaseForm>({
		startIp: '',
		endIp: '',
		subnetIp: '',
		subnetMask: ''
	});
	let leaseErrors = $derived(dhcpMode === 'manual' ? validateDhcpCustomLease(leaseForm) : {});
	let leaseValid = $derived(dhcpMode === 'automatic' || dhcpCustomLeaseIsValid(leaseForm));

	let bridgeAcknowledged = $state(false);

	function requestToggleSqm() {
		const nextEnabled = !sqmEnabled;
		uiStore.confirm({
			title: 'Update SQM',
			message: `${nextEnabled ? 'Enable' : 'Disable'} Smart Queue Management (SQM) for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextEnabled ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateSqm(networkId, nextEnabled);
					if (!result.changed) {
						uiStore.info('SQM is already set to that value.');
						return;
					}
					uiStore.success('SQM setting applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : 'Failed to update SQM');
				}
			}
		});
	}

	function requestToggleNat() {
		const nextEnabled = !natEnabled;
		uiStore.confirm({
			title: 'Update NAT Port Randomization',
			message: `${nextEnabled ? 'Enable' : 'Disable'} NAT port randomization for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextEnabled ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateNatPortRandomization(networkId, nextEnabled);
					if (!result.changed) {
						uiStore.info('NAT port randomization is already set to that value.');
						return;
					}
					uiStore.success('NAT port randomization applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(
						error instanceof Error ? error.message : 'Failed to update NAT port randomization'
					);
				}
			}
		});
	}

	function requestConnectionMode(mode: 'BRIDGE' | 'NAT') {
		if (mode === connectionMode) return;
		if (mode === 'BRIDGE' && !bridgeAcknowledged) {
			uiStore.error('Acknowledge that BRIDGE mode disables DHCP and NAT before saving.');
			return;
		}
		const details = [...REBOOT_DETAILS];
		if (mode === 'BRIDGE') {
			details.push(
				'Bridge mode disables this network’s own DHCP, NAT, port forwards and profiles.'
			);
		}
		uiStore.confirm({
			title: 'Change Connection Mode',
			message: `Switch this network to ${mode} mode?`,
			details,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateConnectionMode(networkId, {
						mode,
						acknowledge_disables_routing: mode === 'BRIDGE'
					});
					if (!result.changed) {
						uiStore.info('Connection mode is already set to that value.');
						return;
					}
					uiStore.success('Connection mode applied. Your network is restarting.');
				} catch (error) {
					uiStore.error(
						error instanceof Error ? error.message : 'Failed to update connection mode'
					);
				}
			}
		});
	}

	function requestDhcpSave() {
		if (!leaseValid) return;
		const body =
			dhcpMode === 'manual'
				? {
						mode: dhcpMode,
						custom: {
							start_ip: leaseForm.startIp,
							end_ip: leaseForm.endIp,
							subnet_ip: leaseForm.subnetIp,
							subnet_mask: leaseForm.subnetMask
						}
					}
				: { mode: dhcpMode };

		uiStore.confirm({
			title: 'Update DHCP',
			message: `Switch this network's DHCP to ${dhcpMode} mode?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateDhcp(networkId, body);
					if (!result.changed) {
						uiStore.info('DHCP is already set to that value.');
						return;
					}
					uiStore.success('DHCP settings applied. Your network is restarting.');
				} catch (error) {
					if (error instanceof ApiClientError) {
						uiStore.error(error.detail);
						return;
					}
					uiStore.error(error instanceof Error ? error.message : 'Failed to update DHCP');
				}
			}
		});
	}
</script>

<ExperimentalGate>
	<div class="network-settings-controls">
		<div class="control-row">
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={requestToggleSqm}
				disabled={wanState.applying}
			>
				{sqmEnabled ? 'Disable SQM' : 'Enable SQM'}
			</button>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={requestToggleNat}
				disabled={wanState.applying}
			>
				{natEnabled ? 'Disable NAT Port Randomization' : 'Enable NAT Port Randomization'}
			</button>
		</div>

		<div class="control-group">
			<span class="control-label">Connection mode</span>
			<div class="control-row">
				<label class="radio-inline">
					<input
						type="radio"
						name="connection-mode-{networkId}"
						checked={connectionMode === 'NAT'}
						disabled={wanState.applying}
						onchange={() => requestConnectionMode('NAT')}
					/>
					NAT
				</label>
				<label class="radio-inline">
					<input
						type="radio"
						name="connection-mode-{networkId}"
						checked={connectionMode === 'BRIDGE'}
						disabled={wanState.applying}
						onchange={() => requestConnectionMode('BRIDGE')}
					/>
					BRIDGE
				</label>
			</div>
			{#if connectionMode !== 'BRIDGE'}
				<label class="checkbox-inline">
					<input type="checkbox" bind:checked={bridgeAcknowledged} disabled={wanState.applying} />
					I understand switching to BRIDGE disables DHCP, NAT, port forwards and profiles.
				</label>
			{/if}
		</div>

		<div class="control-group">
			<span class="control-label">DHCP</span>
			<div class="control-row">
				<label class="radio-inline">
					<input
						type="radio"
						name="dhcp-mode-{networkId}"
						bind:group={dhcpMode}
						value="automatic"
						disabled={wanState.applying}
					/>
					Automatic
				</label>
				<label class="radio-inline">
					<input
						type="radio"
						name="dhcp-mode-{networkId}"
						bind:group={dhcpMode}
						value="manual"
						disabled={wanState.applying}
					/>
					Manual
				</label>
			</div>
			{#if dhcpMode === 'manual'}
				<div class="dhcp-lease-grid">
					<div class="field-group">
						<label class="field-label" for="dhcp-start-ip-{networkId}">Start IP</label>
						<input
							id="dhcp-start-ip-{networkId}"
							class="input mono"
							class:input-error={leaseErrors.startIp}
							type="text"
							bind:value={leaseForm.startIp}
							disabled={wanState.applying}
						/>
						{#if leaseErrors.startIp}<span class="field-error">{leaseErrors.startIp}</span>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="dhcp-end-ip-{networkId}">End IP</label>
						<input
							id="dhcp-end-ip-{networkId}"
							class="input mono"
							class:input-error={leaseErrors.endIp}
							type="text"
							bind:value={leaseForm.endIp}
							disabled={wanState.applying}
						/>
						{#if leaseErrors.endIp}<span class="field-error">{leaseErrors.endIp}</span>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="dhcp-subnet-ip-{networkId}">Subnet IP</label>
						<input
							id="dhcp-subnet-ip-{networkId}"
							class="input mono"
							class:input-error={leaseErrors.subnetIp}
							type="text"
							bind:value={leaseForm.subnetIp}
							disabled={wanState.applying}
						/>
						{#if leaseErrors.subnetIp}<span class="field-error">{leaseErrors.subnetIp}</span>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="dhcp-subnet-mask-{networkId}">Subnet Mask</label>
						<input
							id="dhcp-subnet-mask-{networkId}"
							class="input mono"
							class:input-error={leaseErrors.subnetMask}
							type="text"
							bind:value={leaseForm.subnetMask}
							disabled={wanState.applying}
						/>
						{#if leaseErrors.subnetMask}<span class="field-error">{leaseErrors.subnetMask}</span
							>{/if}
					</div>
				</div>
			{/if}
			<div class="control-row">
				<button
					type="button"
					class="btn btn-primary btn-sm"
					onclick={requestDhcpSave}
					disabled={wanState.applying || !leaseValid}
				>
					Save DHCP
				</button>
			</div>
		</div>
	</div>
</ExperimentalGate>

<style>
	.network-settings-controls {
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

	.radio-inline,
	.checkbox-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}

	.dhcp-lease-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-3);
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.field-error {
		font-size: 0.75rem;
		color: var(--color-danger);
	}

	.input-error {
		border-color: var(--color-danger);
	}
</style>
