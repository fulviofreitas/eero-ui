<!--
  Root Layout
  
  Main application layout with sidebar navigation and global components.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		authStore,
		isAuthenticated,
		isAuthLoading,
		networksStore,
		selectedNetwork,
		devicesStore,
		userEmail,
		userName,
		userRole
	} from '$stores';
	import { api } from '$api/client';
	import Toast from '$components/common/Toast.svelte';
	import ConfirmDialog from '$components/common/ConfirmDialog.svelte';
	import '../app.css';

	let initialized = false;
	let eeroClientVersion: string | null = null;

	onMount(async () => {
		// Fetch API version info
		try {
			const health = await api.health();
			eeroClientVersion = health.eero_client_version;
		} catch {
			// Silently ignore - version display is non-critical
		}

		await authStore.checkStatus();
		initialized = true;
	});

	// Fetch networks when authenticated
	$: if (initialized && $isAuthenticated) {
		networksStore.fetch();
	}

	// Reactive navigation guard
	$: if (
		initialized &&
		!$isAuthLoading &&
		!$isAuthenticated &&
		!$page.url.pathname.startsWith('/login')
	) {
		goto('/login');
	}

	// Navigation items (base items)
	const baseNavItems = [
		{ path: '/', label: 'Dashboard', icon: '📊' },
		{ path: '/devices', label: 'Devices', icon: '📱' },
		{ path: '/eeros', label: 'Eeros', icon: '📡' },
		{ path: '/profiles', label: 'Profiles', icon: '👥' },
		{ path: '/topology', label: 'Topology', icon: '🗺️' }
	];

	// Dynamic nav items including network link
	$: navItems = [
		baseNavItems[0], // Dashboard
		{ path: '/topology', label: 'Topology', icon: '🗺️' }, // Topology right after Dashboard
		$selectedNetwork
			? { path: `/network/${$selectedNetwork.id}`, label: 'Network', icon: '🌐' }
			: null,
		...baseNavItems.slice(1, 4) // Devices, Eeros, Profiles
	].filter(Boolean) as { path: string; label: string; icon: string }[];

	async function handleLogout() {
		networksStore.clear();
		await authStore.logout();
		goto('/login');
	}

	async function handleNetworkChange(networkId: string) {
		await networksStore.selectNetwork(networkId);
		// Refresh device data for the new network
		devicesStore.clear();
		devicesStore.fetch(true);
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if !initialized || $isAuthLoading}
	<!-- Loading state -->
	<div class="loading-screen">
		<div class="loading-content">
			<span class="loading-spinner large"></span>
			<span>Loading...</span>
		</div>
	</div>
{:else if !$isAuthenticated && !$page.url.pathname.startsWith('/login')}
	<!-- Redirecting to login -->
	<div class="loading-screen">
		<span>Redirecting to login...</span>
	</div>
{:else if $page.url.pathname.startsWith('/login')}
	<!-- Login page - no sidebar -->
	<main class="login-layout">
		<slot />
	</main>
{:else}
	<!-- Main app layout -->
	<div class="app-layout">
		<!-- Sidebar -->
		<aside class="sidebar">
			<div class="sidebar-header">
				<h1 class="logo">
					<span class="logo-icon">◎</span>
					<span class="logo-text">eero</span>
				</h1>
			</div>

			<nav class="sidebar-nav">
				{#each navItems as item}
					<a
						href={item.path}
						class="nav-item"
						class:active={$page.url.pathname === item.path ||
							(item.label === 'Network' && $page.url.pathname.startsWith('/network/'))}
					>
						<span class="nav-icon">{item.icon}</span>
						<span class="nav-label">{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="sidebar-footer">
				{#if eeroClientVersion}
					<div class="version-row">
						<span class="version-label">eero-api</span>
						<span class="version-chip">v{eeroClientVersion}</span>
					</div>
				{/if}
				<div class="version-row">
					<span class="version-label">eero-ui</span>
					<span class="version-chip">v{__APP_VERSION__}</span>
				</div>
			</div>
		</aside>

		<!-- Main content -->
		<main class="main-content">
			<!-- Top bar with account info and network selector -->
			<div class="top-bar">
				<!-- Account info (left) -->
				<div class="account-info">
					{#if $userName || $userEmail}
						<span class="account-name">{$userName || $userEmail}</span>
					{/if}
					{#if $userRole}
						<span class="account-role">{$userRole}</span>
					{/if}
				</div>

				<!-- Network + Sign out (right, stacked) -->
				<div class="top-bar-right">
					<div class="signout-row">
						<span class="status-dot online"></span>
						<button class="signout-btn" on:click={handleLogout} title="Sign out"> Sign out </button>
					</div>
					{#if $networksStore.networks.length > 0}
						<div class="network-bar-inner">
							<span class="status-indicator" class:online={$selectedNetwork?.status === 'online'}
							></span>
							<select
								class="network-select"
								on:change={(e) => handleNetworkChange(e.currentTarget.value)}
							>
								{#each $networksStore.networks as network (network.id)}
									<option value={network.id} selected={network.id === $selectedNetwork?.id}>
										{network.name}
									</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			</div>

			<div class="page-content">
				<slot />
			</div>
		</main>
	</div>
{/if}

<!-- Global components -->
<Toast />
<ConfirmDialog />

<style>
	.loading-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		color: var(--color-text-secondary);
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}

	.loading-spinner.large {
		width: 40px;
		height: 40px;
		border-width: 3px;
	}

	.login-layout {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.app-layout {
		display: flex;
		min-height: 100vh;
	}

	/* Sidebar */
	.sidebar {
		width: 240px;
		background-color: var(--color-bg-secondary);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 50;
	}

	.sidebar-header {
		padding: var(--space-5);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0;
	}

	.logo-icon {
		font-size: 1.5rem;
		color: var(--color-accent);
	}

	.sidebar-nav {
		flex: 1;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.nav-item:hover {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	.nav-item.active {
		background-color: var(--color-accent);
		background-color: rgba(88, 166, 255, 0.15);
		color: var(--color-accent);
	}

	.nav-icon {
		font-size: 1rem;
	}

	.sidebar-footer {
		padding: var(--space-4);
		border-top: 1px solid var(--color-border-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}

	.version-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.version-chip {
		font-size: 0.625rem;
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		background: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: 10px;
		border: 1px solid var(--color-border-muted);
	}

	/* Main content */
	.main-content {
		flex: 1;
		margin-left: 240px;
		min-height: 100vh;
		overflow-x: auto;
		display: flex;
		flex-direction: column;
	}

	/* Top bar with account and network */
	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-6);
		background: linear-gradient(180deg, var(--color-bg-secondary) 0%, transparent 100%);
		position: sticky;
		top: 0;
		z-index: 40;
		gap: var(--space-4);
	}

	.account-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--color-text-muted);
	}

	.status-dot.online {
		background-color: #10b981;
		box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
	}

	.account-name {
		color: var(--color-text-primary);
		font-weight: 500;
	}

	.account-role {
		color: var(--color-text-muted);
		padding: 2px 8px;
		background: var(--color-bg-tertiary);
		border-radius: 10px;
		font-size: 0.6875rem;
		text-transform: capitalize;
	}

	.premium-badge {
		padding: 2px 8px;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 10px;
		color: #fbbf24;
		font-size: 0.6875rem;
		text-transform: capitalize;
	}

	.top-bar-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-1);
	}

	.signout-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.signout-btn {
		background: none;
		border: 1px solid var(--color-border-muted);
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.signout-btn:hover {
		border-color: var(--color-danger);
		color: var(--color-danger);
		background: rgba(239, 68, 68, 0.1);
	}

	.network-bar-inner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px 14px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--color-border-muted);
		border-radius: 20px;
		transition: all var(--transition-fast);
	}

	.network-bar-inner:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--color-border);
	}

	.status-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.status-indicator.online {
		background-color: #10b981;
		box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
	}

	.network-select {
		background: transparent;
		border: none;
		padding: 0 4px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: color var(--transition-fast);
		min-width: 100px;
	}

	.network-select:hover {
		color: var(--color-text-primary);
	}

	.network-select:focus {
		outline: none;
		color: var(--color-text-primary);
	}

	.network-select option {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		padding: 8px;
	}

	/* Page content */
	.page-content {
		flex: 1;
		padding: var(--space-6);
		padding-top: var(--space-4);
	}

	@media (max-width: 768px) {
		.sidebar {
			transform: translateX(-100%);
			transition: transform var(--transition-normal);
		}

		.main-content {
			margin-left: 0;
		}
	}
</style>
