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
		public type?: string
	) {
		super(detail);
		this.name = 'ApiClientError';
	}
}

/**
 * HTTP client configuration
 */
interface RequestConfig {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
		return {
			detail: data.detail || `HTTP ${response.status}`,
			type: data.type
		};
	} catch {
		return {
			detail: `HTTP ${response.status}: ${response.statusText}`,
		};
	}
}

/**
 * Core fetch wrapper with error handling
 */
async function fetchWithHandling<T>(
	path: string,
	config: RequestConfig = {}
): Promise<T> {
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
				throw new ApiClientError(401, error.detail, error.type);
			}

			// Handle other errors
			if (!response.ok) {
				const error = await parseError(response);
				throw new ApiClientError(response.status, error.detail, error.type);
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
				await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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
			})
	},

	// Devices
	devices: {
		list: (options: { refresh?: boolean; connectedOnly?: boolean; profileId?: string; deviceIds?: string[] } = {}) =>
			fetchWithHandling<import('./types').DeviceSummary[]>('/devices', {
				params: { 
					refresh: options.refresh ?? false, 
					connected_only: options.connectedOnly ?? false,
					profile_id: options.profileId,
					device_ids: options.deviceIds?.join(',')
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
			}),
		
		prioritize: (deviceId: string, durationMinutes = 0) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/prioritize`, {
				method: 'POST',
				params: { duration_minutes: durationMinutes }
			}),
		
		deprioritize: (deviceId: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/deprioritize`, {
				method: 'POST'
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
			})
	}
};

export default api;
