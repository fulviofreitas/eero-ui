/**
 * WAN throughput helpers (eero-ui#458).
 */

import type { WanThroughputRange } from '#lib/api/types.js';

const RANGE_SPECS: Record<WanThroughputRange, { seconds: number; step: string }> = {
	'1h': { seconds: 3600, step: '1m' },
	'6h': { seconds: 6 * 3600, step: '5m' },
	'24h': { seconds: 24 * 3600, step: '15m' },
	'7d': { seconds: 7 * 24 * 3600, step: '1h' }
};

/** Query window for a range: Unix-second `start`/`end` strings plus the matching `step`. */
export function wanWindow(
	range: WanThroughputRange,
	now: number = Date.now()
): { start: string; end: string; step: string } {
	const { seconds, step } = RANGE_SPECS[range];
	const end = Math.floor(now / 1000);
	return { start: String(end - seconds), end: String(end), step };
}

/** Format a Mbps value; "—" when unknown. Values >= 1000 render as Gbps. */
export function formatMbps(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	if (value >= 1000) return `${(value / 1000).toFixed(2)} Gbps`;
	if (value >= 100) return `${value.toFixed(0)} Mbps`;
	return `${value.toFixed(1)} Mbps`;
}

/** `connection_mode` can read back as "BRIDGE" or "bridge"; null/unknown is not bridge mode. */
export function isBridgeMode(mode: string | null | undefined): boolean {
	return mode?.toLowerCase() === 'bridge';
}
