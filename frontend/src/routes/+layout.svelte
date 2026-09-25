<!--
  Root Layout
  
  Main application layout with sidebar navigation and global components.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto, afterNavigate, onNavigate } from '$app/navigation';
	import { shouldUseViewTransition } from '$lib/motion';
	import { isCommandPaletteShortcut, isShortcutsHelpKey, isTypingTarget } from '$lib/shortcuts';
	import {
		authStore,
		isAuthenticated,
		isAuthLoading,
		networksStore,
		selectedNetwork,
		devicesStore,
		DEVICE_FILTERS_STORAGE_KEY,
		entitlementsStore,
		userEmail,
		userName,
		userRole
	} from '$stores';
	import { uiStore, theme, sidebarOpen } from '$lib/stores/ui';
	import { api } from '$api/client';
	import Toast from '$components/common/Toast.svelte';
	import ConfirmDialog from '$components/common/ConfirmDialog.svelte';
	import CommandPalette from '$components/common/CommandPalette.svelte';
	import ShortcutsHelp from '$components/common/ShortcutsHelp.svelte';
	import Icon from '$components/common/Icon.svelte';
	import IconSprite from '$lib/icons/IconSprite.svelte';
	import type { IconName } from '$lib/icons/paths';
	import '../app.css';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	let initialized = $state(false);
	let eeroClientVersion: string | null = $state(null);
	let sidebarToggleEl: HTMLButtonElement | undefined = $state();
	let sidebarEl: HTMLElement | undefined = $state();
	let wasSidebarOpen = false;
	let commandPaletteOpen = $state(false);
	let shortcutsHelpOpen = $state(false);

	function isMobileViewport(): boolean {
		return typeof window !== 'undefined' && window.innerWidth <= 768;
	}

	// Mobile-only focus management: moving focus into/out of an overlay sidebar keeps keyboard
	// users oriented. On desktop the sidebar is a persistent layout element, not an overlay, so
	// stealing focus on every toggle would be disruptive there.
	$effect(() => {
		const open = $sidebarOpen;
		if (!isMobileViewport()) {
			wasSidebarOpen = open;
			return;
		}
		if (open && !wasSidebarOpen) {
			sidebarEl?.querySelector<HTMLElement>('.nav-item')?.focus();
		} else if (!open && wasSidebarOpen) {
			sidebarToggleEl?.focus();
		}
		wasSidebarOpen = open;
	});

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && $sidebarOpen && isMobileViewport()) {
			uiStore.closeSidebar();
		}

		// The command palette and shortcuts help are authenticated-only surfaces (S1): they search
		// account data (devices/eeros/profiles/networks) that must not be reachable from /login.
		if (!$isAuthenticated) return;

		// ⌘K / Ctrl+K always opens the command palette, even while typing elsewhere - it IS the
		// modifier combo the "ignore while typing" rule carves out an exception for.
		if (isCommandPaletteShortcut(event)) {
			event.preventDefault();
			commandPaletteOpen = true;
			return;
		}

		// Bare "?" opens the shortcuts help dialog, but never while the user is typing in a field
		// (a "?" in a search box must stay a literal "?") or while the palette is already open.
		if (isShortcutsHelpKey(event) && !isTypingTarget(event.target) && !commandPaletteOpen) {
			event.preventDefault();
			shortcutsHelpOpen = true;
		}
	}

	// S1: on logout AND on a 401-driven `auth:unauthorized` transition, drop every cache that
	// holds account data so a subsequent login (possibly to a different account, on a shared
	// machine) never sees a stale previous session's devices/networks/entitlements or search
	// history. The command palette's own in-memory eero/profile caches are covered by unmounting
	// it below rather than by this function - there is no store to clear.
	function resetSessionState(): void {
		devicesStore.clear();
		networksStore.clear();
		entitlementsStore.clear();
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('commandPalette:recent');
			localStorage.removeItem(DEVICE_FILTERS_STORAGE_KEY);
		}
	}

	let wasAuthenticated = false;
	$effect(() => {
		const authed = $isAuthenticated;
		if (wasAuthenticated && !authed) {
			resetSessionState();
			commandPaletteOpen = false;
			shortcutsHelpOpen = false;
		}
		wasAuthenticated = authed;
	});

	onMount(async () => {
		uiStore.initTheme();
		uiStore.initSidebar();

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

	// Fetch networks when authenticated. Awaited (issue #401): `networksStore.fetch()`
	// re-asserts the preferred network on the backend before it resolves, and pages
	// (dashboard, devices, eeros, ...) fetch network-scoped data from their own
	// `onMount` reactively off `$selectedNetworkId` - that data must not be requested
	// until the backend's preferred network matches the frontend's selection.
	$effect(() => {
		if (initialized && $isAuthenticated) {
			void networksStore.fetch();
		}
	});

	// Fetch entitlements once per selected network (plan § 7 WP6) - this is
	// the single call that gates every premium card and unverified/
	// settings-class write control, so it must fire on the initial
	// auto-selected network too, not only on an explicit switch.
	$effect(() => {
		const networkId = $selectedNetwork?.id;
		if (networkId) {
			entitlementsStore.fetch(networkId);
		} else {
			entitlementsStore.clear();
		}
	});

	// Reactive navigation guard
	$effect(() => {
		if (
			initialized &&
			!$isAuthLoading &&
			!$isAuthenticated &&
			!$page.url.pathname.startsWith('/login')
		) {
			goto('/login');
		}
	});

	// Navigation items (base items)
	const baseNavItems: { path: string; label: string; icon: IconName }[] = [
		{ path: '/', label: 'Dashboard', icon: 'dashboard' },
		{ path: '/devices', label: 'Devices', icon: 'devices' },
		{ path: '/eeros', label: 'Eeros', icon: 'eeros' },
		{ path: '/profiles', label: 'Profiles', icon: 'profiles' },
		{ path: '/topology', label: 'Topology', icon: 'topology' },
		{ path: '/account', label: 'Account', icon: 'person' }
	];

	// Dynamic nav items including network link
	let navItems = $derived(
		[
			baseNavItems[0], // Dashboard
			$selectedNetwork
				? { path: `/network/${$selectedNetwork.id}`, label: 'Network', icon: 'network' as IconName }
				: null,
			...baseNavItems.slice(1, 4), // Devices, Eeros, Profiles
			{ path: '/topology', label: 'Topology', icon: 'topology' as IconName }, // Topology at the end
			baseNavItems[5] // Account
		].filter(Boolean) as { path: string; label: string; icon: IconName }[]
	);

	// Close sidebar on navigation (mobile only)
	afterNavigate(() => {
		if (typeof window !== 'undefined' && window.innerWidth <= 768) {
			uiStore.closeSidebar();
		}
	});

	// Motion polish (WP9 § 6.2 Tier 3): wrap route changes in a View Transition when the browser
	// supports it and the user hasn't asked for reduced motion (shouldUseViewTransition - see
	// lib/motion.ts). SvelteKit's own `document.startViewTransition` promise settles once the DOM
	// update `navigation.complete` resolves, so the whole thing is a one-line guard around that.
	onNavigate((navigation) => {
		if (!shouldUseViewTransition()) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	async function handleLogout() {
		resetSessionState();
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

<!-- Fonts (Inter, JetBrains Mono) are self-hosted via @font-face in app.css (WP9 perf,
     plan § 6.2 Tier 4) - no external Google Fonts request. -->

<svelte:window onkeydown={handleWindowKeydown} />

<IconSprite />

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
		<button
			class="theme-toggle-btn login-theme-toggle"
			onclick={() => uiStore.toggleTheme()}
			title={$theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
			aria-label={$theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		>
			<Icon name={$theme === 'dark' ? 'sun' : 'moon'} size={14} />
		</button>
		{@render children?.()}
	</main>
{:else}
	<!-- A14 (WP5 a11y fix): skip link to main content, ahead of the sidebar in DOM/tab order. -->
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<!-- Main app layout -->
	<div class="app-layout" class:sidebar-open={$sidebarOpen}>
		<!-- Sidebar overlay (mobile) -->
		{#if $sidebarOpen}
			<div class="sidebar-overlay" role="presentation" onclick={() => uiStore.closeSidebar()}></div>
		{/if}

		<!-- Sidebar -->
		<aside class="sidebar" class:open={$sidebarOpen} bind:this={sidebarEl}>
			<div class="sidebar-header">
				<!-- A14 (WP5 a11y fix): brand mark, not a document heading - the page itself owns its
				     own <h1> per route. -->
				<div class="logo">
					<img src="/logo.png" alt="eero" class="logo-img" width="28" height="28" />
					<span class="logo-text">eero</span>
				</div>
			</div>

			<nav class="sidebar-nav">
				{#each navItems as item}
					{@const isActive =
						$page.url.pathname === item.path ||
						(item.label === 'Network' && $page.url.pathname.startsWith('/network/'))}
					<a
						href={item.path}
						class="nav-item"
						class:active={isActive}
						aria-current={isActive ? 'page' : undefined}
					>
						<span class="nav-icon"><Icon name={item.icon} size={18} /></span>
						<span class="nav-label">{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="sidebar-footer">
				{#if eeroClientVersion}
					<a
						href="https://github.com/fulviofreitas/eero-api"
						target="_blank"
						rel="noopener noreferrer"
						class="version-row version-link"
					>
						<span class="version-label">eero-api</span>
						<span class="version-chip">v{eeroClientVersion}</span>
					</a>
				{/if}
				<a
					href="https://github.com/fulviofreitas/eero-ui"
					target="_blank"
					rel="noopener noreferrer"
					class="version-row version-link"
				>
					<span class="version-label">eero-ui</span>
					<span class="version-chip">v{__APP_VERSION__}</span>
				</a>
			</div>
		</aside>

		<!-- Main content -->
		<main class="main-content">
			<!-- Top bar with account info and network selector -->
			<div class="top-bar">
				<!-- Hamburger toggle -->
				<button
					class="sidebar-toggle"
					onclick={() => uiStore.toggleSidebar()}
					aria-label="Toggle navigation"
					aria-expanded={$sidebarOpen}
					bind:this={sidebarToggleEl}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<line x1="3" y1="6" x2="21" y2="6"></line>
						<line x1="3" y1="12" x2="21" y2="12"></line>
						<line x1="3" y1="18" x2="21" y2="18"></line>
					</svg>
				</button>

				<!-- Account info (left) -->
				<div class="account-info">
					{#if $userName || $userEmail}
						<span class="account-name">{$userName || $userEmail}</span>
					{/if}
					{#if $userRole}
						<span class="account-role">{$userRole}</span>
					{/if}
				</div>

				<!-- Network selector, search, status, theme and sign-out - one right-aligned,
				     vertically-centred row (bug-fix follow-up: these used to be split across three
				     stacked rows in `.top-bar-right`). Wraps only below --bp-sm. -->
				<div class="top-bar-right">
					{#if $networksStore.networks.length > 0}
						<div class="network-row">
							<div class="network-bar-inner">
								<span class="status-indicator" class:online={$selectedNetwork?.status === 'online'}
								></span>
								<select
									class="network-select"
									aria-label="Network"
									onchange={(e) => handleNetworkChange(e.currentTarget.value)}
								>
									{#each $networksStore.networks as network (network.id)}
										<option value={network.id} selected={network.id === $selectedNetwork?.id}>
											{network.name}
										</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}
					<button
						class="command-palette-btn"
						onclick={() => (commandPaletteOpen = true)}
						title="Search (⌘K)"
					>
						<Icon name="search" size={14} />
						Search
						<kbd class="command-palette-kbd" aria-hidden="true">⌘K</kbd>
					</button>
					<span class="status-dot online"></span>
					<button
						class="theme-toggle-btn"
						onclick={() => uiStore.toggleTheme()}
						title={$theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
						aria-label={$theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
					>
						<Icon name={$theme === 'dark' ? 'sun' : 'moon'} size={14} />
					</button>
					<button class="signout-btn" onclick={handleLogout} title="Sign out"> Sign out </button>
				</div>
			</div>

			<div class="page-content" id="main-content" tabindex="-1">
				{@render children?.()}
			</div>
		</main>
	</div>
{/if}

<!-- Global components -->
<Toast />
<ConfirmDialog />
<!-- S1: authenticated-only - both search account data, so neither should exist (let alone be
     reachable via ⌘K/"?") once the session ends. -->
{#if $isAuthenticated}
	<CommandPalette bind:open={commandPaletteOpen} />
	<ShortcutsHelp bind:open={shortcutsHelpOpen} />
{/if}

<style>
	/* A14 (WP5 a11y fix): visually hidden until focused (keyboard Tab from page load), then
	   pinned to the top so it's never obscured by the sidebar/top-bar. */
	.skip-link {
		position: absolute;
		left: -9999px;
		top: 0;
		z-index: var(--z-toast);
		padding: var(--space-2) var(--space-4);
		background: var(--color-accent);
		color: var(--color-on-accent);
		border-radius: var(--radius-md);
	}

	.skip-link:focus-visible {
		left: var(--space-4);
		top: var(--space-4);
	}

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
		z-index: var(--z-sidebar);
		transition: transform var(--transition-normal);
	}

	.sidebar:not(.open) {
		transform: translateX(-100%);
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

	.logo-img {
		width: 28px;
		height: 28px;
		object-fit: contain;
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
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.nav-item:hover {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	/* A8 (WP5 a11y fix): the tint's alpha was 0.15 (plus a dead duplicate solid-accent
	   declaration overridden by it). Composited over the light theme's --color-bg-secondary,
	   --color-accent text on that tint measured 4.33:1 (below AA 4.5:1); 0.08 measures 4.56:1 in
	   light and improves dark theme's already-passing 5.31:1 to 6.05:1. */
	.nav-item.active {
		background-color: rgba(88, 166, 255, 0.08);
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
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.version-link {
		text-decoration: none;
		border-radius: var(--radius-sm);
		padding: 4px 0;
		margin: -4px 0;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.version-link:hover {
		background: var(--color-bg-tertiary);
	}

	.version-link:hover .version-label {
		color: var(--color-accent);
	}

	.version-link:hover .version-chip {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	/* Main content */
	.main-content {
		flex: 1;
		margin-left: 0;
		min-height: 100vh;
		overflow-x: auto;
		display: flex;
		flex-direction: column;
		transition: margin-left var(--transition-normal);
	}

	.app-layout.sidebar-open .main-content {
		margin-left: 240px;
	}

	/* Top bar with account and network (WP9 shell polish, plan § 6.2 Tier 4). The previous
	   gradient-to-transparent background let scrolled content show through the lower half of
	   the bar; a solid background is the baseline, with backdrop-filter blur layered on top
	   for browsers that support it. */
	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-6);
		background: var(--color-bg-secondary);
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		gap: var(--space-4);
	}

	@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
		.top-bar {
			background: color-mix(in srgb, var(--color-bg-secondary) 85%, transparent);
			backdrop-filter: blur(8px);
			-webkit-backdrop-filter: blur(8px);
		}
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
		background-color: var(--color-success);
		box-shadow: 0 0 6px var(--color-success);
	}

	.account-name {
		color: var(--color-text-primary);
		font-weight: 500;
	}

	/* A5 (WP9 a11y fix): --color-text-muted on --color-bg-tertiary measured 4.08:1 (dark) /
	   4.30:1 (light) - below AA 4.5:1. --color-text-secondary measures 4.95:1 (dark) / ~4.50:1
	   (light). */
	.account-role {
		color: var(--color-text-secondary);
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

	/* One right-aligned, vertically-centred row (bug-fix follow-up: network selector, search,
	   status dot, theme toggle and sign-out used to be split across three stacked rows here). */
	.top-bar-right {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	/* Wrap only below --bp-sm (app.css:148, 480px) - above that, the row stays on one line. */
	@media (max-width: 480px) {
		.top-bar-right {
			flex-wrap: wrap;
			justify-content: flex-end;
		}
	}

	.theme-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--color-border-muted);
		padding: 4px;
		border-radius: 50%;
		width: 26px;
		height: 26px;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.theme-toggle-btn:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: var(--color-info-bg);
	}

	.login-theme-toggle {
		position: fixed;
		top: var(--space-4);
		right: var(--space-4);
		z-index: var(--z-sticky);
	}

	.command-palette-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		background: none;
		border: 1px solid var(--color-border-muted);
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.command-palette-btn:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	/* A5: same --color-text-muted-on-tertiary contrast fix as .account-role above. */
	.command-palette-kbd {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-muted);
		color: var(--color-text-secondary);
	}

	.signout-btn {
		background: none;
		border: 1px solid var(--color-border-muted);
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.signout-btn:hover {
		border-color: var(--color-danger);
		color: var(--color-danger);
		background: var(--color-danger-bg);
	}

	.network-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.network-bar-inner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px 14px;
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-muted);
		border-radius: 20px;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.network-bar-inner:hover {
		background: var(--color-bg-elevated);
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
		background-color: var(--color-success);
		box-shadow: 0 0 6px var(--color-success);
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
		color: var(--color-text-primary);
	}

	.network-select:focus-visible {
		box-shadow: var(--focus-ring);
	}

	.network-select option {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		padding: 8px;
	}

	/* Page content - contained width (WP9 shell polish, plan § 6.2 Tier 4). Tables/other
	   full-bleed elements remain full-width *within* this container. */
	.page-content {
		flex: 1;
		width: 100%;
		max-width: 1440px;
		margin: 0 auto;
		padding: var(--space-6);
		padding-top: var(--space-4);
	}

	/* Hamburger toggle button */
	.sidebar-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--color-border-muted);
		padding: 6px;
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
		flex-shrink: 0;
	}

	.sidebar-toggle:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	/* Overlay backdrop — hidden on desktop, enabled in mobile media query */
	.sidebar-overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: var(--z-overlay);
	}

	@media (max-width: 768px) {
		/* Sidebar overlays content on mobile — never push the main content */
		.app-layout.sidebar-open .main-content {
			margin-left: 0;
		}

		/* Show overlay backdrop on mobile when sidebar is open */
		.sidebar-overlay {
			display: block;
		}
	}
</style>
