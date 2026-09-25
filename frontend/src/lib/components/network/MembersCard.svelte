<!--
  MembersCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 10):
  the current user's role/permissions on the network, its members and its
  pending invites (`GET /networks/{id}/{permissions,members,invites}`). Every
  read fails soft server-side to `partial: true` on a 403 rather than
  throwing, rendered here as one muted note rather than three.

  Write controls (phase-6.0-revamp.md § 7 WP7, family 2): create/rename/cancel
  invites and cancel every pending admin-promotion invite. All unverified,
  non-settings writes (plan § 5) - wrapped in `ExperimentalGate`, every write
  goes through a `ConfirmDialog` stating it is not verified end-to-end.
  `promoteMember`/`removeAdmin` are NOT wired here: `NetworkMember` carries no
  id (allowlisted server-side to name/role/status only), so there is no
  non-secret handle to promote/demote a specific member by - a contract gap,
  not an oversight. The `actions` snippet prop is a seam for a caller-supplied
  header action, rendered next to the card title like every other card.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { NetworkInvite, NetworkMember } from '$api/types';
	import { membersStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
		actions?: Snippet;
	}

	let { networkId, actions }: Props = $props();

	let cardState = $derived($membersStore);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	let inviteRole = $state<'owner' | 'admin'>('admin');
	let renamingInviteId = $state<string | null>(null);
	let renameValue = $state('');

	let enabledPermissions = $derived(
		Object.entries(cardState.permissions)
			.filter(([, enabled]) => enabled)
			.map(([key]) => key)
	);

	let partial = $derived(
		cardState.permissionsPartial || cardState.membersPartial || cardState.invitesPartial
	);

	const memberColumns: DataTableColumn<NetworkMember>[] = [
		{ key: 'name', header: 'Name', required: true, accessor: (row) => row.name ?? '—' },
		{ key: 'role', header: 'Role', accessor: (row) => row.role ?? '—' },
		{ key: 'status', header: 'Status', accessor: (row) => row.status ?? '—' }
	];

	function getMemberRowId(row: NetworkMember): string {
		return `${row.name ?? ''}:${row.role ?? ''}:${cardState.members.indexOf(row)}`;
	}

	function getInviteRowId(row: NetworkInvite): string {
		return row.id ?? String(cardState.invites.indexOf(row));
	}

	function load() {
		membersStore.fetch(networkId);
	}

	onMount(load);

	function handleInviteFormSubmit(event: SubmitEvent) {
		event.preventDefault();
		requestCreateInvite();
	}

	function requestCreateInvite() {
		const role = inviteRole;
		uiStore.confirm({
			title: 'Create Invite',
			message: `Create an invite for the "${role}" role?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Create',
			onConfirm: async () => {
				try {
					await membersStore.createInvite(networkId, role);
					uiStore.success('Invite created');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to create invite');
				}
			}
		});
	}

	function startRenameInvite(invite: NetworkInvite) {
		if (!invite.id) return;
		renamingInviteId = invite.id;
		renameValue = '';
	}

	function cancelRenameInvite() {
		renamingInviteId = null;
		renameValue = '';
	}

	function requestRenameInvite(invite: NetworkInvite) {
		if (!invite.id) return;
		const inviteId = invite.id;
		const nickname = renameValue.trim();
		if (!nickname) return;
		uiStore.confirm({
			title: 'Rename Invite',
			message: `Rename this invite to "${nickname}"?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Rename',
			onConfirm: async () => {
				try {
					await membersStore.updateInvite(networkId, inviteId, nickname);
					uiStore.success('Invite renamed');
					cancelRenameInvite();
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to rename invite');
				}
			}
		});
	}

	function requestDeleteInvite(invite: NetworkInvite) {
		if (!invite.id) return;
		const inviteId = invite.id;
		uiStore.confirm({
			title: 'Cancel Invite',
			message: 'Cancel this pending invite?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Cancel Invite',
			danger: true,
			onConfirm: async () => {
				try {
					await membersStore.deleteInvite(networkId, inviteId);
					uiStore.success('Invite cancelled');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to cancel invite');
				}
			}
		});
	}

	function requestCancelPendingAdmin() {
		uiStore.confirm({
			title: 'Cancel Pending Admin Invites',
			message: 'Cancel every pending admin-promotion invite for this network?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Cancel All',
			danger: true,
			onConfirm: async () => {
				try {
					await membersStore.cancelPendingAdmin(networkId);
					uiStore.success('Pending admin invites cancelled');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to cancel pending admins');
				}
			}
		});
	}
</script>

<Card title="Members & Permissions" {actions}>
	{#if cardState.loading && !cardState.role && cardState.members.length === 0}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		{#if partial}
			<p class="partial-note text-muted text-sm" role="note">
				Some data unavailable for this account.
			</p>
		{/if}

		<section class="member-section">
			<h4>Your Role</h4>
			<span class="badge badge-neutral">{cardState.role ?? 'Unknown'}</span>
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
				rows={cardState.members}
				getRowId={getMemberRowId}
				emptyTitle="No members"
				showColumnToggle={false}
			/>
		</section>

		<section class="member-section">
			<div class="badge-row">
				<h4>Pending Invites</h4>
				<ExperimentalGate>
					<button
						class="btn btn-secondary btn-sm"
						onclick={requestCancelPendingAdmin}
						disabled={cardState.applying}
					>
						Cancel Pending Admin Invites
					</button>
				</ExperimentalGate>
			</div>

			<ExperimentalGate>
				<form class="invite-form" onsubmit={handleInviteFormSubmit}>
					<label class="invite-form-label" for="invite-role">Role</label>
					<select id="invite-role" bind:value={inviteRole} disabled={cardState.applying}>
						<option value="admin">Admin</option>
						<option value="owner">Owner</option>
					</select>
					<button type="submit" class="btn btn-primary btn-sm" disabled={cardState.applying}>
						Send Invite
					</button>
				</form>
			</ExperimentalGate>

			<DataTable
				id="network-invites"
				columns={[
					{ key: 'role', header: 'Role', required: true, accessor: (row) => row.role ?? '—' },
					{ key: 'status', header: 'Status', accessor: (row) => row.status ?? '—' },
					{ key: 'created', header: 'Created', accessor: (row) => row.created ?? '—' },
					{ key: 'expires', header: 'Expires', accessor: (row) => row.expires ?? '—' },
					{ key: 'actions', header: 'Actions', align: 'right', render: inviteActionsCell }
				] as DataTableColumn<NetworkInvite>[]}
				rows={cardState.invites}
				getRowId={getInviteRowId}
				emptyTitle="No pending invites"
				showColumnToggle={false}
			/>
		</section>
	{/if}
</Card>

{#snippet inviteActionsCell(row: NetworkInvite)}
	<ExperimentalGate>
		{#if renamingInviteId === row.id}
			<div class="row-actions">
				<input
					class="rename-input"
					type="text"
					bind:value={renameValue}
					placeholder="New nickname"
				/>
				<button
					class="btn btn-primary btn-sm"
					onclick={() => requestRenameInvite(row)}
					disabled={cardState.applying || !renameValue.trim()}
				>
					Save
				</button>
				<button class="btn btn-secondary btn-sm" onclick={cancelRenameInvite}> Cancel </button>
			</div>
		{:else}
			<div class="row-actions">
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => startRenameInvite(row)}
					disabled={cardState.applying}
				>
					Rename
				</button>
				<button
					class="btn btn-danger btn-sm"
					onclick={() => requestDeleteInvite(row)}
					disabled={cardState.applying}
				>
					Cancel
				</button>
			</div>
		{/if}
	</ExperimentalGate>
{/snippet}

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

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-2);
	}

	.invite-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.invite-form-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.rename-input {
		padding: var(--space-1) var(--space-2);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
	}
</style>
