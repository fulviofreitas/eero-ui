<!--
  AccountCard

  Account page (phase-6.0-revamp.md § 7 WP7, family 9): the current account's
  name/email/phone/role (read from `authStore`, which already carries them
  from `GET /auth/status`), plus the account-profile write controls:

  - Name and marketing-email consent: unverified, non-settings writes (plan
    § 5), gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES` via `ExperimentalGate`.
  - E-mail and phone changes: gated the same way AND, independently
    server-side, on `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES` - the frontend
    has no entitlement flag for the second gate (there isn't one; one
    eero-ui session is the whole eero account, lessons-learned.md), so a 403
    `account_identity_disabled` is caught here and rendered as a dedicated
    note naming the env var, rather than a generic error toast. Two-step UI:
    request the change, then enter the verification code.

  Every write goes through a `ConfirmDialog` naming "not verified end-to-end".
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { accountStore, authStore, uiStore } from '$stores';
	import { ApiClientError } from '$api/client';
	import Card from '$components/common/Card.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	let account = $derived($authStore);
	let writeState = $derived($accountStore);

	let nameValue = $state('');
	let emailValue = $state('');
	let emailCode = $state('');
	let phoneValue = $state('');
	let phoneCode = $state('');
	let selectedDialCode = $state('');

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';
	const IDENTITY_DETAIL =
		'This changes the credential eero uses to identify and recover your account.';
	const ACCOUNT_IDENTITY_NOTE =
		'Disabled by operator — set EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES=true to enable, in addition to EERO_DASHBOARD_EXPERIMENTAL_WRITES. One eero-ui session is the whole eero account.';

	let identityDisabledNote = $state<string | null>(null);

	onMount(() => {
		nameValue = account.userName ?? '';
		accountStore.fetchSmsCountries();
	});

	function countryLabel(country: Record<string, unknown>): string {
		const name = country.name ?? country.country ?? country.label;
		return typeof name === 'string' ? name : JSON.stringify(country);
	}

	function countryDialCode(country: Record<string, unknown>): string {
		const code = country.dial_code ?? country.calling_code ?? country.code;
		return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
	}

	function applyDialCode() {
		if (!selectedDialCode) return;
		const prefix = selectedDialCode.startsWith('+') ? selectedDialCode : `+${selectedDialCode}`;
		if (!phoneValue.startsWith(prefix)) {
			phoneValue = prefix;
		}
	}

	async function handleIdentityError(err: unknown, fallback: string): Promise<void> {
		if (err instanceof ApiClientError && err.type === 'account_identity_disabled') {
			identityDisabledNote = ACCOUNT_IDENTITY_NOTE;
			return;
		}
		uiStore.error(err instanceof Error ? err.message : fallback);
	}

	function requestSetName() {
		const name = nameValue.trim();
		if (!name) return;
		uiStore.confirm({
			title: 'Update Name',
			message: `Set account name to "${name}"?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Save',
			onConfirm: async () => {
				try {
					await accountStore.setName(name);
					uiStore.success('Account name updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update name');
				}
			}
		});
	}

	function requestToggleConsent() {
		const next = !writeState.marketingEmailsConsent;
		uiStore.confirm({
			title: 'Update Marketing Consent',
			message: `${next ? 'Opt in to' : 'Opt out of'} marketing e-mails?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: next ? 'Opt In' : 'Opt Out',
			onConfirm: async () => {
				try {
					await accountStore.setConsents(next);
					uiStore.success('Marketing consent updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update consent');
				}
			}
		});
	}

	function requestEmailChange() {
		const email = emailValue.trim();
		if (!email) return;
		identityDisabledNote = null;
		uiStore.confirm({
			title: 'Change E-mail',
			message: `Start an e-mail change to "${email}"?`,
			details: [NOT_VERIFIED_DETAIL, IDENTITY_DETAIL],
			confirmText: 'Continue',
			danger: true,
			onConfirm: async () => {
				try {
					await accountStore.requestEmailChange(email);
					uiStore.success('Verification code sent to the new e-mail address');
				} catch (err) {
					await handleIdentityError(err, 'Failed to start e-mail change');
				}
			}
		});
	}

	async function submitEmailCode() {
		const code = emailCode.trim();
		if (!code) return;
		try {
			await accountStore.verifyEmailChange(code);
			emailValue = '';
			emailCode = '';
			uiStore.success('E-mail address updated');
		} catch (err) {
			await handleIdentityError(err, 'Failed to verify e-mail change');
		}
	}

	function requestPhoneChange() {
		const phone = phoneValue.trim();
		if (!phone) return;
		identityDisabledNote = null;
		uiStore.confirm({
			title: 'Change Phone Number',
			message: `Start a phone-number change to "${phone}"?`,
			details: [NOT_VERIFIED_DETAIL, IDENTITY_DETAIL],
			confirmText: 'Continue',
			danger: true,
			onConfirm: async () => {
				try {
					await accountStore.requestPhoneChange(phone);
					uiStore.success('Verification code sent to the new phone number');
				} catch (err) {
					await handleIdentityError(err, 'Failed to start phone change');
				}
			}
		});
	}

	async function submitPhoneCode() {
		const code = phoneCode.trim();
		if (!code) return;
		try {
			await accountStore.verifyPhoneChange(code);
			phoneValue = '';
			phoneCode = '';
			uiStore.success('Phone number updated');
		} catch (err) {
			await handleIdentityError(err, 'Failed to verify phone change');
		}
	}
</script>

<Card title="Account">
	<section class="account-section">
		<h4>Profile</h4>
		<dl class="info-list">
			<div class="info-row">
				<dt>Name</dt>
				<dd>{account.userName ?? '—'}</dd>
			</div>
			<div class="info-row">
				<dt>E-mail</dt>
				<dd>{account.userEmail ?? '—'}</dd>
			</div>
			<div class="info-row">
				<dt>Phone</dt>
				<dd>{account.userPhone ?? '—'}</dd>
			</div>
			{#if account.userRole}
				<div class="info-row">
					<dt>Role</dt>
					<dd>{account.userRole}</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="account-section">
		<h4>Name</h4>
		<ExperimentalGate>
			<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestSetName())}>
				<input
					class="text-input"
					type="text"
					bind:value={nameValue}
					disabled={writeState.applying}
					placeholder="Display name"
					aria-label="Display name"
					maxlength={64}
				/>
				<button
					type="submit"
					class="btn btn-primary btn-sm"
					disabled={writeState.applying || !nameValue.trim()}
				>
					Save
				</button>
			</form>
		</ExperimentalGate>
	</section>

	<section class="account-section">
		<h4>Marketing Consent</h4>
		<ExperimentalGate>
			<div class="badge-row-actions">
				<span class="badge {writeState.marketingEmailsConsent ? 'badge-success' : 'badge-neutral'}">
					{writeState.marketingEmailsConsent === null
						? 'Unknown (no read-back available)'
						: writeState.marketingEmailsConsent
							? 'Opted in'
							: 'Opted out'}
				</span>
				<button class="btn btn-secondary btn-sm" onclick={requestToggleConsent}>
					{writeState.marketingEmailsConsent ? 'Opt Out' : 'Opt In'}
				</button>
			</div>
		</ExperimentalGate>
	</section>

	<section class="account-section">
		<h4>E-mail</h4>
		<ExperimentalGate>
			{#if identityDisabledNote}
				<p class="identity-note text-muted text-sm" role="note">{identityDisabledNote}</p>
			{/if}
			{#if writeState.emailChangePending}
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), submitEmailCode())}>
					<input
						class="text-input"
						type="text"
						bind:value={emailCode}
						disabled={writeState.applying}
						placeholder="Verification code"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={writeState.applying || !emailCode.trim()}
					>
						Verify
					</button>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick={() => accountStore.cancelEmailChange()}
					>
						Cancel
					</button>
				</form>
			{:else}
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestEmailChange())}>
					<input
						class="text-input"
						type="email"
						bind:value={emailValue}
						disabled={writeState.applying}
						placeholder="New e-mail address"
						aria-label="New e-mail address"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={writeState.applying || !emailValue.trim()}
						aria-label="Change e-mail"
					>
						Change
					</button>
				</form>
			{/if}
		</ExperimentalGate>
	</section>

	<section class="account-section">
		<h4>Phone</h4>
		<ExperimentalGate>
			{#if identityDisabledNote}
				<p class="identity-note text-muted text-sm" role="note">{identityDisabledNote}</p>
			{/if}
			{#if writeState.phoneChangePending}
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), submitPhoneCode())}>
					<input
						class="text-input"
						type="text"
						bind:value={phoneCode}
						disabled={writeState.applying}
						placeholder="Verification code"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={writeState.applying || !phoneCode.trim()}
					>
						Verify
					</button>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick={() => accountStore.cancelPhoneChange()}
					>
						Cancel
					</button>
				</form>
			{:else}
				<form class="inline-form" onsubmit={(e) => (e.preventDefault(), requestPhoneChange())}>
					{#if writeState.smsCountries.length > 0}
						<select
							class="text-input"
							bind:value={selectedDialCode}
							onchange={applyDialCode}
							disabled={writeState.applying}
							aria-label="Country"
						>
							<option value="">Country…</option>
							{#each writeState.smsCountries as country, i (i)}
								<option value={countryDialCode(country)}>
									{countryLabel(country)} ({countryDialCode(country)})
								</option>
							{/each}
						</select>
					{/if}
					<input
						class="text-input"
						type="text"
						bind:value={phoneValue}
						disabled={writeState.applying}
						placeholder="New phone number"
						aria-label="New phone number"
					/>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={writeState.applying || !phoneValue.trim()}
						aria-label="Change phone number"
					>
						Change
					</button>
				</form>
			{/if}
		</ExperimentalGate>
	</section>
</Card>

<style>
	.account-section {
		margin-bottom: var(--space-6);
	}

	.account-section:last-child {
		margin-bottom: 0;
	}

	.account-section h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-row dt {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.info-row dd {
		margin: 0;
	}

	.badge-row-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.inline-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.text-input {
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.identity-note {
		margin: 0 0 var(--space-2);
	}
</style>
