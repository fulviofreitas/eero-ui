<!--
  NetworkPasswordCard

  Sets/clears the network's own Wi-Fi password (phase-6.0-revamp.md § 5,
  § 7 WP8, family 12): `PUT/DELETE /networks/{id}/password`. Mirrors
  `GuestPasswordCard.svelte`, adjusted for this family's own contract:

  - Set: input + "Generate" (16 printable-ASCII characters), 8-63 chars,
    never displayed again after submit.
  - Clear: requires an explicit "I understand this opens the network"
    acknowledgement before the danger dialog can be opened (the shared
    `ConfirmDialog` has no slot for embedded controls, so the checkbox
    gates the dialog rather than living inside it) - the dialog itself
    carries the "the network becomes OPEN" wording.
  - `reboot_expected: false` - this disconnects clients while it takes
    effect but does not reboot the mesh, so a static "clients will
    reconnect" note is shown instead of a settings-class applying state.
-->
<script lang="ts">
	import { networkPasswordStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	const PASSWORD_MIN = 8;
	const PASSWORD_MAX = 63;
	const GENERATED_LENGTH = 16;
	// Printable ASCII, excluding characters easily confused when read aloud/copied.
	const GENERATOR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

	let password = $state('');
	let showPassword = $state(false);
	let openAcknowledged = $state(false);
	let submitError: string | null = $state(null);
	let lastNote: string | null = $state(null);

	let passwordState = $derived($networkPasswordStore);

	const validationError = $derived.by(() => {
		if (!password) return null;
		if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
			return `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`;
		}
		if (![...password].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f)) {
			return 'Password must be printable ASCII.';
		}
		return null;
	});

	const canSet = $derived(password.length > 0 && !validationError && !passwordState.applying);
	const canClear = $derived(openAcknowledged && !passwordState.applying);

	function generatePassword(): string {
		const bytes = new Uint32Array(GENERATED_LENGTH);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (n) => GENERATOR_ALPHABET[n % GENERATOR_ALPHABET.length]).join('');
	}

	function handleGenerate() {
		password = generatePassword();
		submitError = null;
		// S3: a generated password is useless if the operator can't read it to hand it out -
		// reveal it automatically rather than requiring a separate toggle click.
		showPassword = true;
	}

	function requestSetPassword() {
		if (!canSet) return;
		uiStore.confirm({
			title: 'Set Network Password?',
			message: 'This disconnects every client on this network while the change applies.',
			details: [
				'Every device currently connected to this network will be disconnected.',
				'They will need the new password to reconnect. The network itself will not restart.'
			],
			confirmText: 'Set Password',
			danger: true,
			onConfirm: submitSetPassword,
			onCancel: clearPasswordField
		});
	}

	// S3: clear the local password value on every exit from the confirm flow - cancel, error, or
	// success - so it never lingers in memory/DOM longer than necessary.
	function clearPasswordField() {
		password = '';
		showPassword = false;
	}

	function requestClearPassword() {
		if (!canClear) return;
		uiStore.confirm({
			title: 'Clear Network Password?',
			message: 'The network becomes OPEN (no password required).',
			details: [
				'The network becomes OPEN - anyone in range can connect without a password.',
				'Every device currently connected to this network will be disconnected and will need ' +
					'to reconnect.'
			],
			confirmText: 'Clear Password',
			danger: true,
			onConfirm: submitClearPassword
		});
	}

	async function submitSetPassword(): Promise<void> {
		submitError = null;
		lastNote = null;
		try {
			const result = await networkPasswordStore.setPassword(networkId, password);
			lastNote = result.disconnects_clients
				? 'Clients will reconnect using the new password.'
				: null;
			uiStore.success('Network password set.');
		} catch (error) {
			if (error instanceof ApiClientError && error.status === 422) {
				submitError = error.detail;
				return;
			}
			uiStore.error(error instanceof Error ? error.message : 'Failed to set network password');
		} finally {
			clearPasswordField();
		}
	}

	async function submitClearPassword(): Promise<void> {
		submitError = null;
		lastNote = null;
		try {
			const result = await networkPasswordStore.clearPassword(networkId);
			openAcknowledged = false;
			lastNote = result.open_network
				? 'The network is now open. Clients will reconnect automatically.'
				: null;
			uiStore.success('Network password cleared.');
		} catch (error) {
			uiStore.error(error instanceof Error ? error.message : 'Failed to clear network password');
		}
	}
</script>

<section class="card info-card network-password-card">
	<h2>Network Wi-Fi Password</h2>

	<div class="network-password-form">
		<label for="network-password-input" class="sr-only">New network password</label>
		<input
			id="network-password-input"
			type={showPassword ? 'text' : 'password'}
			placeholder="New password (8-63 characters)"
			bind:value={password}
			disabled={passwordState.applying}
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
		<button
			type="button"
			class="btn btn-secondary btn-sm"
			onclick={handleGenerate}
			disabled={passwordState.applying}
		>
			Generate
		</button>
	</div>

	{#if validationError}
		<p class="network-password-error" role="alert">{validationError}</p>
	{/if}
	{#if submitError}
		<p class="network-password-error" role="alert">{submitError}</p>
	{/if}
	{#if lastNote}
		<p class="network-password-note" role="status">{lastNote}</p>
	{/if}

	<div class="network-password-actions">
		<button type="button" class="btn btn-primary" onclick={requestSetPassword} disabled={!canSet}>
			{#if passwordState.applying}<span class="loading-spinner"></span>{/if}
			Set Password
		</button>
	</div>

	<div class="network-password-clear">
		<label class="checkbox-inline">
			<input type="checkbox" bind:checked={openAcknowledged} disabled={passwordState.applying} />
			I understand clearing the password opens this network to anyone in range.
		</label>
		<button
			type="button"
			class="btn btn-danger"
			onclick={requestClearPassword}
			disabled={!canClear}
		>
			{#if passwordState.applying}<span class="loading-spinner"></span>{/if}
			Clear Password
		</button>
	</div>
</section>

<style>
	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.network-password-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.network-password-form {
		display: flex;
		gap: var(--space-2);
	}

	.network-password-form input {
		flex: 1;
		min-width: 0;
	}

	.network-password-error {
		color: var(--color-danger);
		background: var(--color-danger-bg);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		font-size: 0.875rem;
	}

	.network-password-note {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.network-password-actions {
		display: flex;
		justify-content: flex-end;
	}

	.network-password-clear {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-end;
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-muted);
	}

	.checkbox-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}
</style>
