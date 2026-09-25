<!--
  SubnetsControls

  WP8 settings-class write controls for the "subnets" family
  (phase-6.0-revamp.md § 5, § 7 WP8, family 9): edit and delete for
  non-main subnets. Attaches to SecurityWanCard's `subnetsControls` snippet
  seam.

  The "main" subnet (the network's own LAN) is never offered here - it can
  never be disabled, opened, or cut off from the WAN, and it can never be
  deleted (backend 409 `subnet_protected`/422). Every write here is treated
  as rebooting the whole mesh: gated behind ExperimentalGate, confirmed
  through a danger dialog naming the reboot and the operator's own
  disconnection, and never two settings writes in one Save. `password` is
  write-only - the field is always blank on load, and a blank value is
  never sent (leaving the current password unchanged).
-->
<script lang="ts">
	import { securityWanStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	const MAIN_SUBNET_TYPE = 'main';
	const REBOOT_DETAILS = [
		'Every eero on this network will restart, and all connected devices will lose internet ' +
			'access for a minute or two.',
		'If you are connected to this network right now, you will lose your own connection while ' +
			'it restarts.'
	];

	let wanState = $derived($securityWanStore);

	let editableSubnets = $derived(
		(wanState.subnets?.subnets ?? []).filter(
			(s) => (s as { subnet_type?: unknown }).subnet_type !== MAIN_SUBNET_TYPE
		)
	);

	function subnetType(subnet: Record<string, unknown>): string {
		return String(subnet.subnet_type ?? '');
	}

	function subnetLabel(subnet: Record<string, unknown>): string {
		return typeof subnet.name === 'string' && subnet.name ? subnet.name : subnetType(subnet);
	}

	let selectedType = $state<string>('');

	let selectedSubnet = $derived(
		editableSubnets.find((s) => subnetType(s as Record<string, unknown>) === selectedType) ?? null
	);

	let nameForm = $state('');
	let enabledForm = $state(true);
	let openNetworkForm = $state(false);
	let wanAccessForm = $state(true);
	let passwordForm = $state('');
	let showPassword = $state(false);
	let rateLimitForm = $state<string>('');

	let seededForType: string | null = null;
	$effect(() => {
		if (selectedType && selectedType !== seededForType) {
			const subnet = selectedSubnet as Record<string, unknown> | null;
			nameForm = typeof subnet?.name === 'string' ? subnet.name : '';
			enabledForm = subnet?.enabled !== false;
			openNetworkForm = subnet?.open_network === true;
			wanAccessForm = subnet?.wan_access !== false;
			rateLimitForm =
				typeof subnet?.rate_limit_pct === 'number' ? String(subnet.rate_limit_pct) : '';
			passwordForm = '';
			showPassword = false;
			seededForType = selectedType;
		}
	});

	let submitError: string | null = $state(null);

	// S3: clear the local password value on every exit from the confirm flow - cancel, error,
	// changed:false, or success - so a typed subnet password never lingers in memory/DOM longer
	// than necessary.
	function clearPasswordField() {
		passwordForm = '';
		showPassword = false;
	}

	function requestSave() {
		if (!selectedType) return;
		submitError = null;

		const body: import('$api/types').SubnetConfigRequest = {
			subnet_type: selectedType,
			name: nameForm.trim() || undefined,
			enabled: enabledForm,
			open_network: openNetworkForm,
			wan_access: wanAccessForm
		};
		if (passwordForm) body.password = passwordForm;
		if (rateLimitForm !== '') {
			const parsed = Number(rateLimitForm);
			if (!Number.isNaN(parsed)) body.rate_limit_pct = parsed;
		}

		uiStore.confirm({
			title: 'Update Subnet',
			message: `Apply changes to the "${subnetLabel(selectedSubnet as Record<string, unknown>)}" subnet?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateSubnet(networkId, body);
					if (!result.changed) {
						uiStore.info('Subnet is already set to that value.');
						return;
					}
					uiStore.success('Subnet settings applied. Your network is restarting.');
				} catch (error) {
					if (error instanceof ApiClientError) {
						submitError = error.detail;
						return;
					}
					uiStore.error(error instanceof Error ? error.message : 'Failed to update subnet');
				} finally {
					clearPasswordField();
				}
			},
			onCancel: clearPasswordField
		});
	}

	function requestDelete() {
		if (!selectedType) return;
		const typeToDelete = selectedType;
		uiStore.confirm({
			title: 'Delete Subnet',
			message: `Delete the "${subnetLabel(selectedSubnet as Record<string, unknown>)}" subnet?`,
			details: [
				...REBOOT_DETAILS,
				'Any devices currently connected to this subnet will need to reconnect.'
			],
			confirmText: 'Delete & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					await securityWanStore.deleteSubnet(networkId, typeToDelete);
					uiStore.success('Subnet deleted. Your network is restarting.');
					selectedType = '';
					seededForType = null;
				} catch (error) {
					uiStore.error(error instanceof Error ? error.message : 'Failed to delete subnet');
				}
			}
		});
	}
</script>

<ExperimentalGate>
	<div class="subnets-controls">
		{#if editableSubnets.length === 0}
			<p class="text-muted text-sm">No non-main subnets to edit.</p>
		{:else}
			<div class="control-group">
				<label class="control-label" for="subnet-select-{networkId}">Subnet</label>
				<select
					id="subnet-select-{networkId}"
					class="input"
					bind:value={selectedType}
					disabled={wanState.applying}
				>
					<option value="">Select a subnet…</option>
					{#each editableSubnets as subnet (subnetType(subnet as Record<string, unknown>))}
						<option value={subnetType(subnet as Record<string, unknown>)}>
							{subnetLabel(subnet as Record<string, unknown>)}
						</option>
					{/each}
				</select>
			</div>

			{#if selectedType}
				<div class="control-group">
					<label class="control-label" for="subnet-name-{networkId}">Name</label>
					<input
						id="subnet-name-{networkId}"
						class="input"
						type="text"
						bind:value={nameForm}
						disabled={wanState.applying}
					/>
				</div>

				<div class="control-row">
					<label class="checkbox-inline">
						<input type="checkbox" bind:checked={enabledForm} disabled={wanState.applying} />
						Enabled
					</label>
					<label class="checkbox-inline">
						<input type="checkbox" bind:checked={openNetworkForm} disabled={wanState.applying} />
						Open network (no password)
					</label>
					<label class="checkbox-inline">
						<input type="checkbox" bind:checked={wanAccessForm} disabled={wanState.applying} />
						WAN access
					</label>
				</div>

				<div class="control-group">
					<label class="control-label" for="subnet-password-{networkId}">
						New password (leave blank to keep current)
					</label>
					<div class="password-input-row">
						<input
							id="subnet-password-{networkId}"
							class="input mono"
							type={showPassword ? 'text' : 'password'}
							placeholder="8-63 printable ASCII characters"
							bind:value={passwordForm}
							disabled={wanState.applying}
							autocomplete="new-password"
						/>
						<button
							type="button"
							class="btn btn-secondary btn-sm"
							aria-pressed={showPassword}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							onclick={() => (showPassword = !showPassword)}
						>
							{showPassword ? 'Hide' : 'Show'}
						</button>
					</div>
				</div>

				<div class="control-group">
					<label class="control-label" for="subnet-rate-limit-{networkId}">Rate limit (%)</label>
					<input
						id="subnet-rate-limit-{networkId}"
						class="input"
						type="number"
						min="0"
						max="100"
						bind:value={rateLimitForm}
						disabled={wanState.applying}
					/>
				</div>

				{#if submitError}
					<p class="field-error">{submitError}</p>
				{/if}

				<div class="control-row">
					<button
						type="button"
						class="btn btn-primary btn-sm"
						onclick={requestSave}
						disabled={wanState.applying}
					>
						Save Subnet
					</button>
					<button
						type="button"
						class="btn btn-danger btn-sm"
						onclick={requestDelete}
						disabled={wanState.applying}
					>
						Delete Subnet
					</button>
				</div>
			{/if}
		{/if}
	</div>
</ExperimentalGate>

<style>
	.subnets-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
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
		gap: var(--space-3);
		flex-wrap: wrap;
		align-items: center;
	}

	.password-input-row {
		display: flex;
		gap: var(--space-2);
	}

	.password-input-row input {
		flex: 1;
		min-width: 0;
	}

	.checkbox-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}

	.field-error {
		font-size: 0.75rem;
		color: var(--color-danger);
	}
</style>
