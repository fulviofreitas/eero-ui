import { describe, it, expect } from 'vitest';
import { deriveTimeSeries, labelOf, downloadOf, uploadOf } from './data-usage';

describe('deriveTimeSeries', () => {
	it('returns null when no entry carries a usable timestamp+value shape', () => {
		expect(deriveTimeSeries([{ foo: 'bar' }])).toBeNull();
		expect(deriveTimeSeries([])).toBeNull();
	});

	it('derives download/upload points from time+download/upload keys', () => {
		const result = deriveTimeSeries([
			{ time: '2026-01-01T00:00:00Z', download: 100, upload: 10 },
			{ time: '2026-01-02T00:00:00Z', download: 200, upload: 20 }
		]);

		expect(result).not.toBeNull();
		expect(result!.download).toEqual([
			{ x: Date.parse('2026-01-01T00:00:00Z'), y: 100 },
			{ x: Date.parse('2026-01-02T00:00:00Z'), y: 200 }
		]);
		expect(result!.upload).toEqual([
			{ x: Date.parse('2026-01-01T00:00:00Z'), y: 10 },
			{ x: Date.parse('2026-01-02T00:00:00Z'), y: 20 }
		]);
	});

	it('sorts points chronologically regardless of input order', () => {
		const result = deriveTimeSeries([
			{ timestamp: '2026-01-02T00:00:00Z', down: 2 },
			{ timestamp: '2026-01-01T00:00:00Z', down: 1 }
		]);

		expect(result!.download.map((p) => p.y)).toEqual([1, 2]);
	});

	it('reads download/upload from a nested usage/data sub-object', () => {
		const result = deriveTimeSeries([
			{ time: '2026-01-01T00:00:00Z', usage: { download: 50, upload: 5 } }
		]);

		expect(result!.download).toEqual([{ x: Date.parse('2026-01-01T00:00:00Z'), y: 50 }]);
	});
});

describe('labelOf', () => {
	it('prefers nickname, then falls back through hostname/mac/id', () => {
		expect(labelOf({ nickname: 'iPhone', mac: 'AA:BB' })).toBe('iPhone');
		expect(labelOf({ mac: 'AA:BB' })).toBe('AA:BB');
		expect(labelOf({})).toBe('Unknown');
	});
});

describe('downloadOf/uploadOf', () => {
	it('extracts numeric values from the known key spellings', () => {
		expect(downloadOf({ download_bytes: 42 })).toBe(42);
		expect(uploadOf({ up: 7 })).toBe(7);
		expect(downloadOf({})).toBeNull();
	});
});
