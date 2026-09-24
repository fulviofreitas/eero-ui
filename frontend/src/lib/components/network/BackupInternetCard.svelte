<!--
  BackupInternetCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 11):
  backup-internet (cellular failover) status, cellular usage/events (`GET
  /networks/{id}/backup-internet`) and configured backup Wi-Fi access points
  (`/backup-access-points`). Plus-gated - wrapped in `<PremiumGate>` by the
  caller, with the same internal `premiumRequired` fallback `DataUsageCard`
  uses in case entitlements are stale. `cellular_usage`/`cellular_events` are
  unfixtured upstream and rendered defensively via `GenericRecordList`.

  Write control (phase-6.0-revamp.md § 7 WP7, family 11): the enable/disable
  toggle on the Status section is an unverified, non-settings write (plan §
  5) - pessimistic, gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every
  write goes through a `ConfirmDialog` naming "not verified end-to-end".
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { BackupAccessPoint } from '$api/types';
	import { backupInternetStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let state = $derived($backupInternetStore);

	let usageRecords = $derived(state.status?.cellular_usage ? [state.status.cellular_usage] : []);
	let eventRecords = $derived(state.status?.cellular_events ?? []);

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
		}
	];

	function getApRowId(row: BackupAccessPoint): string {
		return row.id ?? row.uuid ?? String(state.accessPoints.indexOf(row));
	}

	function load() {
		backupInternetStore.fetch(networkId);
	}

	onMount(load);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function requestToggleEnabled() {
		const nextEnabled = !state.status?.enabled;
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
	{#if state.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Backup internet requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if state.loading && !state.status}
		<Skeleton variant="card" height="160px" />
	{:else if state.error}
		<ErrorState message={state.error} onRetry={load} />
	{:else}
		<section class="backup-section">
			<h4>Status</h4>
			<div class="badge-row-actions">
				<span class="badge {state.status?.enabled ? 'badge-success' : 'badge-neutral'}">
					{state.status?.enabled ? 'Enabled' : 'Disabled'}
				</span>
				<ExperimentalGate>
					<button
						class="btn btn-secondary btn-sm"
						onclick={requestToggleEnabled}
						disabled={state.applying}
					>
						{state.status?.enabled ? 'Disable' : 'Enable'}
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
			<h4>Backup Access Points</h4>
			<DataTable
				id="backup-access-points"
				columns={apColumns}
				rows={state.accessPoints}
				getRowId={getApRowId}
				emptyTitle="No backup access points configured"
				showColumnToggle={false}
			/>
		</section>
	{/if}
</Card>

<style>
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
