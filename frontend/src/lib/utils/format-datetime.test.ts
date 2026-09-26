import { describe, it, expect } from 'vitest';
import { formatRelativeTime, formatShortDateTime } from './format-datetime';

describe('formatRelativeTime', () => {
	const now = Date.parse('2026-09-25T12:00:00Z');

	it('formats seconds in the past', () => {
		const value = new Date(now - 30_000).toISOString();
		expect(formatRelativeTime(value, now)).toBe('30 seconds ago');
	});

	it('formats minutes in the past', () => {
		const value = new Date(now - 5 * 60_000).toISOString();
		expect(formatRelativeTime(value, now)).toBe('5 minutes ago');
	});

	it('formats hours in the future', () => {
		const value = new Date(now + 2 * 60 * 60_000).toISOString();
		expect(formatRelativeTime(value, now)).toBe('in 2 hours');
	});

	it('returns null for unparseable input', () => {
		expect(formatRelativeTime('not-a-date', now)).toBeNull();
	});

	it('returns null for null/undefined', () => {
		expect(formatRelativeTime(null, now)).toBeNull();
		expect(formatRelativeTime(undefined, now)).toBeNull();
	});
});

describe('formatShortDateTime', () => {
	it('formats a valid timestamp as a short date + time on one line', () => {
		const result = formatShortDateTime('2026-09-25T11:45:38.000Z');
		// Exact rendering is locale/timezone-dependent, but must contain a
		// short month/day and a time, on a single comma-joined line.
		expect(result).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{1,2}:\d{2}\s?[AP]M$/);
	});

	it('returns an em dash for unparseable input', () => {
		expect(formatShortDateTime('not-a-date')).toBe('—');
	});

	it('returns an em dash for null/undefined', () => {
		expect(formatShortDateTime(null)).toBe('—');
		expect(formatShortDateTime(undefined)).toBe('—');
	});
});
