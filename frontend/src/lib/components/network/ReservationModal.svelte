<!--
  ReservationModal

  Create/edit form for a DHCP reservation (phase-6.0-revamp.md § 7 WP7,
  family 8). Shared between "Add Reservation" and each row's "Edit" action -
  `reservation` is `null` for create. Client-side validation mirrors the
  backend's own checks (`network-forms.ts`); the backend re-validates
  everything.
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';
	import type { ReservationSummary } from '$api/types';
	import { isPrivateIpv4, isValidIpLiteral, isValidMac } from '$lib/utils/network-forms';

	interface Props {
		open: boolean;
		reservation: ReservationSummary | null;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (values: {
			ip: string;
			mac: string;
			description: string;
			publicStaticIp: string;
		}) => void;
	}

	let { open, reservation, submitting, onClose, onSubmit }: Props = $props();

	let ip = $state('');
	let mac = $state('');
	let description = $state('');
	let publicStaticIp = $state('');

	$effect(() => {
		if (open) {
			ip = reservation?.ip ?? '';
			mac = reservation?.mac ?? '';
			description = reservation?.description ?? '';
			publicStaticIp = reservation?.public_static_ip ?? '';
		}
	});

	let ipValid = $derived(isPrivateIpv4(ip));
	let macValid = $derived(isValidMac(mac.toLowerCase()));
	let publicIpValid = $derived(
		publicStaticIp.trim() === '' || isValidIpLiteral(publicStaticIp.trim())
	);
	let valid = $derived(ipValid && macValid && publicIpValid);

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!valid) return;
		onSubmit({
			ip: ip.trim(),
			mac: mac.trim().toLowerCase(),
			description: description.trim(),
			publicStaticIp: publicStaticIp.trim()
		});
	}
</script>

<Modal {open} title={reservation ? 'Edit Reservation' : 'Add Reservation'} {onClose}>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for="reservation-ip-input">IP (private IPv4)</label>
		<input
			id="reservation-ip-input"
			class="modal-input"
			type="text"
			placeholder="192.168.1.50"
			bind:value={ip}
			disabled={submitting}
		/>

		<label class="modal-label" for="reservation-mac-input">MAC Address</label>
		<input
			id="reservation-mac-input"
			class="modal-input"
			type="text"
			placeholder="aa:bb:cc:dd:ee:ff"
			bind:value={mac}
			disabled={submitting}
		/>

		<label class="modal-label" for="reservation-description-input">Description (optional)</label>
		<input
			id="reservation-description-input"
			class="modal-input"
			type="text"
			maxlength="64"
			bind:value={description}
			disabled={submitting}
		/>

		<label class="modal-label" for="reservation-public-ip-input">Public Static IP (optional)</label>
		<input
			id="reservation-public-ip-input"
			class="modal-input"
			type="text"
			bind:value={publicStaticIp}
			disabled={submitting}
		/>

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

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
