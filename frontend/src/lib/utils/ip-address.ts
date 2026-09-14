/**
 * IP address normalisation and comparison helpers.
 *
 * Used to diff the DNS settings form against the network's persisted DNS
 * settings. The backend normalises IPv6 addresses to compressed form on
 * read, but the same address can still be written in many equivalent
 * textual forms (different case, different compression, zero-padded
 * groups, etc). Comparing raw strings would produce false "dirty" results
 * and, for DNS settings specifically, that means rebooting the entire mesh
 * for nothing. Both sides of every comparison are normalised to a
 * canonical, fully expanded, lowercase form first.
 *
 * Intentionally has no external dependency - it only needs to support the
 * inputs the DNS settings form can produce: IPv4 dotted-quad, and IPv6 with
 * at most one "::" compression (optionally with an embedded IPv4 tail).
 */

export type IpFamily = 'ipv4' | 'ipv6';

const IPV4_OCTET = /^\d{1,3}$/;

/**
 * Normalise an IPv4 address to a canonical dotted-quad form (no leading
 * zeros). Returns null if the input is not a valid IPv4 literal.
 */
export function normalizeIpv4(address: string): string | null {
	const trimmed = address.trim();
	const parts = trimmed.split('.');
	if (parts.length !== 4) return null;

	const octets: number[] = [];
	for (const part of parts) {
		if (!IPV4_OCTET.test(part)) return null;
		if (part.length > 1 && part.startsWith('0')) return null; // no "01", ambiguous/non-canonical
		const value = Number(part);
		if (value < 0 || value > 255) return null;
		octets.push(value);
	}

	return octets.join('.');
}

export function isValidIpv4(address: string): boolean {
	return normalizeIpv4(address) !== null;
}

function ipv4ToHextets(ipv4: string): string {
	const [a, b, c, d] = ipv4.split('.').map(Number);
	const first = ((a << 8) | b).toString(16);
	const second = ((c << 8) | d).toString(16);
	return `${first}:${second}`;
}

/**
 * Expand an IPv6 address to its canonical 8-group, lowercase, zero-padded
 * form for comparison, e.g. "2001:db8::1" ->
 * "2001:0db8:0000:0000:0000:0000:0000:0001". Returns null if the input is
 * not a valid IPv6 literal.
 */
export function normalizeIpv6(address: string): string | null {
	let input = address.trim().toLowerCase();
	if (input === '') return null;

	// Strip an optional zone index (e.g. "fe80::1%eth0").
	const zoneIndex = input.indexOf('%');
	if (zoneIndex !== -1) {
		input = input.slice(0, zoneIndex);
	}

	// Rewrite an embedded IPv4 tail (e.g. "::ffff:192.168.1.1") as hextets.
	const lastColon = input.lastIndexOf(':');
	if (lastColon !== -1 && input.slice(lastColon + 1).includes('.')) {
		const normalizedTail = normalizeIpv4(input.slice(lastColon + 1));
		if (normalizedTail === null) return null;
		input = input.slice(0, lastColon + 1) + ipv4ToHextets(normalizedTail);
	}

	const doubleColonCount = (input.match(/::/g) || []).length;
	if (doubleColonCount > 1) return null;

	let head: string[];
	let tail: string[];

	if (input.includes('::')) {
		const [left, right] = input.split('::');
		head = left === '' ? [] : left.split(':');
		tail = right === '' ? [] : right.split(':');
	} else {
		head = input === '' ? [] : input.split(':');
		tail = [];
	}

	const allGroups = [...head, ...tail];
	// An empty group list is only valid for the all-zero "::" shorthand; a
	// plain empty string (or a lone, non-compressing ":") has already been
	// rejected above / falls through to the malformed-group check below.
	if (allGroups.length === 0 && !input.includes('::')) return null;
	if (allGroups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;

	let expandedGroups: string[];
	if (input.includes('::')) {
		const missing = 8 - (head.length + tail.length);
		if (missing < 0) return null;
		expandedGroups = [...head, ...Array(missing).fill('0'), ...tail];
	} else {
		if (head.length !== 8) return null;
		expandedGroups = head;
	}

	if (expandedGroups.length !== 8) return null;

	return expandedGroups.map((g) => g.padStart(4, '0')).join(':');
}

export function isValidIpv6(address: string): boolean {
	return normalizeIpv6(address) !== null;
}

export function normalizeAddress(address: string, family: IpFamily): string | null {
	return family === 'ipv4' ? normalizeIpv4(address) : normalizeIpv6(address);
}

export function isValidAddress(address: string, family: IpFamily): boolean {
	return normalizeAddress(address, family) !== null;
}

/**
 * Order-sensitive comparison of two DNS server lists. Order matters here -
 * swapping primary/secondary changes resolution priority, so it counts as a
 * change even though the set of addresses is identical. Two blank entries
 * at the same position are considered equal (an unset secondary server);
 * anything else that fails to parse is treated as "not equal" so the caller
 * doesn't silently mask an invalid value as clean.
 */
export function serversEqual(a: string[], b: string[], family: IpFamily): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		const left = a[i].trim();
		const right = b[i].trim();

		if (left === '' && right === '') continue;

		const normalizedLeft = normalizeAddress(left, family);
		const normalizedRight = normalizeAddress(right, family);

		if (normalizedLeft === null || normalizedRight === null) return false;
		if (normalizedLeft !== normalizedRight) return false;
	}

	return true;
}
