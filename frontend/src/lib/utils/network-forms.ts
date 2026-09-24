/**
 * Client-side validation for the Forwards & Reservations forms
 * (phase-6.0-revamp.md § 7 WP7, family 8). Mirrors the backend's own checks
 * (`backend/app/routes/networks.py` `_validate_port`/`_validate_private_ipv4`/
 * `is_valid_mac`) closely enough to catch obvious mistakes before a round
 * trip - the backend remains the source of truth and re-validates everything
 * server-side.
 */

import { isValidIpv4, normalizeIpv4 } from './ip-address';

/** A TCP/UDP port must be an integer in 1-65535. */
export function isValidPort(value: number): boolean {
	return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * A forward/reservation `ip` names a LAN client on the caller's own network -
 * it can never legitimately be a public address. Approximates Python's
 * `ipaddress.IPv4Address.is_private` for the ranges an operator's LAN would
 * plausibly use (RFC 1918 plus loopback/link-local); the backend is the
 * authoritative check.
 */
export function isPrivateIpv4(value: string): boolean {
	const normalized = normalizeIpv4(value);
	if (normalized === null) return false;
	const [a, b] = normalized.split('.').map(Number);

	if (a === 10) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 127) return true;
	if (a === 169 && b === 254) return true;
	return false;
}

/** A lowercase, colon-separated MAC address, e.g. "aa:bb:cc:dd:ee:ff". */
export function isValidMac(value: string): boolean {
	return /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(value);
}

/** A public IP literal (IPv4 or IPv6) - used for a reservation's `public_static_ip`. */
export function isValidIpLiteral(value: string): boolean {
	if (isValidIpv4(value)) return true;
	// Loose IPv6 check - the backend is authoritative; this only catches
	// obviously-malformed input before a round trip.
	return /^[0-9a-f:]+$/i.test(value) && value.includes(':');
}

const DOMAIN_MAX_LEN = 253;
const HOSTNAME_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

/**
 * A content-filter domain (phase-6.0-revamp.md § 7 WP7, family 10). Mirrors
 * `backend/app/routes/networks.py` `_validate_domain`: a bare hostname, no
 * scheme or path, at most 253 characters (DNS wire-format ceiling), not an
 * IP address literal. Does not attempt IDNA/punycode conversion client-side
 * - the backend re-validates and normalizes authoritatively.
 */
export function isValidContentFilterDomain(value: string): boolean {
	const candidate = value.trim().toLowerCase();
	if (!candidate || candidate.includes('://') || candidate.includes('/')) return false;
	if (candidate.length > DOMAIN_MAX_LEN) return false;
	if (isValidIpv4(candidate) || isValidIpLiteral(candidate)) return false;
	return HOSTNAME_RE.test(candidate);
}
