<!--
  Profiles Page
  
  Manage user profiles and parental controls.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { ProfileSummary } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import ExportMenu from '$components/common/ExportMenu.svelte';

	let profiles: ProfileSummary[] = [];
	let loading = true;
	let error: string | null = null;
	let viewMode: 'blocks' | 'list' = 'blocks';
	let lastNetworkId: string | null = null;
	let showCreateModal = false;
	let newProfileName = '';
	let creating = false;

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchProfiles();
	});

	// React to network changes
	$: if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
		lastNetworkId = $selectedNetworkId;
		fetchProfiles(true);
	}

	async function fetchProfiles(refresh = false) {
		loading = true;
		error = null;
		try {
			const result = await api.profiles.list(refresh);
			console.log('Profiles API response:', result);
			// Ensure we have an array and sort alphabetically by name
			profiles = Array.isArray(result)
				? result.sort((a, b) => {
						const nameA = (a.name || '').toLowerCase();
						const nameB = (b.name || '').toLowerCase();
						return nameA.localeCompare(nameB);
					})
				: [];
		} catch (err) {
			console.error('Failed to load profiles:', err);
			error = err instanceof Error ? err.message : 'Failed to load profiles';
			uiStore.error(error);
			profiles = [];
		} finally {
			loading = false;
		}
	}

	function getProfileKey(profile: ProfileSummary, index: number): string {
		return profile.id || `profile-${index}`;
	}

	async function handleCreateProfile() {
		const name = newProfileName.trim();
		if (!name) return;
		creating = true;
		try {
			await api.profiles.create(name);
			uiStore.success(`Profile "${name}" created`);
			showCreateModal = false;
			newProfileName = '';
			await fetchProfiles(true);
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to create profile');
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>Profiles | Eero Dashboard</title>
</svelte:head>

<div class="profiles-page">
	<header class="page-header">
		<div class="header-left">
			<h1>Profiles</h1>
			<p class="text-muted">Manage device groups and parental controls</p>
		</div>
		<div class="header-right">
			<div class="view-toggle">
				<button
					class="toggle-btn"
					class:active={viewMode === 'blocks'}
					on:click={() => (viewMode = 'blocks')}
					title="Block view"
				>
					▦
				</button>
				<button
					class="toggle-btn"
					class:active={viewMode === 'list'}
					on:click={() => (viewMode = 'list')}
					title="List view"
				>
					☰
				</button>
			</div>
			<ExportMenu data={profiles} filename="profiles" disabled={loading} />
			<button class="btn btn-secondary" on:click={() => fetchProfiles(true)} disabled={loading}>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					↻
				{/if}
				Refresh
			</button>
			<button class="btn btn-primary" on:click={() => (showCreateModal = true)}>
				+ New profile
			</button>
		</div>
	</header>

	{#if loading && profiles.length === 0}
		<div class="loading-state">
			<span class="loading-spinner"></span>
			<span>Loading profiles...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<button class="btn btn-secondary" on:click={() => fetchProfiles(true)}> Try Again </button>
		</div>
	{:else if profiles.length === 0}
		<div class="empty-state card">
			<p>No profiles found.</p>
			<p class="text-sm text-muted">
				Profiles are created in the Eero app and can be used to group devices for parental controls.
			</p>
		</div>
	{:else if viewMode === 'blocks'}
		<!-- Block/Card View -->
		<div class="profiles-grid">
			{#each profiles as profile, index (getProfileKey(profile, index))}
				<a href="/profiles/{profile.id}" class="card profile-card" class:paused={profile.paused}>
					<div class="profile-header">
						<div class="profile-icon">👤</div>
						<div class="profile-info">
							<h3>{profile.name || 'Unknown Profile'}</h3>
							<span class="text-sm text-muted">{profile.device_count ?? 0} devices</span>
						</div>
						<StatusBadge status={profile.paused ? 'paused' : 'online'} showDot={false} />
					</div>

					{#if profile.paused}
						<div class="profile-status">
							<div class="pause-indicator">
								<span class="pause-icon">⏸</span>
								<span>Internet access is paused</span>
							</div>
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="card profiles-list">
			<table class="profiles-table">
				<thead>
					<tr>
						<th>Profile</th>
						<th>Devices</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each profiles as profile, index (getProfileKey(profile, index))}
						<tr
							class:paused={profile.paused}
							class="clickable"
							on:click={() => profile.id && window.location.assign(`/profiles/${profile.id}`)}
						>
							<td class="profile-name-cell">
								<span class="profile-icon-sm">👤</span>
								<span class="profile-name">{profile.name || 'Unknown Profile'}</span>
							</td>
							<td class="text-sm">{profile.device_count ?? 0}</td>
							<td>
								{#if profile.paused}
									<span class="badge badge-warning">⏸ Paused</span>
								{:else}
									<span class="badge badge-success">✓ Active</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if showCreateModal}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="modal-backdrop" on:click={() => (showCreateModal = false)}>
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="modal-card card" on:click|stopPropagation>
				<h2>New Profile</h2>
				<form on:submit|preventDefault={handleCreateProfile}>
					<label class="modal-label" for="new-profile-name">Profile name</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="new-profile-name"
						class="modal-input"
						type="text"
						bind:value={newProfileName}
						placeholder="e.g. Kids"
						disabled={creating}
						autofocus
					/>
					<div class="modal-actions">
						<button
							type="button"
							class="btn btn-secondary"
							on:click={() => (showCreateModal = false)}
							disabled={creating}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="btn btn-primary"
							disabled={creating || !newProfileName.trim()}
						>
							{#if creating}
								<span class="loading-spinner"></span>
							{/if}
							Create
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.profiles-page {
		max-width: 1000px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: var(--space-6);
	}

	.header-left h1 {
		margin-bottom: var(--space-1);
	}

	.loading-state,
	.empty-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.loading-state {
		flex-direction: row;
	}

	.profiles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-4);
	}

	.profile-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		text-decoration: none;
		color: inherit;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
		cursor: pointer;
	}

	.profile-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-color: var(--color-accent);
	}

	.profile-card.paused {
		opacity: 0.8;
		border-color: var(--color-warning);
	}

	.profile-card.paused:hover {
		border-color: var(--color-accent);
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.profile-icon {
		font-size: 2rem;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-bg-tertiary);
		border-radius: var(--radius-lg);
	}

	.profile-info {
		flex: 1;
	}

	.profile-info h3 {
		margin: 0;
		font-size: 1rem;
	}

	.profile-status {
		padding: var(--space-3);
		background-color: var(--color-bg-primary);
		border-radius: var(--radius-md);
	}

	.pause-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
		color: var(--color-warning);
	}

	.pause-icon {
		font-size: 1rem;
	}

	.btn-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	.btn-warning:hover:not(:disabled) {
		background-color: #e0a820;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.view-toggle {
		display: flex;
		gap: var(--space-1);
		background: var(--color-bg-tertiary);
		padding: var(--space-1);
		border-radius: var(--radius-md);
	}

	.toggle-btn {
		padding: var(--space-1) var(--space-2);
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 1rem;
		color: var(--color-text-secondary);
		transition: all 0.15s ease;
	}

	.toggle-btn:hover {
		color: var(--color-text-primary);
	}

	.toggle-btn.active {
		background: var(--color-bg-secondary);
		color: var(--color-accent);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	/* List View Styles */
	.profiles-list {
		overflow-x: auto;
	}

	.profiles-table {
		width: 100%;
		border-collapse: collapse;
	}

	.profiles-table th,
	.profiles-table td {
		text-align: left;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.profiles-table th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		font-weight: 600;
		background: var(--color-bg-primary);
	}

	.profiles-table tbody tr {
		transition: background-color 0.15s ease;
	}

	.profiles-table tbody tr.clickable {
		cursor: pointer;
	}

	.profiles-table tbody tr:hover {
		background: var(--color-bg-tertiary);
	}

	.profiles-table tbody tr.paused {
		opacity: 0.8;
	}

	.profile-name-cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.profile-icon-sm {
		font-size: 1.25rem;
	}

	.profile-name {
		font-weight: 500;
	}

	.badge-success {
		background-color: var(--color-success);
		color: white;
	}

	.badge-warning {
		background-color: var(--color-warning);
		color: var(--color-bg-primary);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal-card {
		width: 100%;
		max-width: 400px;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.modal-card h2 {
		margin: 0;
		font-size: 1.125rem;
	}

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
	}

	.modal-input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
