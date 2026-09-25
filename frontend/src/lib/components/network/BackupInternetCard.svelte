<!--
  BackupInternetCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 11):
  backup-internet (cellular failover) status, cellular usage/events (`GET
  /networks/{id}/backup-internet`) and configured backup Wi-Fi access points
  (`/backup-access-points`). Plus-gated - wrapped in `<PremiumGate>` by the
  caller, with the same internal `premiumRequired` fallback `DataUsageCard`
  uses in case entitlements are stale. `cellular_usage`/`cellular_events` are
  unfixtured upstream and rendered defensively - usage as InfoRows plus an
  itemised list (never `JSON.stringify`), events via the shared `EventsTable`.

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
	import NestedValue from '$components/common/NestedValue.svelte';
	import EventsTable from '$components/common/EventsTable.svelte';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import BackupAccessPointModal from './BackupAccessPointModal.svelte';
	import { formatBytes } from '$lib/utils/format-bytes';
	import { formatRelativeTime } from '$lib/utils/format-datetime';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let cardState = $derived($backupInternetStore);

	let showApModal = $state(false);
	let editingAp = $state<BackupAccessPoint | null>(null);
	let apPrefill = $state<DiscoveredBackupSsid | null>(null);

	let eventRecords = $derived(cardState.status?.cellular_events ?? []);

	/** Any array-valued key inside `cellular_usage` - the upstream shape isn't fixtured, so the
	 * "usage items" array is located structurally rather than by a specific known key name. */
	function usageItems(
		usage: Record<string, unknown> | null | undefined
	): Record<string, unknown>[] {
		if (!usage) return [];
		for (const value of Object.values(usage)) {
			if (Array.isArray(value)) return value as Record<string, unknown>[];
		}
		return [];
	}

	/** Scalar (non-array) entries of `cellular_usage`, rendered as InfoRows. */
	function usageScalarEntries(
		usage: Record<string, unknown> | null | undefined
	): [string, unknown][] {
		if (!usage) return [];
		return Object.entries(usage).filter(([, value]) => !Array.isArray(value));
	}

	function humanizeKey(key: string): string {
		return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/** Bytes-shaped keys (anything matching /bytes/i) are humanised via formatBytes; everything
	 * else falls back to NestedValue's primitive rendering rules. */
	function isByteKey(key: string): boolean {
		return /bytes/i.test(key);
	}

	function formatUsageValue(key: string, value: unknown): string | null {
		if (isByteKey(key) && typeof value === 'number') return formatBytes(value);
		return null;
	}

	let cellularUsage = $derived(cardState.status?.cellular_usage ?? null);
	let cellularUsageItems = $derived(usageItems(cellularUsage));
	let cellularUsageScalars = $derived(usageScalarEntries(cellularUsage));

	/** Extracts a status label and a "last checked" timestamp from a connectivity payload of
	 * unknown shape, defensively - never JSON.stringify (maintainer screenshot showed a raw
	 * envelope dumped into the Connectivity column). */
	function connectivityInfo(value: unknown): { status: string | null; checkedAt: string | null } {
		if (
			value === null ||
			value === undefined ||
			typeof value !== 'object' ||
			Array.isArray(value)
		) {
			return { status: null, checkedAt: null };
		}
		const obj = value as Record<string, unknown>;
		let status: string | null = null;
		for (const key of ['connected', 'status', 'state', 'reachable']) {
			if (key in obj) {
				const v = obj[key];
				if (typeof v === 'boolean') status = v ? 'Online' : 'Offline';
				else if (typeof v === 'string' && v) status = v;
				if (status) break;
			}
		}
		let checkedAt: string | null = null;
		for (const key of ['last_checked', 'checked_at', 'timestamp']) {
			const v = obj[key];
			if (typeof v === 'string' && v) {
				checkedAt = v;
				break;
			}
		}
		return { status, checkedAt };
	}

	const apColumns: DataTableColumn<BackupAccessPoint>[] = [
		{ key: 'ssid', header: 'SSID', required: true, width: '160px', render: ssidCell },
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
			render: connectivityCell
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
			{#if !cellularUsage}
				<EmptyState title="No cellular usage data" />
			{:else}
				{#each cellularUsageScalars as [key, value] (key)}
					<InfoRow label={humanizeKey(key)} value={formatUsageValue(key, value) ?? value} />
				{/each}
				{#if cellularUsageItems.length === 0}
					<p class="text-muted text-sm">No usage in the current cycle.</p>
				{:else}
					<ul class="usage-items">
						{#each cellularUsageItems as item, i (i)}
							<li class="usage-item">
								{#each Object.entries(item) as [key, value] (key)}
									<InfoRow label={humanizeKey(key)} value={formatUsageValue(key, value) ?? value} />
								{/each}
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<section class="backup-section">
			<h4>Cellular Events</h4>
			<EventsTable
				id="backup-internet-cellular-events"
				events={eventRecords}
				emptyTitle="No cellular events"
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
				{@const checkInfo = connectivityInfo(
					cardState.checkResult.connectivity ?? cardState.checkResult.status
				)}
				<p class="text-muted text-sm last-check">
					Last check: {cardState.checkResult.ssid ?? '—'} —
					{#if checkInfo.status}
						<StatusBadge status={checkInfo.status} size="sm" />
					{:else}
						<NestedValue
							value={cardState.checkResult.connectivity ?? cardState.checkResult.status}
						/>
					{/if}
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

{#snippet ssidCell(row: BackupAccessPoint)}
	<span class="ssid-cell">
		<span class="ssid-name">{row.ssid ?? '—'}</span>
		{#if row.priority !== null && row.priority !== undefined}
			<span class="badge badge-neutral badge-sm priority-badge" title="Priority">
				#{row.priority}
			</span>
		{/if}
	</span>
{/snippet}

{#snippet connectivityCell(row: BackupAccessPoint)}
	{@const info = connectivityInfo(row.connectivity)}
	{#if info.status}
		<span class="connectivity-cell">
			<StatusBadge status={info.status} size="sm" />
			{#if info.checkedAt}
				{@const relative = formatRelativeTime(info.checkedAt)}
				{#if relative}
					<span class="text-muted text-xs checked-at">checked {relative}</span>
				{/if}
			{/if}
		</span>
	{:else}
		<NestedValue value={row.connectivity} />
	{/if}
{/snippet}

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

	.usage-items {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.usage-item {
		padding: var(--space-3);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
	}

	.ssid-cell {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.ssid-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.priority-badge {
		flex-shrink: 0;
	}

	.connectivity-cell {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}

	.checked-at {
		white-space: nowrap;
	}

	.last-check {
		display: flex;
		align-items: center;
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
