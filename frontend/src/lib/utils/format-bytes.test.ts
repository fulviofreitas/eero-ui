import { describe, it, expect } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
	it('renders null/undefined as an em dash', () => {
		expect(formatBytes(null)).toBe('—');
		expect(formatBytes(undefined)).toBe('—');
	});

	it('renders negative or non-finite values as an em dash', () => {
		expect(formatBytes(-1)).toBe('—');
		expect(formatBytes(NaN)).toBe('—');
		expect(formatBytes(Infinity)).toBe('—');
	});

	it('renders 0 bytes explicitly', () => {
		expect(formatBytes(0)).toBe('0 B');
	});

	it('scales through units', () => {
		expect(formatBytes(500)).toBe('500 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(1073741824)).toBe('1.0 GB');
	});
});
