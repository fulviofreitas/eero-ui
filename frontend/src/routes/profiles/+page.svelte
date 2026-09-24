<!--
  Profiles Page
  
  Manage user profiles and parental controls.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { ProfileSummary } from '$api/types';
	import { uiStore, selectedNetworkId } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import ExportMenu from '$components/common/ExportMenu.svelte';
	import Icon from '$components/common/Icon.svelte';
	import DataTable, {
		type DataTableColumn,
		type SortDirection
	} from '$components/common/DataTable.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';

	let profiles: ProfileSummary[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let viewMode: 'blocks' | 'list' = $state('blocks');
	let lastNetworkId: string | null = $state(null);
	let showCreateModal = $state(false);
	let newProfileName = $state('');
	let creating = $state(false);

	// Default sort is name ascending (house rule - see lessons-learned.md); DataTable is driven
	// in controlled mode so the header reflects that default instead of only the data.
	let sortBy: string | null = $state('name');
	let sortDirection: SortDirection = $state('ascending');

	function handleSort(key: string | null, direction: SortDirection) {
		sortBy = key;
		sortDirection = direction;
	}

	function goToProfile(profile: ProfileSummary) {
		if (profile.id) goto(`/profiles/${profile.id}`);
	}

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await fetchProfiles();
	});

	async function fetchProfiles(refresh = false) {
		loading = true;
		error = null;
		try {
			const result = await api.profiles.list(refresh);
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
	// React to network changes
	$effect(() => {
		if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
			lastNetworkId = $selectedNetworkId;
			fetchProfiles(true);
		}
	});
</script>

{#snippet profileCell(profile: ProfileSummary)}
	<div class="profile-name-cell">
		<span class="profile-icon-sm"><Icon name="person" size={14} /></span>
		<span class="profile-name">{profile.name || 'Unknown Profile'}</span>
	</div>
{/snippet}

{#snippet devicesCell(profile: ProfileSummary)}
	<span class="text-sm">{profile.device_count ?? 0}</span>
{/snippet}

{#snippet statusCell(profile: ProfileSummary)}
	{#if profile.paused}
		<span class="badge badge-warning">⏸ Paused</span>
	{:else}
		<span class="badge badge-success"><Icon name="check" size={12} /> Active</span>
	{/if}
{/snippet}

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
					onclick={() => (viewMode = 'blocks')}
					title="Block view"
				>
					▦
				</button>
				<button
					class="toggle-btn"
					class:active={viewMode === 'list'}
					onclick={() => (viewMode = 'list')}
					title="List view"
				>
					<Icon name="menu" size={14} />
				</button>
			</div>
			<ExportMenu data={profiles} filename="profiles" disabled={loading} />
			<button class="btn btn-secondary" onclick={() => fetchProfiles(true)} disabled={loading}>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					<Icon name="refresh" size={14} />
				{/if}
				Refresh
			</button>
			<button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
				+ New profile
			</button>
		</div>
	</header>

	{#if loading && profiles.length === 0}
		<Skeleton variant="table-rows" rows={4} columns={3} />
	{:else if error}
		<ErrorState message={error} onRetry={() => fetchProfiles(true)} />
	{:else if profiles.length === 0}
		<EmptyState
			icon="person"
			title="No profiles found."
			description="Profiles are created in the Eero app and can be used to group devices for parental controls."
		/>
	{:else if viewMode === 'blocks'}
		<!-- Block/Card View -->
		<div class="profiles-grid">
			{#each profiles as profile, index (getProfileKey(profile, index))}
				<a href="/profiles/{profile.id}" class="card profile-card" class:paused={profile.paused}>
					<div class="profile-header">
						<div class="profile-icon"><Icon name="person" size={20} /></div>
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
			<DataTable
				id="profiles"
				columns={[
					{
						key: 'name',
						header: 'Profile',
						required: true,
						sortable: true,
						accessor: (p) => (p.name || '').toLowerCase(),
						render: profileCell
					},
					{
						key: 'devices',
						header: 'Devices',
						sortable: true,
						accessor: (p) => p.device_count ?? 0,
						render: devicesCell
					},
					{
						key: 'status',
						header: 'Status',
						sortable: true,
						accessor: (p) => (p.paused ? 'paused' : 'active'),
						render: statusCell
					}
				] as DataTableColumn<ProfileSummary>[]}
				rows={profiles}
				getRowId={(p) => p.id || p.name || ''}
				emptyTitle="No profiles found."
				{sortBy}
				{sortDirection}
				onSort={handleSort}
				onRowClick={goToProfile}
				rowClass={(p) => (p.paused ? 'profile-row paused' : 'profile-row')}
			/>
		</div>
	{/if}

	{#if showCreateModal}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={() => (showCreateModal = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="modal-card card" onclick={(e) => e.stopPropagation()}>
				<h2>New Profile</h2>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreateProfile();
					}}
				>
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
							onclick={() => (showCreateModal = false)}
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

	/* `<tr class="profile-row paused">` is DataTable's own element (rowClass hook), so it needs
	   :global() — the cell content below is rendered via `render` snippets declared in this
	   file and is scoped normally. */
	:global(.profile-row.paused) {
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
		z-index: var(--z-modal);
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
