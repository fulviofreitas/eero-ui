<!--
  SecurityWanCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP6, deliverable 12):
  combined security settings (`GET /networks/{id}/security`), subnets
  (`/subnets`), multi-static-IP WAN config (`/multistaticip`) and DHCP/
  connection-mode/power-saving/DDNS (`/advanced`).

  Consistency pass (2026-10-07): every setting now renders exactly once as
  a `SettingRow` - label, current value, inline control - instead of a
  read-only badge row plus a separately-rendered, independently-wired write
  control for the same field. The "wifi-security" and "network" families'
  write controls (previously `WifiSecurityControls.svelte`/
  `NetworkSettingsControls.svelte`) are folded directly into this card's
  rows; those two components and their tests were removed. The
  `wifiSecurityControls`/`networkControls` snippet seams are gone with
  them - "power-thread", "updates", "subnets" and "wan" keep their existing
  seams unchanged.

  Every control derives its displayed state from the store (pessimistic,
  never optimistic): changing it opens the existing danger `ConfirmDialog`
  naming the mesh reboot; on cancel or failure the control snaps back to
  the store's value (`onCancel`/`catch` explicitly reset the DOM element -
  a `checked={...}`/`value={...}` attribute binding does not "snap back" on
  its own because the browser already flipped it and the bound expression
  did not change). Controls are hidden entirely (value-only row) when
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES` is off - no per-row note, one
  summary note for the whole card (`anyControlsGated`), same as before.

  DHCP & NAT (Network section) is modelled on the eero app's own screen:
  one Automatic/Manual IP/Bridge selector rather than a separate
  connection-mode radio and DHCP-mode radio. Pure mapping/dirty/prefix
  logic lives in `#lib/utils/dhcp-form.js` so it is unit-tested without
  MSW; this component only wires it to the store's `updateDhcp`/
  `updateConnectionMode`.

  Design decisions worth flagging for reviewers:
  - IPv6 (Network section) now reads `security.ipv6_enabled` (falls back
    to inferring from the legacy `ipv6.name_servers.mode` when the backend
    hasn't shipped the field yet) - distinct from the read-only "IPv6 name
    servers" row, which stays on the old `ipv6.name_servers` shape.
  - Proxied nodes: the backend always reports `proxied_nodes_enabled` as
    `null`/`undefined` today (R1 gap, `types.ts`). The value row shows
    "Unknown" in that case, but the toggle itself is NOT hidden - writes
    are already gated behind the experimental flag and a danger confirm;
    hiding the control entirely would make the feature unreachable with no
    way to recover a stuck "off" guess. The toggle defaults to unchecked
    when unknown.
  - WPA3 (6 GHz) stays read-only: there is no write endpoint for the 6 GHz
    band (`Wpa3PerBandUpdateRequest` only has `band_2_4_ghz`/`band_5_ghz`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { DataTableColumn } from '$components/common/DataTable.svelte';
	import { securityWanStore, uiStore } from '$stores';
	import { experimentalWrites } from '#lib/stores/entitlements.js';
	import { formatDate, formatUptime } from '#lib/utils/eero-format.js';
	import {
		dhcpCustomLeaseIsValid,
		validateDhcpCustomLease,
		dhcpModeFromApi,
		dhcpFormFromApi,
		dhcpFormIsDirty,
		rfc1918PrefixFor,
		buildDhcpWrites,
		type DhcpApiState,
		type DhcpFormState,
		type DhcpTriState
	} from '#lib/utils/dhcp-form.js';
	import { ApiClientError } from '$api/client';
	import type { AdvancedNetworkSettings, SecurityEnvelopeField, Wpa3BandMode } from '$api/types';
	import Card from '$components/common/Card.svelte';
	import DataTable from '$components/common/DataTable.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import InfoRow from '$components/common/InfoRow.svelte';
	import SettingRow from '$components/common/SettingRow.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		networkId: string;
		/** WP8 write-control seams for the families NOT folded into this card's own rows. */
		powerThreadControls?: Snippet;
		updatesControls?: Snippet;
		subnetsControls?: Snippet;
		wanControls?: Snippet;
	}

	let { networkId, powerThreadControls, updatesControls, subnetsControls, wanControls }: Props =
		$props();

	let cardState = $derived($securityWanStore);
	/** Controls render only when the operator has opted in; otherwise value-only rows. */
	let showControls = $derived($experimentalWrites);

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

	const REBOOT_DETAILS = [
		'Every eero on this network will restart, and all connected devices will lose internet ' +
			'access for a minute or two.',
		'If you are connected to this network right now, you will lose your own connection while ' +
			'it restarts.'
	];
	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	// --- WPA3 per band: `get_wpa3_per_band` returns e.g. `{band_2_4_ghz: "wpa2",
	// band_5_ghz: "wpa2", band_6_ghz: "wpa3"}` - lower-case in production. 2.4/5 GHz
	// are editable (select, pre-selected from the normalized current value); 6 GHz has
	// no write endpoint and stays read-only.
	type Wpa3PerBand = Record<string, unknown> | null | undefined;

	const WPA3_MODES: Wpa3BandMode[] = ['WPA2', 'WPA2_WPA3', 'WPA3'];

	function wpa3OptionLabel(mode: Wpa3BandMode): string {
		return mode === 'WPA2_WPA3' ? 'WPA2+WPA3' : mode;
	}

	/** Normalizes a raw per-band value (lower/upper case string, or legacy boolean) to the
	 *  canonical `Wpa3BandMode` used by the write request and the `<select>` value. */
	function normalizeWpa3Mode(mode: unknown): Wpa3BandMode | null {
		if (typeof mode === 'boolean') return mode ? 'WPA3' : 'WPA2';
		if (typeof mode !== 'string' || mode.trim() === '') return null;
		const key = mode.trim().toUpperCase().replace('+', '_');
		if (key === 'WPA2' || key === 'WPA2_WPA3' || key === 'WPA3') return key;
		return null;
	}

	function wpa3ModeLabel(mode: unknown): string {
		const normalized = normalizeWpa3Mode(mode);
		if (!normalized)
			return typeof mode === 'string' && mode.trim() !== '' ? mode.toUpperCase() : '—';
		return wpa3OptionLabel(normalized);
	}

	function wpa3ModeBadgeClass(mode: unknown): string {
		const normalized = normalizeWpa3Mode(mode);
		if (normalized === 'WPA3') return 'badge-success';
		if (normalized === 'WPA2_WPA3') return 'badge-warning';
		return 'badge-neutral';
	}

	let wpa3PerBand = $derived(cardState.security?.wpa3_per_band as Wpa3PerBand);

	function requestWpa3Band(
		band: '2_4_ghz' | '5_ghz',
		mode: Wpa3BandMode,
		selectEl: HTMLSelectElement
	) {
		const key = band === '2_4_ghz' ? 'band_2_4_ghz' : 'band_5_ghz';
		const previous = normalizeWpa3Mode(wpa3PerBand?.[key]);
		if (mode === previous) return;
		uiStore.confirm({
			title: 'Update WPA3',
			message: `Set the ${band === '2_4_ghz' ? '2.4 GHz' : '5 GHz'} band to ${wpa3OptionLabel(mode)}?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onCancel: () => {
				selectEl.value = previous ?? '';
			},
			onConfirm: async () => {
				try {
					const body = band === '2_4_ghz' ? { band_2_4_ghz: mode } : { band_5_ghz: mode };
					const result = await securityWanStore.updateWpa3PerBand(networkId, body);
					if (!result.changed) {
						uiStore.info('WPA3 is already set to that value.');
						selectEl.value = previous ?? '';
						return;
					}
					uiStore.success('WPA3 settings applied. Your network is restarting.');
				} catch (error) {
					selectEl.value = previous ?? '';
					uiStore.error(error instanceof Error ? error.message : 'Failed to update WPA3');
				}
			}
		});
	}

	// --- Security envelope toggles: wpa3, band_steering, upnp, ipv6 - exactly one
	// field per PUT /security request (never two settings writes in one Save).
	function envelopeLabel(field: SecurityEnvelopeField): string {
		return { wpa3: 'WPA3', band_steering: 'Band Steering', upnp: 'UPnP', ipv6: 'IPv6' }[field];
	}

	function envelopeValue(field: SecurityEnvelopeField): boolean {
		if (field === 'ipv6') return ipv6EnabledValue ?? false;
		return Boolean(cardState.security?.[field]);
	}

	function requestToggleEnvelope(field: SecurityEnvelopeField, inputEl: HTMLInputElement) {
		const previous = envelopeValue(field);
		const nextValue = !previous;
		uiStore.confirm({
			title: `Update ${envelopeLabel(field)}`,
			message: `${nextValue ? 'Enable' : 'Disable'} ${envelopeLabel(field)} for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextValue ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onCancel: () => {
				inputEl.checked = previous;
			},
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateSecurityField(networkId, {
						[field]: nextValue
					});
					if (!result.changed) {
						uiStore.info(`${envelopeLabel(field)} is already set to that value.`);
						inputEl.checked = previous;
						return;
					}
					uiStore.success(`${envelopeLabel(field)} applied. Your network is restarting.`);
				} catch (error) {
					inputEl.checked = previous;
					uiStore.error(
						error instanceof Error ? error.message : `Failed to update ${envelopeLabel(field)}`
					);
				}
			}
		});
	}

	/** Generic settings-class boolean toggle (SQM, NAT randomization, fast transition, Passpoint, proxied nodes). */
	function requestSettingsToggle(
		title: string,
		previous: boolean,
		action: (networkId: string, enabled: boolean) => Promise<{ changed: boolean }>,
		label: string,
		inputEl: HTMLInputElement
	) {
		const nextEnabled = !previous;
		uiStore.confirm({
			title: `Update ${title}`,
			message: `${nextEnabled ? 'Enable' : 'Disable'} ${title} for this network?`,
			details: REBOOT_DETAILS,
			confirmText: nextEnabled ? 'Enable & Restart Network' : 'Disable & Restart Network',
			danger: true,
			onCancel: () => {
				inputEl.checked = previous;
			},
			onConfirm: async () => {
				try {
					const result = await action(networkId, nextEnabled);
					if (!result.changed) {
						uiStore.info(`${title} is already set to that value.`);
						inputEl.checked = previous;
						return;
					}
					uiStore.success(`${title} applied. Your network is restarting.`);
				} catch (error) {
					inputEl.checked = previous;
					uiStore.error(error instanceof Error ? error.message : `Failed to update ${label}`);
				}
			}
		});
	}

	// --- Fast transition: `{fast_transition: false}` in production,
	// `{enabled: false}` seen in some fixtures - read either key.
	let fastTransitionEnabled = $derived.by((): boolean => {
		const raw = cardState.security?.fast_transition as
			{ fast_transition?: unknown; enabled?: unknown } | null | undefined;
		if (!raw || typeof raw !== 'object') return false;
		const value = 'fast_transition' in raw ? raw.fast_transition : raw.enabled;
		return typeof value === 'boolean' ? value : false;
	});

	// --- MLO (Multi-Link Operation) mode.
	let mloMode = $derived(cardState.advanced?.mlo_mode ?? null);

	function requestMlo(mode: 'disabled' | 'single' | 'multi', selectEl: HTMLSelectElement) {
		const previous = mloMode;
		if (mode === previous) return;
		uiStore.confirm({
			title: 'Update MLO',
			message: `Set MLO (Multi-Link Operation) mode to ${mode}?`,
			details: REBOOT_DETAILS,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onCancel: () => {
				selectEl.value = previous ?? '';
			},
			onConfirm: async () => {
				try {
					const result = await securityWanStore.updateMlo(networkId, mode);
					if (!result.changed) {
						uiStore.info('MLO is already set to that value.');
						selectEl.value = previous ?? '';
						return;
					}
					uiStore.success('MLO mode applied. Your network is restarting.');
				} catch (error) {
					selectEl.value = previous ?? '';
					uiStore.error(error instanceof Error ? error.message : 'Failed to update MLO mode');
				}
			}
		});
	}

	// --- Passpoint / proxied nodes: see the module doc comment for the proxied-nodes
	// "value unknown, keep the control" decision.
	let passpointEnabled = $derived(Boolean(cardState.security?.passpoint));
	let proxiedNodesKnown = $derived(typeof cardState.advanced?.proxied_nodes_enabled === 'boolean');
	let proxiedNodesValue = $derived(Boolean(cardState.advanced?.proxied_nodes_enabled));

	// --- IPv6: two independent things.
	// 1) `security.ipv6_enabled` (new field) - whether IPv6 upstream is on at all. Falls
	//    back to inferring from the legacy name-server mode when the field is absent.
	// 2) `security.ipv6.name_servers` - the name-server mode/custom list, read-only here.
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
	let ipv6EnabledValue = $derived.by((): boolean | null => {
		const explicit = cardState.security?.ipv6_enabled;
		if (typeof explicit === 'boolean') return explicit;
		if (ipv6Mode) return ipv6Mode.toLowerCase() !== 'disabled';
		return null;
	});

	function modeBadgeLabel(mode: unknown): string {
		return typeof mode === 'string' && mode.trim() !== '' ? mode.toUpperCase() : '—';
	}

	// --- SQM / NAT port randomization.
	let sqmEnabled = $derived(Boolean(cardState.security?.sqm));
	let natEnabled = $derived(Boolean(cardState.advanced?.nat_port_randomization));

	// --- DHCP & NAT (Network section sub-block) - modelled on the eero app's own
	// Automatic/Manual IP/Bridge selector. See `dhcp-form.ts` for the pure mapping.
	type NormalizedDhcp = {
		mode?: unknown;
		starting_address?: unknown;
		ending_address?: unknown;
		subnet_mask?: unknown;
		subnet_ip?: unknown;
		lease_time_seconds?: unknown;
	};
	let dhcp = $derived(cardState.advanced?.dhcp as NormalizedDhcp | null | undefined);
	let dhcpLeaseSeconds = $derived(
		typeof dhcp?.lease_time_seconds === 'number' ? dhcp.lease_time_seconds : null
	);

	function apiStateFrom(advanced: AdvancedNetworkSettings | null | undefined): DhcpApiState {
		return {
			connectionMode: advanced?.connection_mode,
			dhcp: (advanced?.dhcp as Record<string, unknown> | null) ?? null
		};
	}

	function modeLabel(mode: DhcpTriState): string {
		return { automatic: 'Automatic', manual: 'Manual IP', bridge: 'Bridge' }[mode];
	}

	let dhcpForm = $state<DhcpFormState>(dhcpFormFromApi(apiStateFrom(null)));
	/** Set once the operator edits the form - guards the re-seed effect from clobbering unsaved edits. */
	let dhcpFormTouched = $state(false);
	let lastSeededAdvanced: AdvancedNetworkSettings | null | undefined;

	$effect(() => {
		const advanced = cardState.advanced;
		if (advanced !== lastSeededAdvanced) {
			if (!dhcpFormTouched) {
				dhcpForm = dhcpFormFromApi(apiStateFrom(advanced));
			}
			lastSeededAdvanced = advanced;
		}
	});

	function markDhcpTouched() {
		dhcpFormTouched = true;
	}

	function handleDhcpModeChange(mode: DhcpTriState) {
		dhcpFormTouched = true;
		dhcpForm = { ...dhcpForm, mode };
	}

	let dhcpApiStateCurrent = $derived(apiStateFrom(cardState.advanced));
	let dhcpCurrentTriState = $derived(
		dhcpModeFromApi(cardState.advanced?.connection_mode, dhcp?.mode)
	);
	let dhcpLeaseErrors = $derived(
		dhcpForm.mode === 'manual'
			? validateDhcpCustomLease({
					startIp: dhcpForm.manual.startIp,
					endIp: dhcpForm.manual.endIp,
					subnetIp: dhcpForm.manual.subnetIp,
					subnetMask: dhcpForm.manual.subnetMask
				})
			: {}
	);
	let dhcpLeaseValid = $derived(
		dhcpForm.mode !== 'manual' ||
			dhcpCustomLeaseIsValid({
				startIp: dhcpForm.manual.startIp,
				endIp: dhcpForm.manual.endIp,
				subnetIp: dhcpForm.manual.subnetIp,
				subnetMask: dhcpForm.manual.subnetMask
			})
	);
	let dhcpIsDirty = $derived(dhcpFormIsDirty(dhcpForm, dhcpApiStateCurrent));
	let dhcpNeedsBridgeAck = $derived(
		dhcpForm.mode === 'bridge' && dhcpCurrentTriState !== 'bridge' && !dhcpForm.bridgeAcknowledged
	);
	/** Disabled unless the form differs from the API state - an unmodified Save is a no-op. */
	let dhcpSaveEnabled = $derived(dhcpIsDirty && dhcpLeaseValid && !dhcpNeedsBridgeAck);
	let dhcpPrefixDisplay = $derived(rfc1918PrefixFor(dhcpForm.manual.subnetIp) ?? '—');

	function requestDhcpSave() {
		if (!dhcpIsDirty) {
			uiStore.info('No changes to apply.');
			return;
		}
		if (!dhcpLeaseValid || dhcpNeedsBridgeAck) return;

		const plan = buildDhcpWrites(dhcpForm, dhcpApiStateCurrent);
		const writeCount = (plan.connectionMode ? 1 : 0) + (plan.dhcp ? 1 : 0);
		const details = [...REBOOT_DETAILS];
		if (dhcpForm.mode === 'bridge') {
			details.push(
				'Bridge mode disables this network’s own DHCP, NAT, port forwards and profiles.'
			);
		}
		if (writeCount > 1) {
			details.push('This change requires two separate updates - your network may restart twice.');
		}

		uiStore.confirm({
			title: 'Update DHCP & NAT',
			message: `Apply the new ${modeLabel(dhcpForm.mode)} configuration for this network?`,
			details,
			confirmText: 'Apply & Restart Network',
			danger: true,
			onConfirm: async () => {
				try {
					let anyChanged = false;
					if (plan.connectionMode) {
						const result = await securityWanStore.updateConnectionMode(
							networkId,
							plan.connectionMode
						);
						anyChanged = anyChanged || result.changed;
					}
					if (plan.dhcp) {
						const result = await securityWanStore.updateDhcp(networkId, plan.dhcp);
						anyChanged = anyChanged || result.changed;
					}
					if (!anyChanged) {
						uiStore.info('No changes to apply.');
						return;
					}
					dhcpFormTouched = false;
					uiStore.success('DHCP & NAT settings applied. Your network is restarting.');
				} catch (error) {
					if (error instanceof ApiClientError) {
						uiStore.error(error.detail);
						return;
					}
					uiStore.error(error instanceof Error ? error.message : 'Failed to update DHCP & NAT');
				}
			}
		});
	}

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
				...(isBadge
					? {
							render: (() => {
								// Lazily imported to avoid a module-level createRawSnippet cost when unused.
								return undefined;
							})()
						}
					: {}),
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

			<SettingRow label="WPA3">
				{#snippet value()}
					<span class="badge {boolBadgeClass(cardState.security?.wpa3)}">
						{boolLabel(cardState.security?.wpa3)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="WPA3"
							checked={envelopeValue('wpa3')}
							disabled={cardState.applying}
							onchange={(e) => requestToggleEnvelope('wpa3', e.currentTarget)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="WPA3 (2.4 GHz)">
				{#snippet value()}
					<span class="badge {wpa3ModeBadgeClass(wpa3PerBand?.band_2_4_ghz)}">
						{wpa3ModeLabel(wpa3PerBand?.band_2_4_ghz)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<select
							aria-label="WPA3 (2.4 GHz)"
							value={normalizeWpa3Mode(wpa3PerBand?.band_2_4_ghz) ?? ''}
							disabled={cardState.applying}
							onchange={(e) =>
								requestWpa3Band('2_4_ghz', e.currentTarget.value as Wpa3BandMode, e.currentTarget)}
						>
							<option value="" disabled>—</option>
							{#each WPA3_MODES as mode (mode)}
								<option value={mode}>{wpa3OptionLabel(mode)}</option>
							{/each}
						</select>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="WPA3 (5 GHz)">
				{#snippet value()}
					<span class="badge {wpa3ModeBadgeClass(wpa3PerBand?.band_5_ghz)}">
						{wpa3ModeLabel(wpa3PerBand?.band_5_ghz)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<select
							aria-label="WPA3 (5 GHz)"
							value={normalizeWpa3Mode(wpa3PerBand?.band_5_ghz) ?? ''}
							disabled={cardState.applying}
							onchange={(e) =>
								requestWpa3Band('5_ghz', e.currentTarget.value as Wpa3BandMode, e.currentTarget)}
						>
							<option value="" disabled>—</option>
							{#each WPA3_MODES as mode (mode)}
								<option value={mode}>{wpa3OptionLabel(mode)}</option>
							{/each}
						</select>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="WPA3 (6 GHz)" readonly>
				{#snippet value()}
					<span class="badge {wpa3ModeBadgeClass(wpa3PerBand?.band_6_ghz)}">
						{wpa3ModeLabel(wpa3PerBand?.band_6_ghz)}
					</span>
				{/snippet}
			</SettingRow>

			<SettingRow label="Band Steering">
				{#snippet value()}
					<span class="badge {boolBadgeClass(cardState.security?.band_steering)}">
						{boolLabel(cardState.security?.band_steering)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="Band Steering"
							checked={envelopeValue('band_steering')}
							disabled={cardState.applying}
							onchange={(e) => requestToggleEnvelope('band_steering', e.currentTarget)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="Fast transition">
				{#snippet value()}
					<span class="badge {boolBadgeClass(fastTransitionEnabled)}">
						{boolLabel(fastTransitionEnabled)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="Fast transition"
							checked={fastTransitionEnabled}
							disabled={cardState.applying}
							onchange={(e) =>
								requestSettingsToggle(
									'Fast Transition',
									fastTransitionEnabled,
									(id, enabled) => securityWanStore.updateFastTransition(id, enabled),
									'fast transition',
									e.currentTarget
								)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="MLO mode">
				{#snippet value()}
					<span class="badge badge-neutral">{mloMode ?? '—'}</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<select
							aria-label="MLO mode"
							value={mloMode ?? ''}
							disabled={cardState.applying}
							onchange={(e) =>
								requestMlo(
									e.currentTarget.value as 'disabled' | 'single' | 'multi',
									e.currentTarget
								)}
						>
							<option value="" disabled>—</option>
							{#each ['disabled', 'single', 'multi'] as const as mode (mode)}
								<option value={mode}>{mode}</option>
							{/each}
						</select>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="Passpoint">
				{#snippet value()}
					<span class="badge {boolBadgeClass(passpointEnabled)}">{boolLabel(passpointEnabled)}</span
					>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="Passpoint"
							checked={passpointEnabled}
							disabled={cardState.applying}
							onchange={(e) =>
								requestSettingsToggle(
									'Passpoint',
									passpointEnabled,
									(id, enabled) => securityWanStore.updatePasspoint(id, enabled),
									'Passpoint',
									e.currentTarget
								)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow
				label="Proxied nodes"
				hint={proxiedNodesKnown ? undefined : 'Current value unknown - check before changing.'}
			>
				{#snippet value()}
					<span
						class="badge {proxiedNodesKnown ? boolBadgeClass(proxiedNodesValue) : 'badge-neutral'}"
					>
						{proxiedNodesKnown ? boolLabel(proxiedNodesValue) : 'Unknown'}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="Proxied nodes"
							checked={proxiedNodesValue}
							disabled={cardState.applying}
							onchange={(e) =>
								requestSettingsToggle(
									'Proxied Nodes',
									proxiedNodesValue,
									(id, enabled) => securityWanStore.updateProxiedNodes(id, enabled),
									'proxied nodes',
									e.currentTarget
								)}
						/>
					{/if}
				{/snippet}
			</SettingRow>
		</section>

		<section class="security-section" data-family="network">
			<h4>Network</h4>

			<SettingRow label="UPnP">
				{#snippet value()}
					<span class="badge {boolBadgeClass(cardState.security?.upnp)}">
						{boolLabel(cardState.security?.upnp)}
					</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="UPnP"
							checked={envelopeValue('upnp')}
							disabled={cardState.applying}
							onchange={(e) => requestToggleEnvelope('upnp', e.currentTarget)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="SQM">
				{#snippet value()}
					<span class="badge {boolBadgeClass(sqmEnabled)}">{boolLabel(sqmEnabled)}</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="SQM"
							checked={sqmEnabled}
							disabled={cardState.applying}
							onchange={(e) =>
								requestSettingsToggle(
									'SQM',
									sqmEnabled,
									(id, enabled) => securityWanStore.updateSqm(id, enabled),
									'SQM',
									e.currentTarget
								)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="IPv6 enabled">
				{#snippet value()}
					<span class="badge {boolBadgeClass(ipv6EnabledValue)}">{boolLabel(ipv6EnabledValue)}</span
					>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="IPv6 enabled"
							checked={ipv6EnabledValue ?? false}
							disabled={cardState.applying}
							onchange={(e) => requestToggleEnvelope('ipv6', e.currentTarget)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="IPv6 name servers" readonly>
				{#snippet value()}
					{#if ipv6NameServers}
						<span class="badge badge-info">{modeBadgeLabel(ipv6Mode)}</span>
						{#if ipv6Mode?.toLowerCase() === 'custom' && ipv6CustomServers.length > 0}
							<span class="mono">{ipv6CustomServers.join(', ')}</span>
						{/if}
					{:else}
						<span class="mono">{ipv6Fallback ?? '—'}</span>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow label="NAT port randomization">
				{#snippet value()}
					<span class="badge {boolBadgeClass(natEnabled)}">{boolLabel(natEnabled)}</span>
				{/snippet}
				{#snippet control()}
					{#if showControls}
						<input
							type="checkbox"
							role="switch"
							aria-label="NAT port randomization"
							checked={natEnabled}
							disabled={cardState.applying}
							onchange={(e) =>
								requestSettingsToggle(
									'NAT Port Randomization',
									natEnabled,
									(id, enabled) => securityWanStore.updateNatPortRandomization(id, enabled),
									'NAT port randomization',
									e.currentTarget
								)}
						/>
					{/if}
				{/snippet}
			</SettingRow>

			<div class="dhcp-subblock">
				<h5>DHCP &amp; NAT</h5>

				{#if showControls}
					<SettingRow label="Mode">
						{#snippet control()}
							<div class="segmented-group">
								{#each ['automatic', 'manual', 'bridge'] as const as mode (mode)}
									<label class="radio-inline">
										<input
											type="radio"
											name="dhcp-tristate-{networkId}"
											value={mode}
											checked={dhcpForm.mode === mode}
											disabled={cardState.applying}
											onchange={() => handleDhcpModeChange(mode)}
										/>
										{modeLabel(mode)}
									</label>
								{/each}
							</div>
						{/snippet}
					</SettingRow>

					{#if dhcpForm.mode === 'bridge' && dhcpCurrentTriState !== 'bridge'}
						<label class="checkbox-inline">
							<input
								type="checkbox"
								bind:checked={dhcpForm.bridgeAcknowledged}
								onchange={markDhcpTouched}
								disabled={cardState.applying}
							/>
							I understand switching to Bridge disables this network’s own DHCP, NAT, port forwards and
							profiles.
						</label>
					{/if}

					{#if dhcpForm.mode === 'manual'}
						<SettingRow
							label="IP address prefix"
							readonly
							value={dhcpPrefixDisplay}
							hint="Derived from the subnet IP"
						/>
						<SettingRow label="Subnet IP">
							{#snippet control()}
								<input
									class="input mono"
									class:input-error={dhcpLeaseErrors.subnetIp}
									type="text"
									aria-label="Subnet IP"
									bind:value={dhcpForm.manual.subnetIp}
									oninput={markDhcpTouched}
									disabled={cardState.applying}
								/>
							{/snippet}
						</SettingRow>
						<SettingRow label="Subnet mask">
							{#snippet control()}
								<input
									class="input mono"
									class:input-error={dhcpLeaseErrors.subnetMask}
									type="text"
									aria-label="Subnet mask"
									bind:value={dhcpForm.manual.subnetMask}
									oninput={markDhcpTouched}
									disabled={cardState.applying}
								/>
							{/snippet}
						</SettingRow>
						<SettingRow label="Starting IP">
							{#snippet control()}
								<input
									class="input mono"
									class:input-error={dhcpLeaseErrors.startIp}
									type="text"
									aria-label="Starting IP"
									bind:value={dhcpForm.manual.startIp}
									oninput={markDhcpTouched}
									disabled={cardState.applying}
								/>
							{/snippet}
						</SettingRow>
						<SettingRow label="Ending IP">
							{#snippet control()}
								<input
									class="input mono"
									class:input-error={dhcpLeaseErrors.endIp}
									type="text"
									aria-label="Ending IP"
									bind:value={dhcpForm.manual.endIp}
									oninput={markDhcpTouched}
									disabled={cardState.applying}
								/>
							{/snippet}
						</SettingRow>
						<SettingRow label="Lease time" readonly value={formatUptime(dhcpLeaseSeconds)} />
					{/if}

					<div class="control-row">
						<button
							type="button"
							class="btn btn-primary"
							onclick={requestDhcpSave}
							disabled={cardState.applying || !dhcpSaveEnabled}
						>
							Save
						</button>
					</div>
				{:else}
					<SettingRow label="Mode" readonly value={modeLabel(dhcpCurrentTriState)} />
					{#if dhcpCurrentTriState === 'manual'}
						<SettingRow label="IP address prefix" readonly value={dhcpPrefixDisplay} />
						<SettingRow
							label="Subnet IP"
							readonly
							value={typeof dhcp?.subnet_ip === 'string' ? dhcp.subnet_ip : '—'}
						/>
						<SettingRow
							label="Subnet mask"
							readonly
							value={typeof dhcp?.subnet_mask === 'string' ? dhcp.subnet_mask : '—'}
						/>
						<SettingRow
							label="Starting IP"
							readonly
							value={typeof dhcp?.starting_address === 'string' ? dhcp.starting_address : '—'}
						/>
						<SettingRow
							label="Ending IP"
							readonly
							value={typeof dhcp?.ending_address === 'string' ? dhcp.ending_address : '—'}
						/>
						<SettingRow label="Lease time" readonly value={formatUptime(dhcpLeaseSeconds)} />
					{/if}
				{/if}
			</div>
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

	.dhcp-subblock {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.dhcp-subblock h5 {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin: 0 0 var(--space-2);
	}

	.segmented-group {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.radio-inline,
	.checkbox-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.875rem;
	}

	.checkbox-inline {
		margin: var(--space-2) 0;
	}

	.control-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.input-error {
		border-color: var(--color-danger);
	}

	.mono {
		font-family: var(--font-mono);
	}
</style>
