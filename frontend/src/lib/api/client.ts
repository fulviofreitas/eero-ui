/**
 * Eero Dashboard API Client
 *
 * HTTP client with error handling, request interceptors, and retry logic.
 */

import type { ApiError, ApiErrorType } from './types';

// Base URL for API requests (proxied in development)
const API_BASE = '/api';

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

// Maximum retries for transient failures - GET requests only. Writes always
// pass `retries: 0` explicitly (plan § 5: "no automatic retry" on any write
// that is not in the SDK's verified-write allowlist, and retrying a verified
// write blindly on a timeout is just as unsafe - a POST that succeeded but
// timed out on the response must never be silently replayed).
const MAX_RETRIES = 2;

/**
 * Custom error class for API errors.
 */
export class ApiClientError extends Error {
	constructor(
		public status: number,
		public detail: string,
		public type?: ApiErrorType | string,
		/**
		 * Field name for validation failures, when the API identified one.
		 * Lets a form render the error inline against the offending input.
		 */
		public field?: string,
		/** Present on a 401; `"expired"` means the stored session died server-side. */
		public reason?: 'expired'
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
 * Parse error response from API.
 *
 * The backend's error body is `{detail, type?, error_code?}` (plan § 3.4).
 * `type` distinguishes premium-gating (`premium_required`), a
 * network-right-now gap (`feature_unavailable`), and the experimental-writes
 * flag being off (`experimental_disabled`) from a plain failure, so the UI
 * can render each with the right call to action instead of a generic error
 * toast. `error_code` is logged server-side only and never surfaced here.
 */
async function parseError(response: Response): Promise<ApiError> {
	// Distinct, user-actionable copy for the statuses that carry no useful
	// `detail` body of their own (429) or where a generic message reads
	// better than whatever the backend sent (402 is always premium-gating).
	if (response.status === 429) {
		return { detail: 'eero rate limit hit. Try again shortly.', type: undefined };
	}

	try {
		const data = await response.json();
		const fallback =
			response.status === 402
				? 'This feature requires an eero Plus/Secure subscription.'
				: `HTTP ${response.status}`;
		const { detail, field } = normalizeDetail(data.detail, fallback);
		const reason = data.reason === 'expired' ? 'expired' : undefined;
		if (response.status === 402) {
			return { detail, type: 'premium_required', field, reason };
		}
		if (response.status === 409 && data.type === 'feature_unavailable') {
			return { detail, type: 'feature_unavailable', field, reason };
		}
		return { detail, type: data.type, field, reason };
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
		// Reads keep the existing 5xx retry; writes default to zero retries
		// even if a caller forgets to pass `retries: 0` explicitly (plan § 5)
		// - a POST/PUT/PATCH/DELETE that timed out on the *response* may have
		// already applied, so blindly replaying it is unsafe regardless of
		// whether the SDK call it maps to is on the verified-write allowlist.
		retries = method === 'GET' ? MAX_RETRIES : 0
	} = config;

	const url = buildUrl(`${API_BASE}${path}`, params);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	const requestInit: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
			// The backend rejects every POST/PUT/PATCH/DELETE under /api without this header
			// (403, type "csrf") - sent on every request (not just writes) for simplicity, and
			// placed before `...headers` so a caller can still override it if it ever needs to.
			'X-Requested-With': 'eero-ui',
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
				// Dispatch event for global auth handling; carry `reason` so the
				// listener (auth store) can distinguish an expired session from
				// never having logged in, without a second round trip.
				window.dispatchEvent(
					new CustomEvent('auth:unauthorized', { detail: { reason: error.reason } })
				);
				throw new ApiClientError(401, error.detail, error.type, error.field, error.reason);
			}

			// Handle other errors
			if (!response.ok) {
				const error = await parseError(response);
				throw new ApiClientError(
					response.status,
					error.detail,
					error.type,
					error.field,
					error.reason
				);
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
	health: () => fetchWithHandling<import('./types').HealthStatus>('/health'),

	// Auth
	auth: {
		status: () => fetchWithHandling<import('./types').AuthStatus>('/auth/status'),

		login: (identifier: string) =>
			fetchWithHandling<import('./types').LoginResponse>('/auth/login', {
				method: 'POST',
				body: { identifier },
				retries: 0
			}),

		verify: (code: string) =>
			fetchWithHandling<import('./types').VerifyResponse>('/auth/verify', {
				method: 'POST',
				body: { code },
				retries: 0
			}),

		logout: () =>
			fetchWithHandling<{ success: boolean }>('/auth/logout', {
				method: 'POST',
				retries: 0
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
				method: 'POST',
				retries: 0
			}),

		/**
		 * Starts a speed test. Returns as soon as the eero cloud accepts the
		 * request (202) - the result is not in this response (plan decision
		 * 4). Poll `speedTestHistory` for the result.
		 */
		speedTest: (networkId: string) =>
			fetchWithHandling<import('./types').SpeedTestStartResponse>(
				`/networks/${networkId}/speedtest`,
				{ method: 'POST', retries: 0 }
			),

		/**
		 * Past speed-test results, newest first (plan § 7 WP6, deliverable 1).
		 * `limit` defaults to 1 to preserve `runSpeedTest`'s polling behaviour
		 * (`stores/networks.ts`); the history card passes an explicit 10/25/50.
		 */
		speedTestHistory: (
			networkId: string,
			options: { limit?: number; startTime?: string; endTime?: string } = {}
		) =>
			fetchWithHandling<import('./types').SpeedTestResult[]>(`/networks/${networkId}/speedtests`, {
				params: {
					limit: options.limit ?? 1,
					...(options.startTime && { start_time: options.startTime }),
					...(options.endTime && { end_time: options.endTime })
				}
			}),

		toggleGuestNetwork: (networkId: string, enabled: boolean, name?: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/guest-network`, {
				method: 'PUT',
				params: { enabled, ...(name && { name }) },
				retries: 0
			}),

		/** Current guest network configuration, incl. whether a password is set. */
		getGuestNetwork: (networkId: string) =>
			fetchWithHandling<import('./types').GuestNetworkStatus>(`/networks/${networkId}/guest`),

		/**
		 * Set the guest network password (plan § 7 WP6, deliverable 2). Verified
		 * write; disconnects guest clients while it takes effect. Never a
		 * password ever appears in the response - only `has_password`.
		 */
		setGuestPassword: (networkId: string, password: string) =>
			fetchWithHandling<import('./types').GuestPasswordResponse>(
				`/networks/${networkId}/guest/password`,
				{ method: 'PUT', body: { password }, retries: 0 }
			),

		/** Clear the guest network password. Verified write. */
		clearGuestPassword: (networkId: string) =>
			fetchWithHandling<import('./types').GuestPasswordResponse>(
				`/networks/${networkId}/guest/password`,
				{ method: 'DELETE', retries: 0 }
			),

		/** Channel/neighbour scan result (plan § 7 WP6, deliverable 6). Verified read. */
		getScan: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkScanResponse>(`/networks/${networkId}/scan`),

		setName: (networkId: string, name: string) =>
			fetchWithHandling<import('./types').NetworkRenameResponse>(`/networks/${networkId}/name`, {
				method: 'PUT',
				body: { name },
				retries: 0
			}),

		getDns: (networkId: string) =>
			fetchWithHandling<import('./types').DnsSettings>(`/networks/${networkId}/dns`),

		setDns: (networkId: string, body: import('./types').DnsUpdateRequest) =>
			fetchWithHandling<import('./types').DnsUpdateResponse>(`/networks/${networkId}/dns`, {
				method: 'PUT',
				body,
				retries: 0
			}),

		/**
		 * Per-network entitlements, premium status and the
		 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES` flag - one call gates every
		 * premium and unverified-write control in the UI (plan § 7 WP6).
		 */
		getEntitlements: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkEntitlements>(
				`/networks/${networkId}/entitlements`
			)
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

		/**
		 * Unverified (plan § 5): the backend resolves the device's MAC
		 * server-side before posting to the blacklist, and returns 422 when
		 * the device has no known MAC to block by.
		 */
		block: (deviceId: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/block`, {
				method: 'POST',
				retries: 0
			}),

		/** Verified (plan § 5) - safe for the optimistic pattern. */
		unblock: (deviceId: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/unblock`, {
				method: 'POST',
				retries: 0
			}),

		/** Verified (plan § 5) - safe for the optimistic pattern. */
		setNickname: (deviceId: string, nickname: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/nickname`, {
				method: 'PUT',
				body: { nickname },
				retries: 0
			}),

		/**
		 * Set a device's type (plan § 7 WP6, deliverable 4). Verified write -
		 * safe for the optimistic pattern. `deviceType` must match
		 * `^[a-z0-9_]{1,40}$` (enforced again server-side).
		 */
		setType: (deviceId: string, deviceType: string) =>
			fetchWithHandling<import('./types').DeviceAction>(`/devices/${deviceId}/type`, {
				method: 'PUT',
				body: { device_type: deviceType },
				retries: 0
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
				method: 'POST',
				retries: 0
			}),

		setLed: (eeroId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').EeroAction>(`/eeros/${eeroId}/led`, {
				method: 'POST',
				params: { enabled },
				retries: 0
			}),

		/**
		 * Verified write (plan § 7 WP6, deliverable 3); the response is a
		 * read-back of `led_brightness`, not an echo of the request.
		 */
		setLedBrightness: (eeroId: string, brightness: number) =>
			fetchWithHandling<import('./types').EeroLedBrightnessAction>(
				`/eeros/${eeroId}/led/brightness`,
				{ method: 'PUT', params: { brightness }, retries: 0 }
			),

		/** An eero's client connections (plan § 7 WP6, deliverable 5). Verified read. */
		getConnections: (eeroId: string) =>
			fetchWithHandling<import('./types').EeroConnectionsResponse>(`/eeros/${eeroId}/connections`)
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
				method: 'POST',
				retries: 0
			}),

		unpause: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileAction>(`/profiles/${profileId}/unpause`, {
				method: 'POST',
				retries: 0
			}),

		create: (name: string) =>
			fetchWithHandling<import('./types').ProfileSummary>('/profiles', {
				method: 'POST',
				body: { name },
				retries: 0
			}),

		rename: (profileId: string, name: string) =>
			fetchWithHandling<import('./types').ProfileSummary>(`/profiles/${profileId}`, {
				method: 'PATCH',
				body: { name },
				retries: 0
			}),

		delete: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileAction>(`/profiles/${profileId}`, {
				method: 'DELETE',
				retries: 0
			}),

		assignDevices: (profileId: string, deviceIds: string[]) =>
			fetchWithHandling<import('./types').ProfileAssignDevicesResponse>(
				`/profiles/${profileId}/assign-devices`,
				{
					method: 'POST',
					body: { device_ids: deviceIds },
					retries: 0
				}
			)
	}
};

export default api;
