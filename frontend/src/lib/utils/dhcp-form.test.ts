/**
 * Tests for the manual DHCP lease-range form helpers (mirrors the backend's
 * own validation - backend/app/routes/networks.py::_validate_dhcp_custom_range).
 */

import { describe, it, expect } from 'vitest';
import { dhcpCustomLeaseIsValid, validateDhcpCustomLease } from './dhcp-form';

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
