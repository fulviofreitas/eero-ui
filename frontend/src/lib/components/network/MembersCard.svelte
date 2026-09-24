<!--
  MembersCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 10):
  the current user's role/permissions on the network, its members and its
  pending invites (`GET /networks/{id}/{permissions,members,invites}`). Every
  read fails soft server-side to `partial: true` on a 403 rather than
  throwing, rendered here as one muted note rather than three.

  Read-only - WP7 adds the write controls (invite, change role, revoke). The
  `actions` snippet prop is the seam it attaches to, rendered next to the
  card title exactly like every other card's `actions` slot.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { NetworkInvite, NetworkMember } from '$api/types';
	import { membersStore } from '$stores/members';
	import Card from '$components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';

	interface Props {
		networkId: string;
		actions?: Snippet;
	}

	let { networkId, actions }: Props = $props();

	let state = $derived($membersStore);

	let enabledPermissions = $derived(
		Object.entries(state.permissions)
			.filter(([, enabled]) => enabled)
			.map(([key]) => key)
	);

	let partial = $derived(state.permissionsPartial || state.membersPartial || state.invitesPartial);

	const memberColumns: DataTableColumn<NetworkMember>[] = [
		{ key: 'name', header: 'Name', required: true, accessor: (row) => row.name ?? '—' },
		{ key: 'role', header: 'Role', accessor: (row) => row.role ?? '—' },
		{ key: 'status', header: 'Status', accessor: (row) => row.status ?? '—' }
	];

	const inviteColumns: DataTableColumn<NetworkInvite>[] = [
		{ key: 'role', header: 'Role', required: true, accessor: (row) => row.role ?? '—' },
		{ key: 'status', header: 'Status', accessor: (row) => row.status ?? '—' },
		{ key: 'created', header: 'Created', accessor: (row) => row.created ?? '—' },
		{ key: 'expires', header: 'Expires', accessor: (row) => row.expires ?? '—' }
	];

	function getMemberRowId(row: NetworkMember): string {
		return `${row.name ?? ''}:${row.role ?? ''}:${state.members.indexOf(row)}`;
	}

	function getInviteRowId(row: NetworkInvite): string {
		return row.id ?? String(state.invites.indexOf(row));
	}

	function load() {
		membersStore.fetch(networkId);
	}

	onMount(load);
</script>

<Card title="Members & Permissions" {actions}>
	{#if state.loading && !state.role && state.members.length === 0}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if state.error}
		<ErrorState message={state.error} onRetry={load} />
	{:else}
		{#if partial}
			<p class="partial-note text-muted text-sm" role="note">
				Some data unavailable for this account.
			</p>
		{/if}

		<section class="member-section">
			<h4>Your Role</h4>
			<span class="badge badge-neutral">{state.role ?? 'Unknown'}</span>
		</section>

		<section class="member-section">
			<h4>Permissions</h4>
			{#if enabledPermissions.length === 0}
				<p class="text-muted text-sm">No permissions granted.</p>
			{:else}
				<ul class="permission-list">
					{#each enabledPermissions as key (key)}
						<li class="badge badge-success">{key}</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="member-section">
			<h4>Members</h4>
			<DataTable
				id="network-members"
				columns={memberColumns}
				rows={state.members}
				getRowId={getMemberRowId}
				emptyTitle="No members"
				showColumnToggle={false}
			/>
		</section>

		<section class="member-section">
			<h4>Pending Invites</h4>
			<DataTable
				id="network-invites"
				columns={inviteColumns}
				rows={state.invites}
				getRowId={getInviteRowId}
				emptyTitle="No pending invites"
				showColumnToggle={false}
			/>
		</section>
	{/if}
</Card>

<style>
	.partial-note {
		margin: 0 0 var(--space-4);
	}

	.member-section {
		margin-bottom: var(--space-6);
	}

	.member-section:last-child {
		margin-bottom: 0;
	}

	.member-section h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.permission-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
