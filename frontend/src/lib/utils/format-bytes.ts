/**
 * Human-readable byte formatting for data-usage cards (phase-6.0-revamp.md
 * § 7 WP6, deliverable 7). `null`/`undefined`/negative/non-finite inputs
 * render as an em dash rather than `NaN` or `-1 B` - a data-usage total that
 * the backend could not populate is a legitimate, common case (the upstream
 * shape is not guaranteed), not a bug to hide.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
		return '—';
	}
	if (bytes === 0) return '0 B';

	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
	const value = bytes / Math.pow(1024, exponent);
	return `${value.toFixed(exponent === 0 ? 0 : decimals)} ${UNITS[exponent]}`;
}
