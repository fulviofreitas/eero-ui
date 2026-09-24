<!--
  ForwardModal

  Create/edit form for a port forward (phase-6.0-revamp.md § 7 WP7, family
  8). Shared between "Add Forward" and each row's "Edit" action - `forward`
  is `null` for create. Client-side validation mirrors the backend's own
  checks (`network-forms.ts`); the backend re-validates everything.
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';
	import type { ForwardSummary } from '$api/types';
	import { isPrivateIpv4, isValidPort } from '$lib/utils/network-forms';

	interface Props {
		open: boolean;
		forward: ForwardSummary | null;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (values: {
			clientPort: number;
			gatewayPort: number;
			ip: string;
			protocol: 'tcp' | 'udp' | 'both';
			description: string;
			enabled: boolean;
		}) => void;
	}

	let { open, forward, submitting, onClose, onSubmit }: Props = $props();

	let clientPort = $state('');
	let gatewayPort = $state('');
	let ip = $state('');
	let protocol = $state<'tcp' | 'udp' | 'both'>('tcp');
	let description = $state('');
	let enabled = $state(true);

	$effect(() => {
		if (open) {
			clientPort = forward?.client_port != null ? String(forward.client_port) : '';
			gatewayPort = forward?.gateway_port != null ? String(forward.gateway_port) : '';
			ip = forward?.ip ?? '';
			protocol = (forward?.protocol as 'tcp' | 'udp' | 'both') ?? 'tcp';
			description = forward?.description ?? '';
			enabled = forward?.enabled ?? true;
		}
	});

	let clientPortValid = $derived(isValidPort(Number(clientPort)));
	let gatewayPortValid = $derived(isValidPort(Number(gatewayPort)));
	let ipValid = $derived(isPrivateIpv4(ip));
	let valid = $derived(clientPortValid && gatewayPortValid && ipValid);

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!valid) return;
		onSubmit({
			clientPort: Number(clientPort),
			gatewayPort: Number(gatewayPort),
			ip: ip.trim(),
			protocol,
			description: description.trim(),
			enabled
		});
	}
</script>

<Modal {open} title={forward ? 'Edit Forward' : 'Add Forward'} {onClose}>
	<form onsubmit={handleSubmit}>
		<div class="form-row">
			<div>
				<label class="modal-label" for="forward-client-port-input">Client Port</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="forward-client-port-input"
					class="modal-input"
					type="number"
					min="1"
					max="65535"
					bind:value={clientPort}
					disabled={submitting}
					autofocus
				/>
			</div>
			<div>
				<label class="modal-label" for="forward-gateway-port-input">Gateway Port</label>
				<input
					id="forward-gateway-port-input"
					class="modal-input"
					type="number"
					min="1"
					max="65535"
					bind:value={gatewayPort}
					disabled={submitting}
				/>
			</div>
		</div>

		<label class="modal-label" for="forward-ip-input">IP (private IPv4)</label>
		<input
			id="forward-ip-input"
			class="modal-input"
			type="text"
			placeholder="192.168.1.100"
			bind:value={ip}
			disabled={submitting}
		/>

		<label class="modal-label" for="forward-protocol-select">Protocol</label>
		<select
			id="forward-protocol-select"
			class="modal-input"
			bind:value={protocol}
			disabled={submitting}
		>
			<option value="tcp">TCP</option>
			<option value="udp">UDP</option>
			<option value="both">Both</option>
		</select>

		<label class="modal-label" for="forward-description-input">Description (optional)</label>
		<input
			id="forward-description-input"
			class="modal-input"
			type="text"
			maxlength="64"
			bind:value={description}
			disabled={submitting}
		/>

		<label class="enabled-checkbox">
			<input type="checkbox" bind:checked={enabled} disabled={submitting} />
			Enabled
		</label>

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

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
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
