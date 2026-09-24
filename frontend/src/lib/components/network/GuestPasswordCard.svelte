<!--
  GuestPasswordCard

  Network detail "Wi-Fi & Guest" tab card (phase-6.0-revamp.md § 7 WP6, deliverable 2), next to
  GuestNetworkCard's enable/disable toggle. Shows only `has_password` - the eero cloud API never
  returns the raw password, so this UI never displays or logs one after submit either. Both
  "Set password" and "Clear" are Verified writes (plan § 5): optimistic `has_password` flip with
  rollback, behind a ConfirmDialog naming that guest clients disconnect while the change applies.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { guestPasswordStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	const GUEST_PASSWORD_MIN = 8;
	const GUEST_PASSWORD_MAX = 63;
	const GENERATED_LENGTH = 16;
	// Printable ASCII, excluding characters easily confused when read aloud/copied.
	const GENERATOR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

	let password = $state('');
	let submitError: string | null = $state(null);

	let guestState = $derived($guestPasswordStore);
	let status = $derived(guestState.status);

	const validationError = $derived.by(() => {
		if (!password) return null;
		if (password.length < GUEST_PASSWORD_MIN || password.length > GUEST_PASSWORD_MAX) {
			return `Password must be ${GUEST_PASSWORD_MIN}-${GUEST_PASSWORD_MAX} characters.`;
		}
		if (![...password].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f)) {
			return 'Password must be printable ASCII.';
		}
		return null;
	});

	const canSet = $derived(password.length > 0 && !validationError && !guestState.applying);

	onMount(() => {
		if (!guestState.status) {
			guestPasswordStore.fetch(networkId);
		}
	});

	function generatePassword(): string {
		const bytes = new Uint32Array(GENERATED_LENGTH);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (n) => GENERATOR_ALPHABET[n % GENERATOR_ALPHABET.length]).join('');
	}

	function handleGenerate() {
		password = generatePassword();
		submitError = null;
	}

	function requestSetPassword() {
		if (!canSet) return;
		uiStore.confirm({
			title: 'Set Guest Network Password?',
			message: 'This disconnects every guest device while the change applies.',
			details: [
				'All devices currently connected to the guest network will be disconnected.',
				'They will need the new password to reconnect.'
			],
			confirmText: 'Set Password',
			danger: true,
			onConfirm: submitSetPassword
		});
	}

	function requestClearPassword() {
		if (guestState.applying) return;
		uiStore.confirm({
			title: 'Clear Guest Network Password?',
			message: 'This disconnects every guest device while the change applies.',
			details: [
				'The guest network will become open (no password required).',
				'All devices currently connected to the guest network will be disconnected.'
			],
			confirmText: 'Clear Password',
			danger: true,
			onConfirm: submitClearPassword
		});
	}

	async function submitSetPassword(): Promise<void> {
		submitError = null;
		try {
			await guestPasswordStore.setPassword(networkId, password);
			password = '';
			uiStore.success('Guest network password set.');
		} catch (error) {
			if (error instanceof ApiClientError && error.status === 422) {
				submitError = error.detail;
				return;
			}
			uiStore.error(error instanceof Error ? error.message : 'Failed to set guest password');
		}
	}

	async function submitClearPassword(): Promise<void> {
		submitError = null;
		try {
			await guestPasswordStore.clearPassword(networkId);
			uiStore.success('Guest network password cleared.');
		} catch (error) {
			uiStore.error(error instanceof Error ? error.message : 'Failed to clear guest password');
		}
	}
</script>

<section class="card info-card guest-password-card">
	<h2>Guest Network Password</h2>

	{#if guestState.loading && !status}
		<p class="text-muted text-sm">Loading…</p>
	{:else if guestState.error && !status}
		<p class="text-danger text-sm">{guestState.error}</p>
		<button
			type="button"
			class="btn btn-secondary btn-sm"
			onclick={() => guestPasswordStore.fetch(networkId)}
		>
			Retry
		</button>
	{:else if status}
		<div class="guest-password-status">
			<Icon name={status.has_password ? 'check' : 'x'} size={16} />
			<span>{status.has_password ? 'Password is set' : 'No password set (open network)'}</span>
		</div>

		<div class="guest-password-form">
			<label for="guest-password-input" class="sr-only">New guest password</label>
			<input
				id="guest-password-input"
				type="text"
				placeholder="New password (8-63 characters)"
				bind:value={password}
				disabled={guestState.applying}
				autocomplete="off"
			/>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={handleGenerate}
				disabled={guestState.applying}
			>
				Generate
			</button>
		</div>

		{#if validationError}
			<p class="guest-password-error" role="alert">{validationError}</p>
		{/if}
		{#if submitError}
			<p class="guest-password-error" role="alert">{submitError}</p>
		{/if}

		<div class="guest-password-actions">
			<button
				type="button"
				class="btn btn-secondary"
				onclick={requestClearPassword}
				disabled={guestState.applying || !status.has_password}
			>
				{#if guestState.applying}<span class="loading-spinner"></span>{/if}
				Clear
			</button>
			<button type="button" class="btn btn-primary" onclick={requestSetPassword} disabled={!canSet}>
				{#if guestState.applying}<span class="loading-spinner"></span>{/if}
				Set Password
			</button>
		</div>
	{/if}
</section>

<style>
	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.guest-password-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.guest-password-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}

	.guest-password-form {
		display: flex;
		gap: var(--space-2);
	}

	.guest-password-form input {
		flex: 1;
		min-width: 0;
	}

	.guest-password-error {
		color: var(--color-danger);
		background: var(--color-danger-bg);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		font-size: 0.875rem;
	}

	.guest-password-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
