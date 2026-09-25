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
	import { onMount, createRawSnippet } from 'svelte';
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { DataTableColumn } from '$components/common/DataTable.svelte';
	import { securityWanStore, uiStore } from '$stores';
	import { experimentalWrites } from '$lib/stores/entitlements';
	import { formatDate, formatUptime } from '$lib/utils/eero-format';
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

	/**
	 * `value` is left as-is (never `JSON.stringify`d) for anything handed to
	 * `InfoRow` - objects/arrays fall back to `NestedValue` there. This only
	 * covers the boolean-to-Yes/No conversion still needed for a handful of
	 * scalar/`Any`-typed fields (power saving, multi-static-IP "configured").
	 */
	function summarize(value: unknown): unknown {
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return value;
	}

	// --- WPA3 per band (bug-fix follow-up, maintainer screenshot 2026-09-25):
	// `get_wpa3_per_band` returns e.g. `{band_2_4_ghz: "wpa2", band_5_ghz:
	// "wpa2", band_6_ghz: "wpa3"}` - rendered as three rows with the mode as
	// a badge rather than the raw JSON blob.
	type Wpa3PerBand = Record<string, unknown> | null | undefined;

	const WPA3_BAND_ROWS: Array<{ key: string; label: string }> = [
		{ key: 'band_2_4_ghz', label: '2.4 GHz' },
		{ key: 'band_5_ghz', label: '5 GHz' },
		{ key: 'band_6_ghz', label: '6 GHz' }
	];

	function wpa3ModeLabel(mode: unknown): string {
		if (typeof mode === 'boolean') return mode ? 'WPA3' : 'WPA2';
		if (typeof mode !== 'string' || mode.trim() === '') return '—';
		const key = mode.trim().toUpperCase().replace('+', '_');
		if (key === 'WPA2_WPA3') return 'WPA2+WPA3';
		if (key === 'WPA2' || key === 'WPA3') return key;
		return mode.toUpperCase();
	}

	function wpa3ModeBadgeClass(mode: unknown): string {
		if (typeof mode === 'boolean') return mode ? 'badge-success' : 'badge-neutral';
		if (typeof mode !== 'string' || mode.trim() === '') return 'badge-neutral';
		const key = mode.trim().toUpperCase().replace('+', '_');
		if (key === 'WPA3') return 'badge-success';
		if (key === 'WPA2_WPA3') return 'badge-warning';
		return 'badge-neutral';
	}

	let wpa3PerBand = $derived(cardState.security?.wpa3_per_band as Wpa3PerBand);

	// --- Fast transition: `{fast_transition: false}` in production,
	// `{enabled: false}` seen in some fixtures - read either key.
	let fastTransitionEnabled = $derived.by((): boolean | null => {
		const raw = cardState.security?.fast_transition as
			{ fast_transition?: unknown; enabled?: unknown } | null | undefined;
		if (!raw || typeof raw !== 'object') return null;
		const value = 'fast_transition' in raw ? raw.fast_transition : raw.enabled;
		return typeof value === 'boolean' ? value : null;
	});

	// --- IPv6: `{name_servers: {mode: "custom"|"automatic", custom: [...]}}`
	// in production; a bare status string is tolerated too.
	let ipv6Raw = $derived(cardState.security?.ipv6);
	let ipv6NameServers = $derived.by((): { mode?: unknown; custom?: unknown } | null => {
		if (ipv6Raw && typeof ipv6Raw === 'object' && 'name_servers' in ipv6Raw) {
			const ns = (ipv6Raw as { name_servers?: unknown }).name_servers;
			return ns && typeof ns === 'object' ? (ns as { mode?: unknown; custom?: unknown }) : null;
		}
		return null;
	});
	let ipv6Mode = $derived(typeof ipv6NameServers?.mode === 'string' ? ipv6NameServers.mode : null);
	let ipv6CustomServers = $derived.by((): string[] => {
		const custom = ipv6NameServers?.custom;
		return Array.isArray(custom) ? custom.map((entry) => String(entry)) : [];
	});
	let ipv6Fallback = $derived(
		!ipv6NameServers && typeof ipv6Raw === 'string' && ipv6Raw.trim() !== '' ? ipv6Raw : null
	);

	function modeBadgeLabel(mode: unknown): string {
		return typeof mode === 'string' && mode.trim() !== '' ? mode.toUpperCase() : '—';
	}

	// --- DHCP: normalized by the backend (`normalize_dhcp`) to
	// `{mode, starting_address, ending_address, subnet_mask, subnet_ip,
	// lease_time_seconds}` - rendered as rows rather than the raw dict.
	type NormalizedDhcp = {
		mode?: unknown;
		starting_address?: unknown;
		ending_address?: unknown;
		subnet_mask?: unknown;
		subnet_ip?: unknown;
		lease_time_seconds?: unknown;
	};
	let dhcp = $derived(cardState.advanced?.dhcp as NormalizedDhcp | null | undefined);
	let dhcpRange = $derived.by((): string => {
		const start = dhcp?.starting_address;
		const end = dhcp?.ending_address;
		if (!start && !end) return '—';
		return `${start ?? '—'} – ${end ?? '—'}`;
	});
	let dhcpLeaseSeconds = $derived(
		typeof dhcp?.lease_time_seconds === 'number' ? dhcp.lease_time_seconds : null
	);

	// --- Updates: raw envelope passthrough (`get_updates`), field names not
	// contractually fixed - read the first candidate key present so a rename
	// upstream degrades to "–" instead of a crash.
	function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
		if (!obj) return undefined;
		for (const key of keys) {
			if (obj[key] !== undefined && obj[key] !== null) return obj[key];
		}
		return undefined;
	}

	let updates = $derived(cardState.security?.updates as Record<string, unknown> | null | undefined);
	let updateAvailable = $derived.by((): boolean | null => {
		const value = pick(updates, 'available', 'has_update', 'update_available');
		return typeof value === 'boolean' ? value : null;
	});
	let targetFirmware = $derived(
		pick(updates, 'target_firmware', 'target_version', 'target') as string | undefined
	);
	let currentFirmware = $derived(
		pick(updates, 'current_firmware', 'current_version', 'current') as string | undefined
	);
	let preferredUpdateHour = $derived(pick(updates, 'preferred_update_hour', 'update_hour', 'hour'));
	let lastUpdateStarted = $derived(
		pick(updates, 'last_update_started', 'started_at', 'last_started') as string | undefined
	);
	let unresponsiveEeroCount = $derived(
		pick(updates, 'unresponsive_eero_count', 'unresponsive_eeros_count')
	);
	let incompleteEeroCount = $derived(
		pick(updates, 'incomplete_eero_count', 'incomplete_eeros_count')
	);
	let manifestResource = $derived(pick(updates, 'manifest_resource') as string | undefined);
	let manifestResourceIsUrl = $derived(
		typeof manifestResource === 'string' && /^https?:\/\//i.test(manifestResource)
	);

	// --- One summary note per card (bug-fix follow-up, maintainer
	// screenshot 2026-09-25): every gated control in this card is wrapped in
	// `ExperimentalGate {silent}`, which hides its children without a note
	// when the gate is off - this renders exactly one note for the whole
	// card instead of one per gated control.
	let anyControlsGated = $derived(!$experimentalWrites);

	type SubnetRow = { fields: Record<string, unknown>; index: number };

	const SUBNET_EXCLUDED_KEYS = new SvelteSet(['subnet_id', 'network_id', 'id']);
	const SUBNET_BADGE_KEYS = new SvelteSet([
		'enabled',
		'wan_access',
		'lan_access',
		'nat_port_randomization',
		'password_set',
		'has_password'
	]);

	function humanizeSubnetKey(key: string): string {
		return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/**
	 * Compact badge cell for a boolean-ish subnet field, built with
	 * `createRawSnippet` (raw HTML, not a full component) rather than
	 * plain text - `DataTableColumn.render` only accepts a `Snippet<[T]>`,
	 * so each badge column gets its own snippet closed over `key`.
	 */
	function subnetBadgeSnippet(key: string) {
		return createRawSnippet<[SubnetRow]>((getRow) => ({
			render: () => {
				const value = getRow().fields[key];
				const bool = typeof value === 'boolean' ? value : null;
				const label = bool === null ? '—' : bool ? 'Yes' : 'No';
				const cls = bool === true ? 'badge-success' : 'badge-neutral';
				return `<span class="badge ${cls}">${label}</span>`;
			}
		}));
	}

	const subnetRows = $derived.by((): SubnetRow[] =>
		(cardState.subnets?.subnets ?? []).map((fields, index) => ({ fields, index }))
	);

	const subnetColumns = $derived.by((): DataTableColumn<SubnetRow>[] => {
		const keys = new SvelteSet<string>();
		for (const row of subnetRows) {
			for (const key of Object.keys(row.fields)) {
				if (!SUBNET_EXCLUDED_KEYS.has(key)) keys.add(key);
			}
		}
		const columns = Array.from(keys).map((key, i) => {
			const isBadge = SUBNET_BADGE_KEYS.has(key);
			return {
				key,
				header: humanizeSubnetKey(key),
				required: i === 0,
				...(isBadge ? { render: subnetBadgeSnippet(key) } : {}),
				accessor: (row: SubnetRow) => {
					const value = row.fields[key];
					if (typeof value === 'boolean') return value ? 'Yes' : 'No';
					if (value === null || value === undefined || value === '') return '—';
					if (typeof value === 'object') return '—';
					return String(value);
				}
			};
		});
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
			<div class="wpa3-band-rows">
				{#each WPA3_BAND_ROWS as band (band.key)}
					<div class="badge-row">
						<span class="text-muted text-sm">WPA3 ({band.label})</span>
						<span class="badge {wpa3ModeBadgeClass(wpa3PerBand?.[band.key])}">
							{wpa3ModeLabel(wpa3PerBand?.[band.key])}
						</span>
					</div>
				{/each}
			</div>
			<div class="badge-row">
				<span class="text-muted text-sm">Fast transition</span>
				<span class="badge {boolBadgeClass(fastTransitionEnabled)}">
					{boolLabel(fastTransitionEnabled)}
				</span>
			</div>
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
			{#if ipv6NameServers}
				<div class="badge-row">
					<span class="text-muted text-sm">IPv6</span>
					<span class="badge badge-info">{modeBadgeLabel(ipv6Mode)}</span>
				</div>
				{#if ipv6Mode?.toLowerCase() === 'custom' && ipv6CustomServers.length > 0}
					<InfoRow label="IPv6 name servers" value={ipv6CustomServers} mono />
				{/if}
			{:else}
				<InfoRow label="IPv6" value={ipv6Fallback ?? '—'} mono />
			{/if}
			<InfoRow
				label="Connection mode"
				value={cardState.advanced?.connection_mode ?? 'Automatic'}
				mono
			/>
			<InfoRow label="DHCP mode" value={modeBadgeLabel(dhcp?.mode)} mono />
			<InfoRow label="DHCP range" value={dhcpRange} mono />
			<InfoRow label="Subnet" value={dhcp?.subnet_ip ?? '—'} mono />
			<InfoRow label="Subnet mask" value={dhcp?.subnet_mask ?? '—'} mono />
			<InfoRow label="Lease time" value={formatUptime(dhcpLeaseSeconds)} />
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
			<ExperimentalGate silent>
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
			<div class="badge-row">
				<span class="text-muted text-sm">Update available</span>
				<span class="badge {boolBadgeClass(updateAvailable)}">
					{updateAvailable === null ? '—' : updateAvailable ? 'Yes' : 'No'}
				</span>
			</div>
			<InfoRow label="Target firmware" value={targetFirmware ?? '—'} mono />
			<InfoRow label="Current firmware" value={currentFirmware ?? '—'} mono />
			<InfoRow label="Preferred update hour" value={preferredUpdateHour ?? '—'} />
			<InfoRow label="Last update started" value={formatDate(lastUpdateStarted)} />
			<InfoRow label="Unresponsive eeros" value={unresponsiveEeroCount ?? '—'} />
			<InfoRow label="Incomplete eeros" value={incompleteEeroCount ?? '—'} />
			{#if manifestResourceIsUrl}
				<div class="badge-row">
					<span class="text-muted text-sm">Release notes</span>
					<a href={manifestResource} target="_blank" rel="noopener noreferrer">
						View release notes
					</a>
				</div>
			{/if}
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
				<InfoRow label="Multi-static-IP config" value={cardState.multistaticip.config} mono />
			{/if}
			<InfoRow label="Dynamic DNS" value={cardState.advanced?.ddns} mono />
			<ExperimentalGate silent>
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

		{#if anyControlsGated}
			<div class="experimental-gate-note" role="note">
				<span class="text-muted text-sm">
					Disabled by operator — set
					<code>EERO_DASHBOARD_EXPERIMENTAL_WRITES=true</code>
					to enable the write controls on this card.
				</span>
			</div>
		{/if}
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

	.experimental-gate-note {
		display: flex;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}
</style>
