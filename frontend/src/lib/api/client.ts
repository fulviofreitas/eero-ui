/**
 * Eero Dashboard API Client
 *
 * HTTP client with error handling, request interceptors, and retry logic.
 */

import type { ApiError } from './types';

// Base URL for API requests (proxied in development)
const API_BASE = '/api';

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

// Maximum retries for transient failures
const MAX_RETRIES = 2;

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
	constructor(
		public status: number,
		public detail: string,
		public type?: string,
		/**
		 * Field name for validation failures, when the API identified one.
		 * Lets a form render the error inline against the offending input.
		 */
		public field?: string
	) {
		super(detail);
		this.name = 'ApiClientError';
	}
}

/**
 * Coerce an API `detail` payload into a human-readable string, and pull out a
 * field name when one is present.
 *
 * `detail` is not always a string. FastAPI's own request-validation errors
 * return an array of `{loc, msg, type}` objects, and our DNS route returns a
 * `{field, message}` object so the form can highlight the offending input.
 * Normalising here keeps every caller honest — otherwise a validation failure
 * renders as "[object Object]".
 */
function normalizeDetail(detail: unknown, fallback: string): { detail: string; field?: string } {
	if (typeof detail === 'string' && detail) {
		return { detail };
	}

	// Our own `{field, message}` shape.
	if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
		const record = detail as Record<string, unknown>;
		const message = typeof record.message === 'string' ? record.message : undefined;
		const field = typeof record.field === 'string' ? record.field : undefined;
		if (message) {
			return { detail: message, field };
		}
	}

	// FastAPI request-validation shape: [{loc: [...], msg, type}, ...]
	if (Array.isArray(detail) && detail.length > 0) {
		const messages: string[] = [];
		let field: string | undefined;
		for (const item of detail) {
			if (!item || typeof item !== 'object') continue;
			const record = item as Record<string, unknown>;
			if (typeof record.msg === 'string') {
				messages.push(record.msg);
			}
			if (!field && Array.isArray(record.loc)) {
				// `loc` is e.g. ["body", "ipv4", "servers"] - the last segment
				// is the field the user can actually act on.
				const last = record.loc[record.loc.length - 1];
				if (typeof last === 'string') field = last;
			}
		}
		if (messages.length > 0) {
			return { detail: messages.join('; '), field };
		}
	}

	return { detail: fallback };
}

/**
 * HTTP client configuration
 */
interface RequestConfig {
	method?: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE';
	body?: unknown;
	params?: Record<string, string | number | boolean>;
	headers?: Record<string, string>;
	timeout?: number;
	retries?: number;
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
	const url = new URL(path, window.location.origin);

	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.set(key, String(value));
			}
		});
	}

	return url.toString();
}

/**
 * Parse error response from API
 */
async function parseError(response: Response): Promise<ApiError> {
	try {
		const data = await response.json();
		const { detail, field } = normalizeDetail(data.detail, `HTTP ${response.status}`);
		return { detail, type: data.type, field };
	} catch {
		return {
			detail: `HTTP ${response.status}: ${response.statusText}`
		};
	}
}

/**
 * Core fetch wrapper with error handling
 */
async function fetchWithHandling<T>(path: string, config: RequestConfig = {}): Promise<T> {
	const {
		method = 'GET',
		body,
		params,
		headers = {},
		timeout = REQUEST_TIMEOUT,
		retries = MAX_RETRIES
	} = config;

	const url = buildUrl(`${API_BASE}${path}`, params);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	const requestInit: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
			...headers
		},
		signal: controller.signal,
		credentials: 'same-origin'
	};

	if (body !== undefined) {
		requestInit.body = JSON.stringify(body);
	}

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetch(url, requestInit);
			clearTimeout(timeoutId);

			// Handle authentication errors
			if (response.status === 401) {
				const error = await parseError(response);
				// Dispatch event for global auth handling
				window.dispatchEvent(new CustomEvent('auth:unauthorized'));
				throw new ApiClientError(401, error.detail, error.type, error.field);
			}

			// Handle other errors
			if (!response.ok) {
				const error = await parseError(response);
				throw new ApiClientError(response.status, error.detail, error.type, error.field);
			}

			// Parse response
			const data = await response.json();
			return data as T;
		} catch (error) {
			lastError = error as Error;

			// Don't retry auth errors or client errors
			if (error instanceof ApiClientError) {
				if (error.status >= 400 && error.status < 500) {
					throw error;
				}
			}

			// Don't retry if aborted
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ApiClientError(0, 'Request timed out');
			}

			// Wait before retry (exponential backoff)
			if (attempt < retries) {
				await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
			}
		}
	}

	// All retries failed
	throw lastError || new ApiClientError(0, 'Request failed');
}

// ============================================
// API Methods
// ============================================

export const api = {
	// Health
	health: () =>
		fetchWithHandling<{
			status: string;
			version: string;
			eero_client_version: string;
		}>('/health'),

	// Auth
	auth: {
		status: () => fetchWithHandling<import('./types').AuthStatus>('/auth/status'),

		login: (identifier: string) =>
			fetchWithHandling<import('./types').LoginResponse>('/auth/login', {
				method: 'POST',
				body: { identifier }
			}),

		verify: (code: string) =>
			fetchWithHandling<import('./types').VerifyResponse>('/auth/verify', {
				method: 'POST',
				body: { code }
			}),

		logout: () =>
			fetchWithHandling<{ success: boolean }>('/auth/logout', {
				method: 'POST'
			})
	},

	// Networks
	networks: {
		list: (refresh = false) =>
			fetchWithHandling<import('./types').NetworkSummary[]>('/networks', {
				params: { refresh }
			}),

		get: (networkId: string, refresh = false) =>
			fetchWithHandling<import('./types').NetworkDetail>(`/networks/${networkId}`, {
				params: { refresh }
			}),

		setPreferred: (networkId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/set-preferred`, {
				method: 'POST'
			}),

		speedTest: (networkId: string) =>
			fetchWithHandling<import('./types').SpeedTestResult>(`/networks/${networkId}/speedtest`, {
				method: 'POST',
				timeout: 90000 // Speed tests take longer
			}),

		toggleGuestNetwork: (networkId: string, enabled: boolean, name?: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/guest-network`, {
				method: 'PUT',
				params: { enabled, ...(name && { name }) }
			}),

		setName: (networkId: string, name: string) =>
			fetchWithHandling<import('./types').NetworkRenameResponse>(`/networks/${networkId}/name`, {
				method: 'PUT',
				body: { name }
			}),

		getDns: (networkId: string) =>
			fetchWithHandling<import('./types').DnsSettings>(`/networks/${networkId}/dns`),

		setDns: (networkId: string, body: import('./types').DnsUpdateRequest) =>
			fetchWithHandling<import('./types').DnsUpdateResponse>(`/networks/${networkId}/dns`, {
				method: 'PUT',
				body
			})
	},

	// Devices
	devices: {
		list: (
			options: {
				refresh?: boolean;
				connectedOnly?: boolean;
				profileId?: string;
				deviceIds?: string[];
			} = {}
		) =>
			fetchWithHandling<import('./types').DeviceSummary[]>('/devices', {
				params: {
					refresh: options.refresh ?? false,
					connected_only: options.connectedOnly ?? false,
					...(options.profileId && { profile_id: options.profileId }),
					...(options.deviceIds && { device_ids: options.deviceIds.join(',') })
				}
			}),

		get: (deviceId: string, refresh = false) =>
			fetchWithHandling<import('./types').DeviceDetail>(`/devices/${deviceId}`, {
				params: { refresh }
			}),

		block: (deviceId: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/block`, {
				method: 'POST'
			}),

		unblock: (deviceId: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/unblock`, {
				method: 'POST'
			}),

		setNickname: (deviceId: string, nickname: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/nickname`, {
				method: 'PUT',
				body: { nickname }
			})
	},

	// Eeros
	eeros: {
		list: (refresh = false) =>
			fetchWithHandling<import('./types').EeroSummary[]>('/eeros', {
				params: { refresh }
			}),

		get: (eeroId: string, refresh = false) =>
			fetchWithHandling<import('./types').EeroDetail>(`/eeros/${eeroId}`, {
				params: { refresh }
			}),

		reboot: (eeroId: string) =>
			fetchWithHandling<import('./types').EeroAction>(`/eeros/${eeroId}/reboot`, {
				method: 'POST'
			}),

		setLed: (eeroId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').EeroAction>(`/eeros/${eeroId}/led`, {
				method: 'POST',
				params: { enabled }
			}),

		setLedBrightness: (eeroId: string, brightness: number) =>
			fetchWithHandling<import('./types').EeroAction>(`/eeros/${eeroId}/led/brightness`, {
				method: 'PUT',
				params: { brightness }
			})
	},

	// Profiles
	profiles: {
		list: (refresh = false) =>
			fetchWithHandling<import('./types').ProfileSummary[]>('/profiles', {
				params: { refresh }
			}),

		get: (profileId: string, refresh = false) =>
			fetchWithHandling<import('./types').ProfileSummary>(`/profiles/${profileId}`, {
				params: { refresh }
			}),

		pause: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileAction>(`/profiles/${profileId}/pause`, {
				method: 'POST'
			}),

		unpause: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileAction>(`/profiles/${profileId}/unpause`, {
				method: 'POST'
			}),

		create: (name: string) =>
			fetchWithHandling<import('./types').ProfileSummary>('/profiles', {
				method: 'POST',
				body: { name }
			}),

		rename: (profileId: string, name: string) =>
			fetchWithHandling<import('./types').ProfileSummary>(`/profiles/${profileId}`, {
				method: 'PATCH',
				body: { name }
			}),

		delete: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileAction>(`/profiles/${profileId}`, {
				method: 'DELETE'
			}),

		assignDevices: (profileId: string, deviceIds: string[]) =>
			fetchWithHandling<import('./types').ProfileAssignDevicesResponse>(
				`/profiles/${profileId}/assign-devices`,
				{
					method: 'POST',
					body: { device_ids: deviceIds }
				}
			)
	}
};

export default api;
