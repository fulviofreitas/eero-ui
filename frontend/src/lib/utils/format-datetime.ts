/**
 * Compact date/time formatting helpers shared by cards that render timestamps in narrow
 * table columns or as short "checked ..." captions (BackupInternetCard, SpeedTestHistoryCard,
 * EventsCard bug-fix follow-up, 2026-09-25 - maintainer screenshot showed a full
 * `toLocaleString()` timestamp clipped mid-date in a table column).
 */

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 60 * 60 * 1000],
	['month', 30 * 24 * 60 * 60 * 1000],
	['day', 24 * 60 * 60 * 1000],
	['hour', 60 * 60 * 1000],
	['minute', 60 * 1000],
	['second', 1000]
];

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Parses `value`; returns `null` for anything unparseable rather than an "Invalid Date". */
function parse(value: string | null | undefined): Date | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * "3 minutes ago" / "in 2 hours" style relative time. Returns `null` when `value` cannot be
 * parsed - callers should fall back to omitting the caption entirely rather than showing
 * "checked Invalid Date".
 */
export function formatRelativeTime(
	value: string | null | undefined,
	now: number = Date.now()
): string | null {
	const date = parse(value);
	if (!date) return null;

	const diffMs = date.getTime() - now;
	const absMs = Math.abs(diffMs);

	for (const [unit, unitMs] of RELATIVE_UNITS) {
		if (unit === 'second' || absMs >= unitMs) {
			return relativeFormatter.format(Math.round(diffMs / unitMs), unit);
		}
	}
	return relativeFormatter.format(0, 'second');
}

/** Short one-line date + time (e.g. "Sep 25, 11:45 AM"). Renders as "—" when unparseable. */
export function formatShortDateTime(value: string | null | undefined): string {
	const date = parse(value);
	if (!date) return '—';
	const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	return `${datePart}, ${timePart}`;
}
