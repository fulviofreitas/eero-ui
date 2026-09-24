import { describe, it, expect } from 'vitest';
import {
	getMeshQualityBars,
	formatUptime,
	formatPercentage,
	formatTemperature,
	formatBand,
	getUniqueBands,
	formatPortSpeed
} from './eero-format';

describe('eero-format', () => {
	it('getMeshQualityBars renders filled/empty bars out of 5', () => {
		expect(getMeshQualityBars(null)).toBe('━━━━━');
		expect(getMeshQualityBars(3)).toBe('███░░');
		expect(getMeshQualityBars(5)).toBe('█████');
	});

	it('formatUptime picks the coarsest useful unit', () => {
		expect(formatUptime(null)).toBe('—');
		expect(formatUptime(90061)).toBe('1d 1h');
		expect(formatUptime(3660)).toBe('1h 1m');
		expect(formatUptime(120)).toBe('2m');
	});

	it('formatPercentage renders one decimal with a % suffix', () => {
		expect(formatPercentage(null)).toBe('—');
		expect(formatPercentage(42.567)).toBe('42.6%');
	});

	it('formatTemperature renders both C and F', () => {
		expect(formatTemperature(null)).toBe('—');
		expect(formatTemperature(20)).toBe('20.0°C / 68.0°F');
	});

	it('formatBand maps known band identifiers to readable labels', () => {
		expect(formatBand('band_5GHz')).toBe('5 GHz');
		expect(formatBand('band_6GHz')).toBe('6 GHz');
	});

	it('getUniqueBands dedupes and orders by frequency', () => {
		expect(getUniqueBands(['band_5GHz', 'band_2_4GHz', 'band_5GHz'])).toEqual(['2.4 GHz', '5 GHz']);
		expect(getUniqueBands(null)).toEqual([]);
	});

	it('formatPortSpeed converts P-prefixed codes to Gbps/Mbps', () => {
		expect(formatPortSpeed('P10000')).toBe('10 Gbps');
		expect(formatPortSpeed('P100')).toBe('100 Mbps');
		expect(formatPortSpeed(null)).toBe('');
	});
});
