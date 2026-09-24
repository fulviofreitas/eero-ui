<!--
  BackupAccessPointModal

  Create/edit form for a backup Wi-Fi access point (phase-6.0-revamp.md § 7
  WP7, family 5). Shared between "Add Access Point" and each row's "Edit"
  action - `ap` is `null` for create. `prefill` seeds the SSID/UUID fields
  from a discovery result when opened via "Use this SSID".

  The password is write-only through this API (`BackupAccessPoint` never
  echoes it back) - on edit the field starts blank and is only sent if the
  operator types a new value.
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';
	import type { BackupAccessPoint, DiscoveredBackupSsid } from '$api/types';

	interface Props {
		open: boolean;
		ap: BackupAccessPoint | null;
		prefill?: DiscoveredBackupSsid | null;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (values: { ssid: string; password: string; uuid: string; enabled: boolean }) => void;
	}

	let { open, ap, prefill = null, submitting, onClose, onSubmit }: Props = $props();

	let ssid = $state('');
	let password = $state('');
	let uuid = $state('');
	let enabled = $state(true);

	// Reset the form every time the modal opens - `open` is the only reactive
	// trigger a caller needs to control.
	$effect(() => {
		if (open) {
			ssid = ap?.ssid ?? prefill?.ssid ?? '';
			password = '';
			uuid = ap?.uuid ?? prefill?.uuid ?? '';
			enabled = ap?.enabled ?? true;
		}
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit({ ssid: ssid.trim(), password, uuid: uuid.trim(), enabled });
	}

	// Mirrors the backend's own bounds (networks.py `_AP_SSID_MAX_LEN`/
	// `_AP_PASSWORD_MIN_LEN`/`_AP_PASSWORD_MAX_LEN`) - create always requires
	// a password; edit only validates it when the operator typed one.
	let ssidValid = $derived(ssid.trim().length > 0 && ssid.trim().length <= 32);
	let passwordValid = $derived(
		ap
			? password.length === 0 || (password.length >= 8 && password.length <= 63)
			: password.length >= 8 && password.length <= 63
	);
	let valid = $derived(ssidValid && passwordValid);
</script>

<Modal {open} title={ap ? 'Edit Access Point' : 'Add Access Point'} {onClose}>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for="ap-ssid-input">SSID</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="ap-ssid-input"
			class="modal-input"
			type="text"
			bind:value={ssid}
			disabled={submitting}
			maxlength="32"
			autofocus
		/>

		<label class="modal-label" for="ap-password-input">
			Password{ap ? ' (leave blank to keep unchanged)' : ''}
		</label>
		<input
			id="ap-password-input"
			class="modal-input"
			type="password"
			bind:value={password}
			disabled={submitting}
			autocomplete="new-password"
		/>

		{#if !ap}
			<label class="modal-label" for="ap-uuid-input">UUID (optional)</label>
			<input
				id="ap-uuid-input"
				class="modal-input"
				type="text"
				bind:value={uuid}
				disabled={submitting}
			/>
		{/if}

		{#if ap}
			<label class="enabled-checkbox">
				<input type="checkbox" bind:checked={enabled} disabled={submitting} />
				Enabled
			</label>
		{/if}

		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={onClose} disabled={submitting}>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={submitting || !valid}>
				{#if submitting}
					<span class="loading-spinner"></span>
				{/if}
				Save
			</button>
		</div>
	</form>
</Modal>

<style>
	.modal-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.modal-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
		box-sizing: border-box;
		margin-bottom: var(--space-4);
	}

	.modal-input:focus {
		border-color: var(--color-accent);
	}

	.modal-input:focus-visible {
		box-shadow: var(--focus-ring);
	}

	.enabled-checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-sm);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
