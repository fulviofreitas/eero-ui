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
		if (!/^\d{1,3}$/.test(part)) return null;
		const n = Number(part);
		if (n < 0 || n > 255) return null;
		result = result * 256 + n;
	}
	return result;
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
	const maskFor = (bits: number) => (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0);
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
