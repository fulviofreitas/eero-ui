<!--
  SecurityWanCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 12):
  combined security settings (`GET /networks/{id}/security`), subnets
  (`/subnets`), multi-static-IP WAN config (`/multistaticip`) and DHCP/
  connection-mode/power-saving/DDNS (`/advanced`). Read-only, grouped into
  sections rather than tabs so every field is visible without extra clicks.

  Each section carries a stable `data-family` attribute and a named
  `*Controls` snippet prop - the seam WP8's settings-class write controls
  attach to, one family at a time, without touching this component's layout.

  The WAN section additionally owns its own DDNS toggle (phase-6.0-revamp.md
  § 7 WP7, family 4), and the Power & Thread section owns its own Thread
  enable/disable and regenerate-credentials controls (phase-6.0-revamp.md § 7
  WP7, family 7) - both unverified, non-settings writes (plan § 5), built
  directly into this card rather than routed through the `wanControls`/
  `powerThreadControls` seams (those seams are reserved for WP8's
  settings-class controls). Pessimistic, gated on
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, every write goes through a
  `ConfirmDialog` naming "not verified end-to-end". Regenerating Thread
  credentials additionally names the re-commissioning consequence.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { DataTableColumn } from '$components/common/DataTable.svelte';
	import { securityWanStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import DataTable from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
		/** WP8 write-control seams, one per section - never rendered here directly. */
		wifiSecurityControls?: Snippet;
		networkControls?: Snippet;
		powerThreadControls?: Snippet;
		updatesControls?: Snippet;
		subnetsControls?: Snippet;
		wanControls?: Snippet;
	}

	let {
		networkId,
		wifiSecurityControls,
		networkControls,
		powerThreadControls,
		updatesControls,
		subnetsControls,
		wanControls
	}: Props = $props();

	let cardState = $derived($securityWanStore);

	function boolLabel(value: boolean | null | undefined): string {
		if (value === null || value === undefined) return '—';
		return value ? 'Enabled' : 'Disabled';
	}

	function boolBadgeClass(value: boolean | null | undefined): string {
		if (value === null || value === undefined) return 'badge-neutral';
		return value ? 'badge-success' : 'badge-neutral';
	}

	function summarize(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	type SubnetRow = { fields: Record<string, unknown>; index: number };

	const subnetRows = $derived.by((): SubnetRow[] =>
		(cardState.subnets?.subnets ?? []).map((fields, index) => ({ fields, index }))
	);

	const subnetColumns = $derived.by((): DataTableColumn<SubnetRow>[] => {
		const keys = new SvelteSet<string>();
		for (const row of subnetRows) for (const key of Object.keys(row.fields)) keys.add(key);
		const columns = Array.from(keys).map((key, i) => ({
			key,
			header: key,
			required: i === 0,
			accessor: (row: SubnetRow) => summarize(row.fields[key])
		}));
		return columns.length > 0 ? columns : [{ key: 'empty', header: 'Subnet', accessor: () => '—' }];
	});

	function getSubnetRowId(row: SubnetRow): string {
		return String(row.fields.id ?? row.fields.name ?? row.index);
	}

	function load() {
		securityWanStore.fetch(networkId);
	}

	onMount(load);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	let ddnsEnabled = $derived(
		Boolean(cardState.advanced?.ddns && (cardState.advanced.ddns as { enabled?: unknown }).enabled)
	);

	let threadEnabled = $derived(Boolean(cardState.security?.thread?.enabled));

	function requestToggleThread() {
		const nextEnabled = !threadEnabled;
		uiStore.confirm({
			title: 'Update Thread',
			message: `${nextEnabled ? 'Enable' : 'Disable'} Thread for this network?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: nextEnabled ? 'Enable' : 'Disable',
			onConfirm: async () => {
				try {
					const changed = await securityWanStore.updateThread(networkId, nextEnabled);
					if (!changed) {
						uiStore.info('No changes to apply.');
						return;
					}
					uiStore.success('Thread setting updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update Thread');
				}
			}
		});
	}

	function requestRegenerateThreadCredentials() {
		uiStore.confirm({
			title: 'Regenerate Thread Credentials',
			message: 'Regenerate this network’s Thread credentials?',
			details: [
				NOT_VERIFIED_DETAIL,
				'Thread and Matter devices must be re-commissioned after this change.'
			],
			confirmText: 'Regenerate',
			danger: true,
			onConfirm: async () => {
				try {
					await securityWanStore.regenerateThreadCredentials(networkId);
					uiStore.success('Thread credentials regenerated');
				} catch (err) {
					uiStore.error(
						err instanceof Error ? err.message : 'Failed to regenerate Thread credentials'
					);
				}
			}
		});
	}

	function requestToggleDdns() {
		const nextEnabled = !ddnsEnabled;
		uiStore.confirm({
			title: 'Update Dynamic DNS',
			message: `${nextEnabled ? 'Enable' : 'Disable'} dynamic DNS for this network?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: nextEnabled ? 'Enable' : 'Disable',
			onConfirm: async () => {
				try {
					const changed = await securityWanStore.updateDdns(networkId, nextEnabled);
					if (!changed) {
						uiStore.info('No changes to apply.');
						return;
					}
					uiStore.success('Dynamic DNS setting updated');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to update dynamic DNS');
				}
			}
		});
	}
</script>

<Card title="Security & WAN">
	{#if cardState.loading && !cardState.security}
		<Skeleton variant="table-rows" rows={6} columns={2} />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<section class="security-section" data-family="wifi-security">
			<h4>Wi-Fi Security</h4>
			<div class="badge-row">
				<span class="text-muted text-sm">WPA3</span>
				<span class="badge {boolBadgeClass(cardState.security?.wpa3)}">
					{boolLabel(cardState.security?.wpa3)}
				</span>
			</div>
			<div class="badge-row">
				<span class="text-muted text-sm">Band Steering</span>
				<span class="badge {boolBadgeClass(cardState.security?.band_steering)}">
					{boolLabel(cardState.security?.band_steering)}
				</span>
			</div>
			<InfoRow label="WPA3 per band" value={summarize(cardState.security?.wpa3_per_band)} mono />
			<InfoRow
				label="Fast transition"
				value={summarize(cardState.security?.fast_transition)}
				mono
			/>
			{#if wifiSecurityControls}
				<div class="section-controls">{@render wifiSecurityControls()}</div>
			{/if}
		</section>

		<section class="security-section" data-family="network">
			<h4>Network</h4>
			<div class="badge-row">
				<span class="text-muted text-sm">UPnP</span>
				<span class="badge {boolBadgeClass(cardState.security?.upnp)}">
					{boolLabel(cardState.security?.upnp)}
				</span>
			</div>
			<div class="badge-row">
				<span class="text-muted text-sm">SQM</span>
				<span class="badge {boolBadgeClass(cardState.security?.sqm)}">
					{boolLabel(cardState.security?.sqm)}
				</span>
			</div>
			<InfoRow label="IPv6" value={summarize(cardState.security?.ipv6)} mono />
			<InfoRow label="Connection mode" value={cardState.advanced?.connection_mode ?? '—'} mono />
			<InfoRow label="DHCP" value={summarize(cardState.advanced?.dhcp)} mono />
			{#if networkControls}
				<div class="section-controls">{@render networkControls()}</div>
			{/if}
		</section>

		<section class="security-section" data-family="power-thread">
			<h4>Power &amp; Thread</h4>
			<InfoRow label="Power saving" value={summarize(cardState.advanced?.power_saving)} mono />
			<div class="badge-row">
				<span class="text-muted text-sm">Thread</span>
				<span class="badge {boolBadgeClass(cardState.security?.thread?.enabled)}">
					{boolLabel(cardState.security?.thread?.enabled)}
				</span>
			</div>
			{#if cardState.security?.thread}
				<InfoRow label="Thread network name" value={cardState.security.thread.name ?? '—'} mono />
				<InfoRow label="Thread channel" value={cardState.security.thread.channel ?? '—'} />
				<InfoRow label="Thread PAN ID" value={cardState.security.thread.pan_id ?? '—'} mono />
			{/if}
			<ExperimentalGate>
				<div class="thread-buttons">
					<button
						class="btn btn-secondary btn-sm"
						onclick={requestToggleThread}
						disabled={cardState.applying}
					>
						{threadEnabled ? 'Disable Thread' : 'Enable Thread'}
					</button>
					<button
						class="btn btn-danger btn-sm"
						onclick={requestRegenerateThreadCredentials}
						disabled={cardState.applying}
					>
						Regenerate Credentials
					</button>
				</div>
			</ExperimentalGate>
			{#if powerThreadControls}
				<div class="section-controls">{@render powerThreadControls()}</div>
			{/if}
		</section>

		<section class="security-section" data-family="updates">
			<h4>Updates</h4>
			<InfoRow label="Updates" value={summarize(cardState.security?.updates)} mono />
			{#if updatesControls}
				<div class="section-controls">{@render updatesControls()}</div>
			{/if}
		</section>

		<section class="security-section" data-family="subnets">
			<h4>Subnets</h4>
			<DataTable
				id="network-subnets"
				columns={subnetColumns}
				rows={subnetRows}
				getRowId={getSubnetRowId}
				emptyTitle="No configured subnets"
				showColumnToggle={false}
			/>
			{#if subnetsControls}
				<div class="section-controls">{@render subnetsControls()}</div>
			{/if}
		</section>

		<section class="security-section" data-family="wan">
			<h4>WAN</h4>
			<div class="badge-row">
				<span class="text-muted text-sm">Multi-static-IP</span>
				<span
					class="badge {cardState.multistaticip?.configured ? 'badge-success' : 'badge-neutral'}"
				>
					{cardState.multistaticip?.configured ? 'Configured' : 'Not configured'}
				</span>
			</div>
			{#if cardState.multistaticip?.configured}
				<InfoRow
					label="Multi-static-IP config"
					value={summarize(cardState.multistaticip.config)}
					mono
				/>
			{/if}
			<InfoRow label="Dynamic DNS" value={summarize(cardState.advanced?.ddns)} mono />
			<ExperimentalGate>
				<button
					class="btn btn-secondary btn-sm"
					onclick={requestToggleDdns}
					disabled={cardState.applying}
				>
					{ddnsEnabled ? 'Disable Dynamic DNS' : 'Enable Dynamic DNS'}
				</button>
			</ExperimentalGate>
			{#if wanControls}
				<div class="section-controls">{@render wanControls()}</div>
			{/if}
		</section>
	{/if}
</Card>

<style>
	.security-section {
		margin-bottom: var(--space-6);
	}

	.security-section:last-child {
		margin-bottom: 0;
	}

	.security-section h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.badge-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.section-controls {
		margin-top: var(--space-3);
	}

	.thread-buttons {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
