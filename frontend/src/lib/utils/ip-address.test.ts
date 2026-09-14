/**
 * Tests for IP address normalisation and comparison helpers.
 */

import { describe, it, expect } from 'vitest';
import { isValidIpv4, isValidIpv6, normalizeIpv4, normalizeIpv6, serversEqual } from './ip-address';

describe('normalizeIpv4', () => {
	it('accepts a valid dotted-quad address', () => {
		expect(normalizeIpv4('1.1.1.1')).toBe('1.1.1.1');
	});

	it('trims whitespace', () => {
		expect(normalizeIpv4('  1.1.1.1  ')).toBe('1.1.1.1');
	});

	it('rejects wrong octet count', () => {
		expect(normalizeIpv4('1.1.1')).toBeNull();
		expect(normalizeIpv4('1.1.1.1.1')).toBeNull();
	});

	it('rejects out-of-range octets', () => {
		expect(normalizeIpv4('1.1.1.256')).toBeNull();
	});

	it('rejects non-numeric octets', () => {
		expect(normalizeIpv4('1.1.1.abc')).toBeNull();
	});

	it('rejects leading zeros', () => {
		expect(normalizeIpv4('1.1.1.01')).toBeNull();
	});
});

describe('normalizeIpv6', () => {
	it('expands a compressed address', () => {
		expect(normalizeIpv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
	});

	it('is a no-op (modulo case/padding) on an already-expanded address', () => {
		expect(normalizeIpv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(
			'2001:0db8:0000:0000:0000:0000:0000:0001'
		);
	});

	it('is case-insensitive', () => {
		expect(normalizeIpv6('2001:DB8::1')).toBe(normalizeIpv6('2001:db8::1'));
	});

	it('normalizes the all-zero address', () => {
		expect(normalizeIpv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
	});

	it('normalizes loopback', () => {
		expect(normalizeIpv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
	});

	it('handles a well-known compressed provider address', () => {
		expect(normalizeIpv6('2606:4700:4700::1111')).toBe('2606:4700:4700:0000:0000:0000:0000:1111');
	});

	it('rejects an address with more than one "::"', () => {
		expect(normalizeIpv6('2001::db8::1')).toBeNull();
	});

	it('rejects invalid hextets', () => {
		expect(normalizeIpv6('2001:zzzz::1')).toBeNull();
	});

	it('rejects a fully-specified address with too few groups', () => {
		expect(normalizeIpv6('1:2:3:4:5:6:7')).toBeNull();
	});

	it('rejects an empty string', () => {
		expect(normalizeIpv6('')).toBeNull();
	});
});

describe('isValidIpv4 / isValidIpv6', () => {
	it('flags valid vs invalid literals per family', () => {
		expect(isValidIpv4('1.1.1.1')).toBe(true);
		expect(isValidIpv4('2001:db8::1')).toBe(false);
		expect(isValidIpv6('2001:db8::1')).toBe(true);
		expect(isValidIpv6('1.1.1.1')).toBe(false);
	});
});

describe('serversEqual', () => {
	it('treats compressed and expanded IPv6 as equal (headline case)', () => {
		const loaded = ['2001:0db8:0000:0000:0000:0000:0000:0001', ''];
		const form = ['2001:db8::1', ''];
		expect(serversEqual(loaded, form, 'ipv6')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(serversEqual(['2001:DB8::1'], ['2001:db8::1'], 'ipv6')).toBe(true);
	});

	it('treats two blank slots as equal', () => {
		expect(serversEqual(['', ''], ['', ''], 'ipv4')).toBe(true);
	});

	it('detects reordering of primary/secondary as a change', () => {
		const a = ['1.1.1.1', '1.0.0.1'];
		const b = ['1.0.0.1', '1.1.1.1'];
		expect(serversEqual(a, b, 'ipv4')).toBe(false);
	});

	it('detects an actual address change', () => {
		expect(serversEqual(['1.1.1.1'], ['8.8.8.8'], 'ipv4')).toBe(false);
	});

	it('treats unparseable entries as not equal', () => {
		expect(serversEqual(['not-an-ip'], ['not-an-ip'], 'ipv4')).toBe(false);
	});

	it('requires equal-length lists', () => {
		expect(serversEqual(['1.1.1.1'], ['1.1.1.1', '1.0.0.1'], 'ipv4')).toBe(false);
	});
});
