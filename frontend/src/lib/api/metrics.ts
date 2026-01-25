/**
 * Metrics API Client
 *
 * Provides functions to fetch historical metrics data from VictoriaMetrics
 * via the FastAPI backend for chart visualizations.
 */

export interface TimeSeriesPoint {
	x: number; // timestamp in milliseconds
	y: number; // value
}

export interface MetricsResponse {
	status: string;
	data: {
		resultType: string;
		result: Array<{
			metric: Record<string, string>;
			values: Array<[number, string]>;
		}>;
	};
}

interface SpeedtestHistoryResponse {
	download: MetricsResponse;
	upload: MetricsResponse;
}

interface BandwidthHistoryResponse {
	rx: MetricsResponse;
	tx: MetricsResponse;
}

interface SignalHistoryResponse {
	signal_strength: MetricsResponse;
	connection_score: MetricsResponse;
}

/**
 * Transform Prometheus/VictoriaMetrics response to chart-friendly format
 */
function transformMetricsResponse(data: MetricsResponse | undefined): TimeSeriesPoint[] {
	if (!data?.data?.result?.[0]?.values) {
		return [];
	}

	return data.data.result[0].values.map(([timestamp, value]) => ({
		x: timestamp * 1000, // Convert to milliseconds for Chart.js
		y: parseFloat(value)
	}));
}

/**
 * Fetch with query parameters helper
 */
async function fetchMetrics<T>(path: string, params: Record<string, string>): Promise<T> {
	const searchParams = new URLSearchParams(params);
	const url = `/api${path}?${searchParams.toString()}`;

	const response = await fetch(url, {
		credentials: 'same-origin',
		headers: {
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
		throw new Error(error.detail || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Get speedtest history for charts
 */
export async function getSpeedtestHistory(
	start: string,
	end: string,
	step = '5m'
): Promise<{ download: TimeSeriesPoint[]; upload: TimeSeriesPoint[] }> {
	try {
		const response = await fetchMetrics<SpeedtestHistoryResponse>('/metrics/speedtest/history', {
			start,
			end,
			step
		});

		return {
			download: transformMetricsResponse(response.download),
			upload: transformMetricsResponse(response.upload)
		};
	} catch (error) {
		// Return empty data on error - charts will show "no data available"
		console.error('Failed to fetch speedtest history:', error);
		return { download: [], upload: [] };
	}
}

/**
 * Get device signal strength history for charts
 * Note: eero-prometheus-exporter doesn't provide bandwidth metrics per device,
 * so we show signal quality metrics instead.
 */
export async function getDeviceSignalHistory(
	deviceId: string,
	start: string,
	end: string,
	step = '1m'
): Promise<{ signalStrength: TimeSeriesPoint[]; connectionScore: TimeSeriesPoint[] }> {
	try {
		// Normalize device ID (remove colons, lowercase)
		const normalizedId = deviceId.replace(/:/g, '').toLowerCase();

		const response = await fetchMetrics<SignalHistoryResponse>(
			`/metrics/devices/${normalizedId}/signal`,
			{
				start,
				end,
				step
			}
		);

		return {
			signalStrength: transformMetricsResponse(response.signal_strength),
			connectionScore: transformMetricsResponse(response.connection_score)
		};
	} catch (error) {
		console.error('Failed to fetch device signal history:', error);
		return { signalStrength: [], connectionScore: [] };
	}
}

/**
 * Get device bandwidth history for charts (legacy - returns signal data)
 * @deprecated Use getDeviceSignalHistory instead
 */
export async function getDeviceBandwidth(
	mac: string,
	start: string,
	end: string,
	step = '1m'
): Promise<{ rx: TimeSeriesPoint[]; tx: TimeSeriesPoint[] }> {
	try {
		// Normalize MAC address (remove colons, lowercase)
		const normalizedMac = mac.replace(/:/g, '').toLowerCase();

		const response = await fetchMetrics<BandwidthHistoryResponse>(
			`/metrics/devices/${normalizedMac}/bandwidth`,
			{
				start,
				end,
				step
			}
		);

		return {
			rx: transformMetricsResponse(response.rx),
			tx: transformMetricsResponse(response.tx)
		};
	} catch (error) {
		// Return empty data on error - charts will show "no data available"
		console.error('Failed to fetch device bandwidth:', error);
		return { rx: [], tx: [] };
	}
}

/**
 * Execute arbitrary PromQL query (instant)
 */
export async function queryMetrics(promql: string): Promise<MetricsResponse> {
	return fetchMetrics<MetricsResponse>('/metrics/query', { query: promql });
}

/**
 * Execute PromQL range query
 */
export async function queryMetricsRange(
	promql: string,
	start: string,
	end: string,
	step = '1m'
): Promise<MetricsResponse> {
	return fetchMetrics<MetricsResponse>('/metrics/query_range', {
		query: promql,
		start,
		end,
		step
	});
}

interface ClientCountHistoryResponse {
	total: MetricsResponse;
	wireless: MetricsResponse;
	wired: MetricsResponse;
	client_count: MetricsResponse; // backwards compatibility
}

export interface ClientCountData {
	total: TimeSeriesPoint[];
	wireless: TimeSeriesPoint[];
	wired: TimeSeriesPoint[];
}

/**
 * Get network client count history for charts
 * Returns total, wireless, and wired client counts over time
 */
export async function getClientCountHistory(
	start: string,
	end: string,
	step = '5m'
): Promise<ClientCountData> {
	try {
		const response = await fetchMetrics<ClientCountHistoryResponse>(
			'/metrics/network/client_count',
			{
				start,
				end,
				step
			}
		);

		return {
			total: transformMetricsResponse(response.total),
			wireless: transformMetricsResponse(response.wireless),
			wired: transformMetricsResponse(response.wired)
		};
	} catch (error) {
		console.error('Failed to fetch client count history:', error);
		return { total: [], wireless: [], wired: [] };
	}
}

interface MeshQualityHistoryResponse {
	mesh_quality: MetricsResponse;
}

/**
 * Get eero mesh quality history for charts
 */
export async function getEeroMeshQualityHistory(
	serial: string,
	start: string,
	end: string,
	step = '5m'
): Promise<TimeSeriesPoint[]> {
	try {
		const response = await fetchMetrics<MeshQualityHistoryResponse>(
			`/metrics/eeros/${serial}/quality`,
			{
				start,
				end,
				step
			}
		);

		return transformMetricsResponse(response.mesh_quality);
	} catch (error) {
		console.error('Failed to fetch eero mesh quality history:', error);
		return [];
	}
}
