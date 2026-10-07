/**
 * Tests for the manual DHCP lease-range form helpers (mirrors the backend's
 * own validation - backend/app/routes/networks.py::_validate_dhcp_custom_range).
 */

import { describe, it, expect } from 'vitest';
import {
	dhcpCustomLeaseIsValid,
	validateDhcpCustomLease,
	dhcpModeFromApi,
	rfc1918PrefixFor,
	dhcpFormFromApi,
	dhcpFormIsDirty,
	buildDhcpWrites,
	type DhcpApiState,
	type DhcpFormState
} from './dhcp-form';

const VALID = {
	startIp: '192.168.1.10',
	endIp: '192.168.1.50',
	subnetIp: '192.168.1.0',
	subnetMask: '255.255.255.0'
};

describe('validateDhcpCustomLease', () => {
	it('accepts a valid RFC1918 /24 range', () => {
		expect(dhcpCustomLeaseIsValid(VALID)).toBe(true);
	});

	it('rejects a non-IPv4 value', () => {
		const errors = validateDhcpCustomLease({ ...VALID, startIp: '2606:4700::1' });
		expect(errors.startIp).toBeTruthy();
	});

	it('rejects a non-RFC1918 subnet', () => {
		const errors = validateDhcpCustomLease({
			startIp: '8.8.8.10',
			endIp: '8.8.8.50',
			subnetIp: '8.8.8.0',
			subnetMask: '255.255.255.0'
		});
		expect(errors.subnetIp).toBeTruthy();
	});

	it('rejects a prefix outside /16-/30', () => {
		const errors = validateDhcpCustomLease({ ...VALID, subnetMask: '255.0.0.0' });
		expect(errors.subnetMask).toBeTruthy();
	});

	it('rejects start_ip > end_ip', () => {
		const errors = validateDhcpCustomLease({ ...VALID, startIp: '192.168.1.60' });
		expect(errors.startIp).toBeTruthy();
	});

	it('rejects a range that includes the subnet router address', () => {
		const errors = validateDhcpCustomLease({ ...VALID, startIp: '192.168.1.1' });
		expect(errors.startIp).toBeTruthy();
	});

	it('rejects a range outside the usable host range', () => {
		const errors = validateDhcpCustomLease({ ...VALID, endIp: '192.168.1.255' });
		expect(errors.endIp).toBeTruthy();
	});
});

describe('dhcpModeFromApi', () => {
	it('returns automatic when connection mode is NAT and dhcp mode is automatic', () => {
		expect(dhcpModeFromApi('NAT', 'automatic')).toBe('automatic');
	});

	it('returns manual for a "custom" dhcp mode (the real API spelling)', () => {
		expect(dhcpModeFromApi('nat', 'custom')).toBe('manual');
	});

	it('returns manual for a "manual" dhcp mode spelling', () => {
		expect(dhcpModeFromApi('NAT', 'manual')).toBe('manual');
	});

	it('returns bridge when connection mode is BRIDGE regardless of dhcp mode', () => {
		expect(dhcpModeFromApi('BRIDGE', 'custom')).toBe('bridge');
	});

	it('is case-insensitive on connection mode', () => {
		expect(dhcpModeFromApi('bridge', null)).toBe('bridge');
	});

	it('defaults to automatic when connection mode is null/missing', () => {
		expect(dhcpModeFromApi(null, undefined)).toBe('automatic');
	});
});

describe('rfc1918PrefixFor', () => {
	it('derives 10.0.0.0/8 for a 10.x address', () => {
		expect(rfc1918PrefixFor('10.0.4.20')).toBe('10.0.0.0/8');
	});

	it('derives 172.16.0.0/12 for a 172.16-31.x address', () => {
		expect(rfc1918PrefixFor('172.20.5.1')).toBe('172.16.0.0/12');
	});

	it('derives 192.168.0.0/16 for a 192.168.x address', () => {
		expect(rfc1918PrefixFor('192.168.1.5')).toBe('192.168.0.0/16');
	});

	it('returns null for a non-RFC1918 address', () => {
		expect(rfc1918PrefixFor('8.8.8.8')).toBeNull();
	});

	it('returns null for an invalid address', () => {
		expect(rfc1918PrefixFor('010.0.4.20')).toBeNull();
	});

	it('returns null for a missing address', () => {
		expect(rfc1918PrefixFor(null)).toBeNull();
	});
});

const API_MANUAL: DhcpApiState = {
	connectionMode: 'NAT',
	dhcp: {
		mode: 'custom',
		subnet_ip: '10.0.4.0',
		subnet_mask: '255.255.252.0',
		starting_address: '10.0.4.20',
		ending_address: '10.0.5.254',
		lease_time_seconds: 86400
	}
};

const API_AUTOMATIC: DhcpApiState = {
	connectionMode: 'NAT',
	dhcp: { mode: 'automatic' }
};

const API_BRIDGE: DhcpApiState = {
	connectionMode: 'BRIDGE',
	dhcp: { mode: 'automatic' }
};

describe('dhcpFormFromApi', () => {
	it('initialises to Manual IP with the lease fields pre-filled for a "custom" API mode', () => {
		const form = dhcpFormFromApi(API_MANUAL);
		expect(form.mode).toBe('manual');
		expect(form.manual).toEqual({
			subnetIp: '10.0.4.0',
			subnetMask: '255.255.252.0',
			startIp: '10.0.4.20',
			endIp: '10.0.5.254'
		});
		expect(form.bridgeAcknowledged).toBe(false);
	});

	it('initialises to Automatic for an automatic API mode', () => {
		expect(dhcpFormFromApi(API_AUTOMATIC).mode).toBe('automatic');
	});

	it('initialises to Bridge when connection mode is BRIDGE', () => {
		expect(dhcpFormFromApi(API_BRIDGE).mode).toBe('bridge');
	});
});

describe('dhcpFormIsDirty', () => {
	it('is false for an unmodified form seeded from the API', () => {
		const form = dhcpFormFromApi(API_MANUAL);
		expect(dhcpFormIsDirty(form, API_MANUAL)).toBe(false);
	});

	it('treats equivalent IP spellings (trimmed) as not dirty', () => {
		const form = dhcpFormFromApi(API_MANUAL);
		form.manual.startIp = '10.0.4.20 ';
		expect(dhcpFormIsDirty(form, API_MANUAL)).toBe(false);
	});

	it('treats an invalid spelling as dirty against a valid API value', () => {
		const form = dhcpFormFromApi(API_MANUAL);
		form.manual.startIp = '010.0.4.20';
		expect(dhcpFormIsDirty(form, API_MANUAL)).toBe(true);
	});

	it('is dirty when the mode changes from manual to automatic', () => {
		const form: DhcpFormState = { ...dhcpFormFromApi(API_MANUAL), mode: 'automatic' };
		expect(dhcpFormIsDirty(form, API_MANUAL)).toBe(true);
	});

	it('is dirty when the mode changes from automatic to bridge', () => {
		const form: DhcpFormState = { ...dhcpFormFromApi(API_AUTOMATIC), mode: 'bridge' };
		expect(dhcpFormIsDirty(form, API_AUTOMATIC)).toBe(true);
	});

	it('is false for an unmodified Bridge form', () => {
		expect(dhcpFormIsDirty(dhcpFormFromApi(API_BRIDGE), API_BRIDGE)).toBe(false);
	});
});

describe('buildDhcpWrites', () => {
	it('Automatic -> Manual IP issues exactly one dhcp write with mode manual', () => {
		const form: DhcpFormState = {
			mode: 'manual',
			manual: {
				subnetIp: '10.0.4.0',
				subnetMask: '255.255.252.0',
				startIp: '10.0.4.20',
				endIp: '10.0.5.254'
			},
			bridgeAcknowledged: false
		};
		const plan = buildDhcpWrites(form, API_AUTOMATIC);
		expect(plan.connectionMode).toBeUndefined();
		expect(plan.dhcp).toEqual({
			mode: 'manual',
			custom: {
				start_ip: '10.0.4.20',
				end_ip: '10.0.5.254',
				subnet_ip: '10.0.4.0',
				subnet_mask: '255.255.252.0'
			}
		});
	});

	it('Manual IP -> Automatic issues exactly one dhcp write with mode automatic', () => {
		const form: DhcpFormState = { ...dhcpFormFromApi(API_MANUAL), mode: 'automatic' };
		const plan = buildDhcpWrites(form, API_MANUAL);
		expect(plan.connectionMode).toBeUndefined();
		expect(plan.dhcp).toEqual({ mode: 'automatic' });
	});

	it('a modified manual range issues exactly one dhcp write', () => {
		const form = dhcpFormFromApi(API_MANUAL);
		form.manual.endIp = '10.0.6.254';
		const plan = buildDhcpWrites(form, API_MANUAL);
		expect(plan.connectionMode).toBeUndefined();
		expect(plan.dhcp).toEqual({
			mode: 'manual',
			custom: {
				start_ip: '10.0.4.20',
				end_ip: '10.0.6.254',
				subnet_ip: '10.0.4.0',
				subnet_mask: '255.255.252.0'
			}
		});
	});

	it('Automatic/Manual -> Bridge issues exactly one connection-mode write', () => {
		const form: DhcpFormState = {
			mode: 'bridge',
			manual: { subnetIp: '', subnetMask: '', startIp: '', endIp: '' },
			bridgeAcknowledged: true
		};
		const plan = buildDhcpWrites(form, API_AUTOMATIC);
		expect(plan.connectionMode).toEqual({ mode: 'BRIDGE', acknowledge_disables_routing: true });
		expect(plan.dhcp).toBeUndefined();
	});

	it('Bridge -> Automatic issues a connection-mode write and no dhcp write when DHCP already matches', () => {
		const form: DhcpFormState = { ...dhcpFormFromApi(API_BRIDGE), mode: 'automatic' };
		const plan = buildDhcpWrites(form, API_BRIDGE);
		expect(plan.connectionMode).toEqual({ mode: 'NAT' });
		expect(plan.dhcp).toBeUndefined();
	});

	it('Bridge -> Manual IP issues both a connection-mode write and a dhcp write', () => {
		const form: DhcpFormState = {
			mode: 'manual',
			manual: {
				subnetIp: '10.0.4.0',
				subnetMask: '255.255.252.0',
				startIp: '10.0.4.20',
				endIp: '10.0.5.254'
			},
			bridgeAcknowledged: false
		};
		const plan = buildDhcpWrites(form, API_BRIDGE);
		expect(plan.connectionMode).toEqual({ mode: 'NAT' });
		expect(plan.dhcp).toEqual({
			mode: 'manual',
			custom: {
				start_ip: '10.0.4.20',
				end_ip: '10.0.5.254',
				subnet_ip: '10.0.4.0',
				subnet_mask: '255.255.252.0'
			}
		});
	});

	it('an unmodified form (same tri-state and fields) produces an empty write plan', () => {
		const plan = buildDhcpWrites(dhcpFormFromApi(API_MANUAL), API_MANUAL);
		expect(plan).toEqual({});
	});
});
