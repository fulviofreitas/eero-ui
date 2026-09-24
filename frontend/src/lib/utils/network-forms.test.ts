/**
 * Tests for the Forwards & Reservations client-side validation helpers
 * (phase-6.0-revamp.md § 7 WP7, family 8).
 */

import { describe, it, expect } from 'vitest';
import { isPrivateIpv4, isValidIpLiteral, isValidMac, isValidPort } from './network-forms';

describe('isValidPort', () => {
	it('accepts integers in 1-65535', () => {
		expect(isValidPort(1)).toBe(true);
		expect(isValidPort(80)).toBe(true);
		expect(isValidPort(65535)).toBe(true);
	});

	it('rejects out-of-range or non-integer values', () => {
		expect(isValidPort(0)).toBe(false);
		expect(isValidPort(65536)).toBe(false);
		expect(isValidPort(-1)).toBe(false);
		expect(isValidPort(8080.5)).toBe(false);
		expect(isValidPort(NaN)).toBe(false);
	});
});

describe('isPrivateIpv4', () => {
	it('accepts RFC 1918 private ranges', () => {
		expect(isPrivateIpv4('10.0.0.1')).toBe(true);
		expect(isPrivateIpv4('172.16.0.1')).toBe(true);
		expect(isPrivateIpv4('172.31.255.255')).toBe(true);
		expect(isPrivateIpv4('192.168.1.100')).toBe(true);
	});

	it('rejects public addresses', () => {
		expect(isPrivateIpv4('8.8.8.8')).toBe(false);
		expect(isPrivateIpv4('172.32.0.1')).toBe(false);
		expect(isPrivateIpv4('1.1.1.1')).toBe(false);
	});

	it('rejects malformed input', () => {
		expect(isPrivateIpv4('not-an-ip')).toBe(false);
		expect(isPrivateIpv4('192.168.1')).toBe(false);
		expect(isPrivateIpv4('')).toBe(false);
	});
});

describe('isValidMac', () => {
	it('accepts a lowercase colon-separated MAC', () => {
		expect(isValidMac('aa:bb:cc:dd:ee:ff')).toBe(true);
	});

	it('rejects uppercase, dashes, or malformed input', () => {
		expect(isValidMac('AA:BB:CC:DD:EE:FF')).toBe(false);
		expect(isValidMac('aa-bb-cc-dd-ee-ff')).toBe(false);
		expect(isValidMac('aa:bb:cc:dd:ee')).toBe(false);
		expect(isValidMac('')).toBe(false);
	});
});

describe('isValidIpLiteral', () => {
	it('accepts a valid IPv4 literal', () => {
		expect(isValidIpLiteral('203.0.113.5')).toBe(true);
	});

	it('accepts a loosely-shaped IPv6 literal', () => {
		expect(isValidIpLiteral('2001:db8::1')).toBe(true);
	});

	it('rejects malformed input', () => {
		expect(isValidIpLiteral('not-an-ip')).toBe(false);
		expect(isValidIpLiteral('')).toBe(false);
	});
});
