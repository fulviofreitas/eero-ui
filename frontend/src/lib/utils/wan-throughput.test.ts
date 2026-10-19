import { describe, it, expect } from 'vitest';
import { formatMbps, isBridgeMode, wanWindow } from './wan-throughput';

describe('formatMbps', () => {
	it('renders unknown values as a dash', () => {
		expect(formatMbps(null)).toBe('—');
		expect(formatMbps(undefined)).toBe('—');
		expect(formatMbps(NaN)).toBe('—');
		expect(formatMbps(Infinity)).toBe('—');
	});

	it('uses one decimal below 100, none from 100, Gbps from 1000', () => {
		expect(formatMbps(0)).toBe('0.0 Mbps');
		expect(formatMbps(12.34)).toBe('12.3 Mbps');
		expect(formatMbps(412.3)).toBe('412 Mbps');
		expect(formatMbps(1500)).toBe('1.50 Gbps');
	});
});

describe('wanWindow', () => {
	const now = 1_800_000_000_000;
	const end = 1_800_000_000;

	it.each([
		['1h', 3600, '1m'],
		['6h', 21600, '5m'],
		['24h', 86400, '15m'],
		['7d', 604800, '1h']
	] as const)('%s window', (range, seconds, step) => {
		expect(wanWindow(range, now)).toEqual({
			start: String(end - seconds),
			end: String(end),
			step
		});
	});
});

describe('isBridgeMode', () => {
	it('matches bridge case-insensitively', () => {
		expect(isBridgeMode('BRIDGE')).toBe(true);
		expect(isBridgeMode('bridge')).toBe(true);
	});

	it('is false for other modes and null', () => {
		expect(isBridgeMode('NAT')).toBe(false);
		expect(isBridgeMode(null)).toBe(false);
		expect(isBridgeMode(undefined)).toBe(false);
	});
});
