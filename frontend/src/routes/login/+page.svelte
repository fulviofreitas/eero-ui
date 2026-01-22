<!--
  Login Page
  
  Two-step authentication: email/phone entry, then OTP verification.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore, isLoginPending, authError, isAuthLoading } from '$stores';

	let identifier = '';
	let code = '';

	async function handleLogin() {
		if (!identifier.trim()) return;
		const success = await authStore.login(identifier.trim());
		if (success) {
			code = ''; // Clear any previous code
		}
	}

	async function handleVerify() {
		if (!code.trim()) return;
		const success = await authStore.verify(code.trim());
		if (success) {
			goto('/');
		}
	}

	function handleBack() {
		authStore.cancelLogin();
		identifier = '';
		code = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			if ($isLoginPending) {
				handleVerify();
			} else {
				handleLogin();
			}
		}
	}
</script>

<svelte:head>
	<title>Login | Eero Dashboard</title>
</svelte:head>

<div class="login-container">
	<div class="login-card">
		<div class="login-header">
			<div class="logo">
				<img src="/logo.png" alt="eero" class="logo-img" />
				<span class="logo-text">eero</span>
			</div>
			<h1>Dashboard</h1>
			<p class="text-muted">Sign in to manage your network</p>
		</div>

		{#if $authError}
			<div class="error-message">
				{$authError}
			</div>
		{/if}

		{#if $isLoginPending}
			<!-- Verification step -->
			<div class="login-form">
				<div class="step-indicator">
					<span class="step-number">2</span>
					<span>Enter verification code</span>
				</div>

				<p class="text-sm text-muted">
					We sent a verification code to your email or phone. Enter it below to continue.
				</p>

				<input
					type="text"
					class="input code-input"
					placeholder="Enter 6-digit code"
					bind:value={code}
					on:keydown={handleKeydown}
					disabled={$isAuthLoading}
					autocomplete="one-time-code"
					inputmode="numeric"
					maxlength="6"
				/>

				<button
					class="btn btn-primary btn-full"
					on:click={handleVerify}
					disabled={$isAuthLoading || !code.trim()}
				>
					{#if $isAuthLoading}
						<span class="loading-spinner"></span>
					{/if}
					Verify
				</button>

				<button class="btn btn-ghost btn-full" on:click={handleBack} disabled={$isAuthLoading}>
					← Back
				</button>
			</div>
		{:else}
			<!-- Login step -->
			<div class="login-form">
				<div class="step-indicator">
					<span class="step-number">1</span>
					<span>Enter your email or phone</span>
				</div>

				<input
					type="text"
					class="input"
					placeholder="Email or phone number"
					bind:value={identifier}
					on:keydown={handleKeydown}
					disabled={$isAuthLoading}
					autocomplete="email"
				/>

				<button
					class="btn btn-primary btn-full"
					on:click={handleLogin}
					disabled={$isAuthLoading || !identifier.trim()}
				>
					{#if $isAuthLoading}
						<span class="loading-spinner"></span>
					{/if}
					Continue
				</button>
			</div>
		{/if}

		<div class="login-footer">
			<p class="text-xs text-muted">
				This dashboard connects to your Eero account using the same login you use with the Eero app.
			</p>
		</div>
	</div>
</div>

<style>
	.login-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
	}

	.login-card {
		width: 100%;
		max-width: 380px;
		background-color: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--space-8);
	}

	.login-header {
		text-align: center;
		margin-bottom: var(--space-8);
	}

	.logo {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: var(--space-4);
	}

	.logo-img {
		width: 40px;
		height: 40px;
		object-fit: contain;
	}

	.login-header h1 {
		font-size: 1.25rem;
		margin-bottom: var(--space-2);
	}

	.error-message {
		background-color: var(--color-danger-bg);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
		font-size: 0.875rem;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.step-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background-color: var(--color-accent);
		color: #ffffff;
		border-radius: 50%;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.code-input {
		text-align: center;
		font-size: 1.5rem;
		font-family: var(--font-mono);
		letter-spacing: 0.5em;
		padding: var(--space-4);
	}

	.btn-full {
		width: 100%;
	}

	.login-footer {
		margin-top: var(--space-8);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border-muted);
		text-align: center;
	}
</style>
