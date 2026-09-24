/**
 * Defensive helpers for rendering `DataUsageResponse.values` (phase-6.0-revamp.md
 * § 7 WP6, deliverable 7). The upstream shape is undocumented beyond the
 * `download`/`upload` key spellings the backend already normalizes at the
 * top level - each `values` entry may or may not carry a comparable
 * time/download/upload shape of its own, so every accessor here returns
 * `null` rather than guessing, and callers fall back to a `GenericRecordList`
 * when a usable time series cannot be derived.
 */

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'number' && Number.isFinite(value)) return value;
	}
	// One level of nesting - some entries wrap download/upload under a
	// `usage`/`data` sub-object.
	for (const nestKey of ['usage', 'data']) {
		const nested = record[nestKey];
		if (nested && typeof nested === 'object') {
			const found = pickNumber(nested as Record<string, unknown>, keys);
			if (found !== null) return found;
		}
	}
	return null;
}

function pickTimestamp(record: Record<string, unknown>): number | null {
	for (const key of ['time', 'timestamp', 'date']) {
		const value = record[key];
		if (typeof value === 'string') {
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed)) return parsed;
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			// Heuristic: seconds vs. milliseconds since epoch.
			return value < 1e12 ? value * 1000 : value;
		}
	}
	return null;
}

export interface DataUsagePoint {
	x: number;
	y: number;
}

export interface DataUsageTimeSeries {
	download: DataUsagePoint[];
	upload: DataUsagePoint[];
}

const DOWNLOAD_KEYS = ['download', 'down', 'download_bytes', 'rx', 'rx_bytes'];
const UPLOAD_KEYS = ['upload', 'up', 'upload_bytes', 'tx', 'tx_bytes'];

/**
 * Derive a chartable time series from `values`, or `null` if no entry
 * carries both a timestamp and at least one of download/upload.
 */
export function deriveTimeSeries(values: Record<string, unknown>[]): DataUsageTimeSeries | null {
	const download: DataUsagePoint[] = [];
	const upload: DataUsagePoint[] = [];
	let usable = false;

	for (const entry of values) {
		const x = pickTimestamp(entry);
		if (x === null) continue;
		const down = pickNumber(entry, DOWNLOAD_KEYS);
		const up = pickNumber(entry, UPLOAD_KEYS);
		if (down === null && up === null) continue;
		usable = true;
		if (down !== null) download.push({ x, y: down });
		if (up !== null) upload.push({ x, y: up });
	}

	if (!usable) return null;
	download.sort((a, b) => a.x - b.x);
	upload.sort((a, b) => a.x - b.x);
	return { download, upload };
}

/** Best-effort label for a per-device usage row: nickname/hostname/mac/id, in that order. */
export function labelOf(record: Record<string, unknown>): string {
	for (const key of ['nickname', 'display_name', 'hostname', 'name', 'mac', 'id', 'device_id']) {
		const value = record[key];
		if (typeof value === 'string' && value) return value;
	}
	return 'Unknown';
}

export function downloadOf(record: Record<string, unknown>): number | null {
	return pickNumber(record, DOWNLOAD_KEYS);
}

export function uploadOf(record: Record<string, unknown>): number | null {
	return pickNumber(record, UPLOAD_KEYS);
}
