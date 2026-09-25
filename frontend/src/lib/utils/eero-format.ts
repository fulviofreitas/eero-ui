/**
 * Formatting helpers for the eero detail page, extracted from
 * routes/eeros/[id]/+page.svelte (WP5 decomposition) so the several cards that share them
 * (Status, Clients, Network, Performance, History, Radios) don't each redefine their own copy.
 */

export function getMeshQualityBars(bars: number | null | undefined): string {
	if (bars === null || bars === undefined) return '━━━━━';
	const filled = Math.min(Math.max(0, bars), 5);
	return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

export function formatUptime(seconds: number | null | undefined): string {
	if (!seconds) return '—';
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return '—';
	try {
		return new Date(dateStr).toLocaleString();
	} catch {
		return dateStr;
	}
}

export function formatPercentage(value: number | null | undefined): string {
	if (value === null || value === undefined) return '—';
	return `${value.toFixed(1)}%`;
}

export function formatTemperature(celsius: number | null | undefined): string {
	if (celsius === null || celsius === undefined) return '—';
	const fahrenheit = (celsius * 9) / 5 + 32;
	return `${celsius.toFixed(1)}°C / ${fahrenheit.toFixed(1)}°F`;
}

const BAND_MAP: Record<string, string> = {
	band_2_4GHz: '2.4 GHz',
	band_5GHz: '5 GHz',
	band_5GHz_full: '5 GHz',
	band_5GHz_low: '5 GHz Low',
	band_5GHz_high: '5 GHz High',
	band_6GHz: '6 GHz'
};

export function formatBand(band: string): string {
	return BAND_MAP[band] || band.replace('band_', '').replace('_', ' ').replace('GHz', ' GHz');
}

export function getUniqueBands(bands: string[] | null): string[] {
	if (!bands || bands.length === 0) return [];
	const formatted = [...new Set(bands.map(formatBand))];
	formatted.sort((a, b) => {
		const order = ['2.4 GHz', '5 GHz', '5 GHz Low', '5 GHz High', '6 GHz'];
		return order.indexOf(a) - order.indexOf(b);
	});
	return formatted;
}

export function formatPortSpeed(speed: string | null): string {
	if (!speed) return '';
	// Handle formats like "P10000" (10 Gbps), "P1000" (1 Gbps), "P100" (100 Mbps)
	const match = speed.match(/P(\d+)/);
	if (match) {
		const mbps = parseInt(match[1], 10);
		if (mbps >= 10000) return `${mbps / 1000} Gbps`;
		if (mbps >= 1000) return `${mbps / 1000} Gbps`;
		return `${mbps} Mbps`;
	}
	// Handle other formats
	if (speed.includes('Gbps') || speed.includes('Mbps')) return speed;
	return speed;
}
