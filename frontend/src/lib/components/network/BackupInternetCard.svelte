<!--
  BackupInternetCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 11):
  backup-internet (cellular failover) status, cellular usage/events (`GET
  /networks/{id}/backup-internet`) and configured backup Wi-Fi access points
  (`/backup-access-points`). Plus-gated - wrapped in `<PremiumGate>` by the
  caller, with the same internal `premiumRequired` fallback `DataUsageCard`
  uses in case entitlements are stale. `cellular_usage`/`cellular_events` are
  unfixtured upstream and rendered defensively via `GenericRecordList`.

  Write controls (phase-6.0-revamp.md § 7 WP7, family 11 and family 5): the
  enable/disable toggle on the Status section, and add/edit/delete/reorder/
  discover/check on the Backup Access Points section, are all unverified,
  non-settings writes (plan § 5) - pessimistic, gated on
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every write goes through a
  `ConfirmDialog` naming "not verified end-to-end".
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { BackupAccessPoint, DiscoveredBackupSsid } from '$api/types';
	import { backupInternetStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import BackupAccessPointModal from './BackupAccessPointModal.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let cardState = $derived($backupInternetStore);

	let showApModal = $state(false);
	let editingAp = $state<BackupAccessPoint | null>(null);
	let apPrefill = $state<DiscoveredBackupSsid | null>(null);

	let usageRecords = $derived(
		cardState.status?.cellular_usage ? [cardState.status.cellular_usage] : []
	);
	let eventRecords = $derived(cardState.status?.cellular_events ?? []);

	function summarizeConnectivity(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	const apColumns: DataTableColumn<BackupAccessPoint>[] = [
		{ key: 'ssid', header: 'SSID', required: true, accessor: (row) => row.ssid ?? '—' },
		{
			key: 'priority',
			header: 'Priority',
			align: 'right',
			accessor: (row) => row.priority ?? null
		},
		{
			key: 'enabled',
			header: 'Enabled',
			align: 'center',
			accessor: (row) => (row.enabled ? 'Yes' : 'No')
		},
		{ key: 'status', header: 'Status', accessor: (row) => row.status ?? '—' },
		{
			key: 'connectivity',
			header: 'Connectivity',
			accessor: (row) => summarizeConnectivity(row.connectivity)
		},
		{ key: 'actions', header: 'Actions', align: 'right', render: apActionsCell }
	];

	function getApRowId(row: BackupAccessPoint): string {
		return row.id ?? row.uuid ?? String(cardState.accessPoints.indexOf(row));
	}

	function load() {
		backupInternetStore.fetch(networkId);
	}

	onMount(load);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function openAddApModal(prefill: DiscoveredBackupSsid | null = null) {
		editingAp = null;
		apPrefill = prefill;
		showApModal = true;
	}

	function openEditApModal(ap: BackupAccessPoint) {
		editingAp = ap;
		apPrefill = null;
		showApModal = true;
	}

	function closeApModal() {
		showApModal = false;
		editingAp = null;
		apPrefill = null;
	}

	async function handleApSubmit(values: {
		ssid: string;
		password: string;
		uuid: string;
		enabled: boolean;
	}) {
		try {
			if (editingAp?.id) {
				await backupInternetStore.updateAccessPoint(networkId, editingAp.id, {
					ssid: values.ssid,
					...(values.password && { password: values.password }),
					enabled: values.enabled
				});
				uiStore.success(`Access point "${values.ssid}" updated`);
			} else {
				await backupInternetStore.addAccessPoint(networkId, {
					ssid: values.ssid,
					password: values.password,
					...(values.uuid && { uuid: values.uuid })
				});
				uiStore.success(`Access point "${values.ssid}" added`);
			}
			closeApModal();
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to save access point');
		}
	}

	function requestDeleteAp(ap: BackupAccessPoint) {
		if (!ap.id) return;
		const apId = ap.id;
		const label = ap.ssid ?? apId;
		uiStore.confirm({
			title: 'Delete Access Point',
			message: `Delete "${label}"?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await backupInternetStore.deleteAccessPoint(networkId, apId);
					uiStore.success(`Access point "${label}" deleted`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete access point');
				}
			}
		});
	}

	function moveAp(ap: BackupAccessPoint, direction: -1 | 1) {
		const ids = cardState.accessPoints.map((a) => a.id).filter((id): id is string => !!id);
		const index = ap.id ? ids.indexOf(ap.id) : -1;
		const target = index + direction;
		if (index < 0 || target < 0 || target >= ids.length) return;
		const reordered = [...ids];
		[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
		uiStore.confirm({
			title: 'Reorder Access Points',
			message: 'Change the priority order of backup access points?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Reorder',
			onConfirm: async () => {
				try {
					await backupInternetStore.reorderAccessPoints(networkId, reordered);
					uiStore.success('Access points reordered');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to reorder access points');
				}
			}
		});
	}

	function requestDiscover() {
		uiStore.confirm({
			title: 'Discover Access Points',
			message: 'Scan for nearby backup Wi-Fi access points?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Discover',
			onConfirm: async () => {
				try {
					await backupInternetStore.discover(networkId);
					uiStore.success('Discovery complete');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to discover access points');
				}
			}
		});
	}

	function requestCheck() {
		uiStore.confirm({
			title: 'Check Connectivity',
			message: 'Run a backup-connectivity check?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Check',
			onConfirm: async () => {
				try {
					await backupInternetStore.check(networkId);
					uiStore.success('Connectivity check complete');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to run connectivity check');
				}
			}
		});
	}

	function requestToggleEnabled() {
		const nextEnabled = !cardState.status?.enabled;
		uiStore.confirm({
			title: 'Update Backup Internet',
			message: `${nextEnabled ? 'Enable' : 'Disable'} backup internet (cellular failover)?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: nextEnabled ? 'Enable' : 'Disable',
			onConfirm: async () => {
				try {
					const changed = await backupInternetStore.updateEnabled(networkId, nextEnabled);
					if (!changed) {
						uiStore.info('No changes to apply.');
						return;
					}
					uiStore.success('Backup internet setting updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update backup internet');
				}
			}
		});
	}
</script>

<Card title="Backup Internet">
	{#if cardState.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Backup internet requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if cardState.loading && !cardState.status}
		<Skeleton variant="card" height="160px" />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<section class="backup-section">
			<h4>Status</h4>
			<div class="badge-row-actions">
				<span class="badge {cardState.status?.enabled ? 'badge-success' : 'badge-neutral'}">
					{cardState.status?.enabled ? 'Enabled' : 'Disabled'}
				</span>
				<ExperimentalGate>
					<button
						class="btn btn-secondary btn-sm"
						onclick={requestToggleEnabled}
						disabled={cardState.applying}
					>
						{cardState.status?.enabled ? 'Disable' : 'Enable'}
					</button>
				</ExperimentalGate>
			</div>
		</section>

		<section class="backup-section">
			<h4>Cellular Usage</h4>
			<GenericRecordList
				records={usageRecords}
				emptyTitle="No cellular usage data"
				recordLabel={() => 'Current cycle'}
			/>
		</section>

		<section class="backup-section">
			<h4>Cellular Events</h4>
			<GenericRecordList
				records={eventRecords}
				emptyTitle="No cellular events"
				recordLabel={(_r, i) => `Event ${i + 1}`}
			/>
		</section>

		<section class="backup-section">
			<div class="badge-row">
				<h4>Backup Access Points</h4>
				<ExperimentalGate>
					<div class="ap-header-actions">
						<button
							class="btn btn-secondary btn-sm"
							onclick={requestDiscover}
							disabled={cardState.applying}
						>
							Discover
						</button>
						<button
							class="btn btn-secondary btn-sm"
							onclick={requestCheck}
							disabled={cardState.applying}
						>
							Check Connectivity
						</button>
						<button
							class="btn btn-primary btn-sm"
							onclick={() => openAddApModal()}
							disabled={cardState.applying}
						>
							Add Access Point
						</button>
					</div>
				</ExperimentalGate>
			</div>

			{#if cardState.checkResult}
				<p class="text-muted text-sm">
					Last check: {cardState.checkResult.ssid ?? '—'} — {summarizeConnectivity(
						cardState.checkResult.connectivity ?? cardState.checkResult.status
					)}
				</p>
			{/if}

			{#if cardState.discovered && cardState.discovered.length > 0}
				<ExperimentalGate>
					<ul class="discovered-list">
						{#each cardState.discovered as ssid, i (ssid.uuid ?? ssid.ssid ?? i)}
							<li>
								<span>{ssid.ssid ?? 'Unknown SSID'}</span>
								<button
									class="btn btn-secondary btn-sm"
									onclick={() => openAddApModal(ssid)}
									disabled={cardState.applying}
								>
									Use this SSID
								</button>
							</li>
						{/each}
					</ul>
				</ExperimentalGate>
			{/if}

			<DataTable
				id="backup-access-points"
				columns={apColumns}
				rows={cardState.accessPoints}
				getRowId={getApRowId}
				emptyTitle="No backup access points configured"
				showColumnToggle={false}
			/>
		</section>
	{/if}
</Card>

<BackupAccessPointModal
	open={showApModal}
	ap={editingAp}
	prefill={apPrefill}
	submitting={cardState.applying}
	onClose={closeApModal}
	onSubmit={handleApSubmit}
/>

{#snippet apActionsCell(row: BackupAccessPoint)}
	<ExperimentalGate>
		<div class="row-actions">
			<button
				class="btn btn-secondary btn-sm"
				onclick={() => moveAp(row, -1)}
				disabled={cardState.applying}
			>
				Up
			</button>
			<button
				class="btn btn-secondary btn-sm"
				onclick={() => moveAp(row, 1)}
				disabled={cardState.applying}
			>
				Down
			</button>
			<button
				class="btn btn-secondary btn-sm"
				onclick={() => openEditApModal(row)}
				disabled={cardState.applying}
			>
				Edit
			</button>
			<button
				class="btn btn-danger btn-sm"
				onclick={() => requestDeleteAp(row)}
				disabled={cardState.applying}
			>
				Delete
			</button>
		</div>
	</ExperimentalGate>
{/snippet}

<style>
	.ap-header-actions {
		display: flex;
		gap: var(--space-2);
	}

	.discovered-list {
		list-style: none;
		margin: 0 0 var(--space-4);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.discovered-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-secondary);
		border-radius: var(--radius-md);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.backup-section {
		margin-bottom: var(--space-6);
	}

	.backup-section:last-child {
		margin-bottom: 0;
	}

	.backup-section h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.badge-row-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-2);
	}

	.premium-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}

	.premium-note-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.premium-note-title {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}

	.premium-note-description {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
