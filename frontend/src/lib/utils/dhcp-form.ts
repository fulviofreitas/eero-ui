/**
 * Manual DHCP lease-range form helpers.
 *
 * Mirrors the backend's own validation
 * (`backend/app/routes/networks.py::_validate_dhcp_custom_range`, security
 * review 2026-09-24 S2) so a malformed range is rejected client-side before
 * ever reaching the settings-class write: IPv4 only, RFC1918 private,
 * prefix length /16-/30, `start_ip <= end_ip`, both endpoints within the
 * subnet's usable host range, and the subnet's own router address (the
 * network's first host) excluded from `[start_ip, end_ip]`.
 */

import type { DhcpCustomLease } from '$api/types';

export interface DhcpCustomLeaseForm {
	startIp: string;
	endIp: string;
	subnetIp: string;
	subnetMask: string;
}

export type DhcpCustomLeaseErrors = Partial<Record<keyof DhcpCustomLeaseForm, string>>;

function ipv4ToInt(value: string): number | null {
	const parts = value.trim().split('.');
	if (parts.length !== 4) return null;
	let result = 0;
	for (const part of parts) {
		// Reject leading zeros (e.g. "010") - ambiguous octal-looking input, not a valid
		// dotted-quad octet on its own ("0" itself is fine).
		if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
		const n = Number(part);
		if (n < 0 || n > 255) return null;
		result = result * 256 + n;
	}
	return result;
}

function maskFor(prefixLen: number): number {
	return prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
}

/** Loose IPv4 string equality: compares parsed values when both parse, else trimmed strings. */
function ipEquals(a: unknown, b: unknown): boolean {
	const aStr = typeof a === 'string' ? a.trim() : '';
	const bStr = typeof b === 'string' ? b.trim() : '';
	const aInt = ipv4ToInt(aStr);
	const bInt = ipv4ToInt(bStr);
	if (aInt !== null && bInt !== null) return aInt === bInt;
	return aStr === bStr;
}

function maskToPrefixLen(mask: string): number | null {
	const value = ipv4ToInt(mask);
	if (value === null) return null;
	// A valid subnet mask is a contiguous run of 1 bits followed by 0 bits.
	const binary = value.toString(2).padStart(32, '0');
	const firstZero = binary.indexOf('0');
	const ones = firstZero === -1 ? 32 : firstZero;
	const reconstructed = '1'.repeat(ones).padEnd(32, '0');
	if (reconstructed !== binary) return null;
	return ones;
}

function isRfc1918(networkInt: number, prefixLen: number): boolean {
	// 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
	const ten = 10 << 24;
	const tenTwelve = ((172 << 24) | (16 << 16)) >>> 0;
	const oneNineTwo = ((192 << 24) | (168 << 16)) >>> 0;
	if ((networkInt & maskFor(8)) === (ten & maskFor(8)) && prefixLen >= 8) return true;
	if ((networkInt & maskFor(12)) === (tenTwelve & maskFor(12)) && prefixLen >= 12) return true;
	if ((networkInt & maskFor(16)) === (oneNineTwo & maskFor(16)) && prefixLen >= 16) return true;
	return false;
}

export function validateDhcpCustomLease(form: DhcpCustomLeaseForm): DhcpCustomLeaseErrors {
	const errors: DhcpCustomLeaseErrors = {};

	const start = ipv4ToInt(form.startIp);
	const end = ipv4ToInt(form.endIp);
	const subnetIp = ipv4ToInt(form.subnetIp);
	const prefixLen = maskToPrefixLen(form.subnetMask);

	if (start === null) errors.startIp = 'Enter a valid IPv4 address';
	if (end === null) errors.endIp = 'Enter a valid IPv4 address';
	if (subnetIp === null) errors.subnetIp = 'Enter a valid IPv4 address';
	if (prefixLen === null) errors.subnetMask = 'Enter a valid IPv4 subnet mask';

	if (start === null || end === null || subnetIp === null || prefixLen === null) {
		return errors;
	}

	const maskInt = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
	const networkInt = (subnetIp & maskInt) >>> 0;

	if (!isRfc1918(networkInt, prefixLen)) {
		errors.subnetIp = 'subnet_ip/subnet_mask must be an RFC1918 private network';
	}
	if (prefixLen < 16 || prefixLen > 30) {
		errors.subnetMask = 'Prefix must be between /16 and /30';
	}
	if (start > end) {
		errors.startIp = 'start_ip must be less than or equal to end_ip';
	}

	const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
	const firstHost = networkInt + 1;
	const lastHost = broadcastInt - 1;
	if (start < firstHost || start > lastHost) {
		errors.startIp = errors.startIp ?? 'start_ip must fall within the subnet’s usable host range';
	}
	if (end < firstHost || end > lastHost) {
		errors.endIp = errors.endIp ?? 'end_ip must fall within the subnet’s usable host range';
	}

	const router = firstHost;
	if (start <= router && router <= end) {
		errors.startIp = errors.startIp ?? 'Range must exclude the subnet’s router address';
	}

	return errors;
}

export function dhcpCustomLeaseIsValid(form: DhcpCustomLeaseForm): boolean {
	return Object.keys(validateDhcpCustomLease(form)).length === 0;
}

// ============================================
// DHCP & NAT tri-state form (consistency pass, 2026-10-07)
//
// Models the "DHCP & NAT" sub-block the way the eero app does: one
// Automatic/Manual IP/Bridge selector rather than a separate connection-mode
// radio and DHCP-mode radio. Pure helpers only - no store/API access - so
// every transition can be unit-tested without MSW.
// ============================================

export type DhcpTriState = 'automatic' | 'manual' | 'bridge';

export interface DhcpManualForm {
	subnetIp: string;
	subnetMask: string;
	startIp: string;
	endIp: string;
}

export interface DhcpFormState {
	mode: DhcpTriState;
	manual: DhcpManualForm;
	bridgeAcknowledged: boolean;
}

/** Shape read off `AdvancedNetworkSettings` - loose/defensive, mirrors the backend's own fields. */
export interface DhcpApiState {
	connectionMode: string | null | undefined;
	dhcp:
		| {
				mode?: unknown;
				subnet_ip?: unknown;
				subnet_mask?: unknown;
				starting_address?: unknown;
				ending_address?: unknown;
				lease_time_seconds?: unknown;
		  }
		| Record<string, unknown>
		| null
		| undefined;
}

export interface DhcpWritePlan {
	connectionMode?: { mode: 'BRIDGE' | 'NAT'; acknowledge_disables_routing?: boolean };
	dhcp?: { mode: 'automatic' | 'manual'; custom?: DhcpCustomLease };
}

function dhcpModeFieldIsManual(dhcpMode: unknown): boolean {
	return (
		typeof dhcpMode === 'string' && ['custom', 'manual'].includes(dhcpMode.trim().toLowerCase())
	);
}

/**
 * Derives the tri-state selector value from the API's own `connection_mode` (case-insensitive -
 * `"BRIDGE"`/`"bridge"`) and `dhcp.mode` (`"custom"`, `"manual"` or `"automatic"`). Bridge wins
 * over the DHCP mode field, mirroring the eero app: a bridged network has no DHCP of its own.
 */
export function dhcpModeFromApi(
	connectionMode: string | null | undefined,
	dhcpMode: unknown
): DhcpTriState {
	if (typeof connectionMode === 'string' && connectionMode.trim().toLowerCase() === 'bridge') {
		return 'bridge';
	}
	return dhcpModeFieldIsManual(dhcpMode) ? 'manual' : 'automatic';
}

/** The RFC1918 block (`/8`, `/12` or `/16`) containing `subnetIp`, or `null` outside all three. */
export function rfc1918PrefixFor(subnetIp: string | null | undefined): string | null {
	if (typeof subnetIp !== 'string') return null;
	const value = ipv4ToInt(subnetIp.trim());
	if (value === null) return null;

	const ten = 10 << 24;
	const tenTwelve = ((172 << 24) | (16 << 16)) >>> 0;
	const oneNineTwo = ((192 << 24) | (168 << 16)) >>> 0;

	if ((value & maskFor(8)) >>> 0 === (ten & maskFor(8)) >>> 0) return '10.0.0.0/8';
	if ((value & maskFor(12)) >>> 0 === tenTwelve) return '172.16.0.0/12';
	if ((value & maskFor(16)) >>> 0 === oneNineTwo) return '192.168.0.0/16';
	return null;
}

/** Prefills the tri-state form from the current API state. `bridgeAcknowledged` always starts false. */
export function dhcpFormFromApi(api: DhcpApiState): DhcpFormState {
	const dhcp = (api.dhcp ?? {}) as Record<string, unknown>;
	return {
		mode: dhcpModeFromApi(api.connectionMode, dhcp.mode),
		manual: {
			subnetIp: typeof dhcp.subnet_ip === 'string' ? dhcp.subnet_ip : '',
			subnetMask: typeof dhcp.subnet_mask === 'string' ? dhcp.subnet_mask : '',
			startIp: typeof dhcp.starting_address === 'string' ? dhcp.starting_address : '',
			endIp: typeof dhcp.ending_address === 'string' ? dhcp.ending_address : ''
		},
		bridgeAcknowledged: false
	};
}

/** Does the target manual lease (ignoring mode/Bridge) differ from the API's current DHCP fields? */
function manualFieldsDiffer(form: DhcpFormState, api: DhcpApiState): boolean {
	const dhcp = (api.dhcp ?? {}) as Record<string, unknown>;
	return (
		!ipEquals(form.manual.subnetIp, dhcp.subnet_ip) ||
		!ipEquals(form.manual.subnetMask, dhcp.subnet_mask) ||
		!ipEquals(form.manual.startIp, dhcp.starting_address) ||
		!ipEquals(form.manual.endIp, dhcp.ending_address)
	);
}

/**
 * Does the target DHCP config (mode + manual fields, ignoring Bridge) differ from what the API
 * currently reports for DHCP? Used to decide whether a DHCP write is needed when leaving Bridge,
 * where the mode comparison alone is meaningless (the API's DHCP fields predate the Bridge
 * switch and may already match the target).
 */
function dhcpPortionDiffers(form: DhcpFormState, api: DhcpApiState): boolean {
	const dhcp = (api.dhcp ?? {}) as Record<string, unknown>;
	const apiIsManual = dhcpModeFieldIsManual(dhcp.mode);
	const formIsManual = form.mode === 'manual';
	if (apiIsManual !== formIsManual) return true;
	return formIsManual && manualFieldsDiffer(form, api);
}

/**
 * Is the form dirty relative to the API state? Drives the Save button's `disabled` state - an
 * unmodified form must never be able to issue a write (plan requirement: "unmodified Save is
 * disabled and a no-op").
 */
export function dhcpFormIsDirty(form: DhcpFormState, api: DhcpApiState): boolean {
	const currentMode = dhcpModeFromApi(
		api.connectionMode,
		(api.dhcp as Record<string, unknown> | null)?.mode
	);
	if (form.mode !== currentMode) return true;
	if (form.mode === 'manual') return manualFieldsDiffer(form, api);
	return false;
}

/**
 * Builds the write plan for the tri-state form. At most one `connection-mode` write and one
 * `dhcp` write - never more than two requests, and only the writes actually needed:
 *
 * - Automatic/Manual IP -> Bridge: one `connection-mode` write (`BRIDGE`).
 * - Bridge -> Automatic/Manual IP: `connection-mode` (`NAT`), plus `dhcp` only if the target DHCP
 *   config differs from what the API already holds for DHCP.
 * - Automatic <-> Manual IP (no Bridge either side): one `dhcp` write.
 */
export function buildDhcpWrites(form: DhcpFormState, api: DhcpApiState): DhcpWritePlan {
	const plan: DhcpWritePlan = {};
	const currentMode = dhcpModeFromApi(
		api.connectionMode,
		(api.dhcp as Record<string, unknown> | null)?.mode
	);

	if (form.mode === 'bridge') {
		if (currentMode !== 'bridge') {
			plan.connectionMode = { mode: 'BRIDGE', acknowledge_disables_routing: true };
		}
		return plan;
	}

	if (currentMode === 'bridge') {
		plan.connectionMode = { mode: 'NAT' };
		if (dhcpPortionDiffers(form, api)) {
			plan.dhcp = dhcpTargetBody(form);
		}
		return plan;
	}

	if (dhcpPortionDiffers(form, api)) {
		plan.dhcp = dhcpTargetBody(form);
	}
	return plan;
}

function dhcpTargetBody(form: DhcpFormState): {
	mode: 'automatic' | 'manual';
	custom?: DhcpCustomLease;
} {
	if (form.mode === 'manual') {
		return {
			mode: 'manual',
			custom: {
				start_ip: form.manual.startIp.trim(),
				end_ip: form.manual.endIp.trim(),
				subnet_ip: form.manual.subnetIp.trim(),
				subnet_mask: form.manual.subnetMask.trim()
			}
		};
	}
	return { mode: 'automatic' };
}
