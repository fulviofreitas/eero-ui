<!--
  WanControls

  WP8 settings-class write controls for the "wan" family
  (phase-6.0-revamp.md § 5, § 7 WP8, family 10): the multi-static-IP form
  and the bulk secondary-WAN deny table. Attaches to SecurityWanCard's
  `wanControls` snippet seam. The per-device secondary-WAN toggle lives on
  the device detail page instead (`DeviceSecondaryWanToggle.svelte`).

  Every write here is treated as rebooting the whole mesh: gated behind
  ExperimentalGate, confirmed through a danger dialog naming the reboot and
  the operator's own disconnection, and never two settings writes in one
  Save.
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import { isValidIpv4 } from '$lib/utils/ip-address';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import type { SecondaryWanDeviceEntry } from '$api/types';

	interface Props {
		networkId: string;
		/** Suppress this control's own "disabled by operator" note - the parent card renders one summary note instead. */
		silent?: boolean;
	}

	let { networkId, silent = false }: Props = $props();

	let wanState = $derived($securityWanStore);

	const REBOOT_DETAILS = [
		'Every eero on this network will restart, and all connected devices will lose internet ' +
			'access for a minute or two.',
		'If you are connected to this network right now, you will lose your own connection while ' +
			'it restarts.'
	];

	// --- Multi-static-IP -------------------------------------------------

	let msipEnabled = $state(false);
	let routerIp = $state('');
	let subnetIp = $state('');
	let subnetMask = $state('');
	let natStart = $state('');
	let natEnd = $state('');
	let msipError: string | null = $state(null);

	let msipFieldErrors = $derived.by(() => {
		const errors: Record<string, string> = {};
		if (msipEnabled) {
			if (!isValidIpv4(routerIp)) errors.routerIp = 'Enter a valid IPv4 address';
			if (!isValidIpv4(subnetIp)) errors.subnetIp = 'Enter a valid IPv4 address';
			if (!isValidIpv4(subnetMask)) errors.subnetMask = 'Enter a valid IPv4 subnet mask';
			if (natStart && !isValidIpv4(natStart)) errors.natStart = 'Enter a valid IPv4 address';
			if (natEnd && !isValidIpv4(natEnd)) errors.natEnd = 'Enter a valid IPv4 address';
		}
		return errors;
	});

	let msipValid = $derived(!msipEnabled || Object.keys(msipFieldErrors).length === 0);

	function requestMultiStaticIpSave() {
		if (!msipValid) return;
		msipError = null;

		const body: import('$api/types').MultiStaticIpUpdateRequest = { enabled: msipEnabled };
		if (msipEnabled) {
			body.type = 'P';
			body.multistaticip_settings = {
				router_ip: routerIp,
				subnet_ip: subnetIp,
				subnet_mask: subnetMask
			};
			if (natStart && natEnd) {
				body.multistaticip_settings_nat_portfwd = {
					subnet_ip_start: natStart,
					subnet_ip_end: natEnd
				};
			}
		}

		uiStore.confirm({
			title: 'Update Multi-Static-IP',
			message: `${msipEnabled ? 'Enable' : 'Disable'} multi-static-IP for this network?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateMultiStaticIp(networkId, body);
					if (!result.changed) {
						uiStore.info('Multi-static-IP is already set to that value.');
						return;
					}
					uiStore.success('Multi-static-IP applied. Your network is restarting.');
				} catch (error) {
					if (error instanceof ApiClientError) {
						msipError = error.detail;
						return;
					}
					uiStore.error(
						error instanceof Error ? error.message : 'Failed to update multi-static-IP'
					);
				}
			}
		});
	}

	// --- Secondary WAN: bulk deny table -----------------------------------

	let denyByMac = $state<Record<string, boolean>>({});

	function toggleDeny(mac: string) {
		denyByMac = { ...denyByMac, [mac]: !denyByMac[mac] };
	}

	let pendingEntries = $derived(
		Object.entries(denyByMac).map(([mac, deny]): SecondaryWanDeviceEntry => ({
			mac,
			secondary_wan_deny_access: deny
		}))
	);

	function requestSecondaryWanSave() {
		if (pendingEntries.length === 0) return;
		uiStore.confirm({
			title: 'Update Secondary WAN Access',
			message: `Apply secondary-WAN access changes to ${pendingEntries.length} device(s)?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					await securityWanStore.updateSecondaryWanConfig(networkId, { devices: pendingEntries });
					uiStore.success('Secondary WAN access applied. Your network is restarting.');
					denyByMac = {};
				} catch (error) {
					uiStore.error(
						error instanceof Error ? error.message : 'Failed to update secondary WAN access'
					);
				}
			}
		});
	}
</script>

<ExperimentalGate {silent}>
	<div class="wan-controls">
		<div class="control-group">
			<span class="control-label">Multi-Static-IP</span>
			<label class="checkbox-inline">
				<input type="checkbox" bind:checked={msipEnabled} disabled={wanState.applying} />
				Enabled
			</label>

			{#if msipEnabled}
				<div class="msip-grid">
					<div class="field-group">
						<label class="field-label" for="msip-router-ip-{networkId}">Router IP</label>
						<input
							id="msip-router-ip-{networkId}"
							class="input mono"
							class:input-error={msipFieldErrors.routerIp}
							type="text"
							bind:value={routerIp}
							disabled={wanState.applying}
						/>
						{#if msipFieldErrors.routerIp}<span class="field-error">{msipFieldErrors.routerIp}</span
							>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="msip-subnet-ip-{networkId}">Subnet IP</label>
						<input
							id="msip-subnet-ip-{networkId}"
							class="input mono"
							class:input-error={msipFieldErrors.subnetIp}
							type="text"
							bind:value={subnetIp}
							disabled={wanState.applying}
						/>
						{#if msipFieldErrors.subnetIp}<span class="field-error">{msipFieldErrors.subnetIp}</span
							>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="msip-subnet-mask-{networkId}">Subnet Mask</label>
						<input
							id="msip-subnet-mask-{networkId}"
							class="input mono"
							class:input-error={msipFieldErrors.subnetMask}
							type="text"
							bind:value={subnetMask}
							disabled={wanState.applying}
						/>
						{#if msipFieldErrors.subnetMask}<span class="field-error"
								>{msipFieldErrors.subnetMask}</span
							>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="msip-nat-start-{networkId}">
							NAT Port Fwd Start (optional)
						</label>
						<input
							id="msip-nat-start-{networkId}"
							class="input mono"
							class:input-error={msipFieldErrors.natStart}
							type="text"
							bind:value={natStart}
							disabled={wanState.applying}
						/>
						{#if msipFieldErrors.natStart}<span class="field-error">{msipFieldErrors.natStart}</span
							>{/if}
					</div>
					<div class="field-group">
						<label class="field-label" for="msip-nat-end-{networkId}">
							NAT Port Fwd End (optional)
						</label>
						<input
							id="msip-nat-end-{networkId}"
							class="input mono"
							class:input-error={msipFieldErrors.natEnd}
							type="text"
							bind:value={natEnd}
							disabled={wanState.applying}
						/>
						{#if msipFieldErrors.natEnd}<span class="field-error">{msipFieldErrors.natEnd}</span
							>{/if}
					</div>
				</div>
			{/if}

			{#if msipError}<p class="field-error">{msipError}</p>{/if}

			<div class="control-row">
				<button
					type="button"
					class="btn btn-primary btn-sm"
					onclick={requestMultiStaticIpSave}
					disabled={wanState.applying || !msipValid}
				>
					Save Multi-Static-IP
				</button>
			</div>
		</div>

		<div class="control-group">
			<span class="control-label">Secondary WAN Access</span>
			<p class="text-muted text-sm">
				Toggle secondary-WAN deny access per device, then apply the batch below. No current
				per-device state is available from this bulk endpoint.
			</p>
			{#if wanState.multistaticip?.config}
				{#each Object.entries(denyByMac) as [mac, deny] (mac)}
					<label class="checkbox-inline">
						<input type="checkbox" checked={deny} onchange={() => toggleDeny(mac)} />
						<span class="mono">{mac}</span>
					</label>
				{/each}
			{/if}
			<div class="control-row">
				<label class="field-label" for="wan-deny-mac-{networkId}">Add device MAC</label>
				<input
					id="wan-deny-mac-{networkId}"
					class="input mono"
					type="text"
					placeholder="aa:bb:cc:dd:ee:ff"
					disabled={wanState.applying}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							const input = event.currentTarget as HTMLInputElement;
							const mac = input.value.trim().toLowerCase();
							if (mac) {
								denyByMac = { ...denyByMac, [mac]: true };
								input.value = '';
							}
						}
					}}
				/>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					onclick={requestSecondaryWanSave}
					disabled={wanState.applying || pendingEntries.length === 0}
				>
					Apply Secondary WAN Access
				</button>
			</div>
		</div>
	</div>
</ExperimentalGate>

<style>
	.wan-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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

	.control-row {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}

	.checkbox-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}

	.msip-grid {
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
