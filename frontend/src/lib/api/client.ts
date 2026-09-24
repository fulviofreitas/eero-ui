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
			),

		/**
		 * Network-level insights time series (plan § 7 WP6, deliverable 6).
		 * Premium-gated - a 402 surfaces as `ApiClientError.type ===
		 * 'premium_required'`.
		 */
		getInsights: (
			networkId: string,
			params: {
				start: string;
				end: string;
				insightType: import('./types').InsightType;
				cadence?: import('./types').InsightCadence;
			}
		) =>
			fetchWithHandling<import('./types').InsightsResponse>(`/networks/${networkId}/insights`, {
				params: {
					start: params.start,
					end: params.end,
					insight_type: params.insightType,
					...(params.cadence && { cadence: params.cadence })
				}
			}),

		/**
		 * Network-level data usage (plan § 7 WP6, deliverable 7). Premium-gated.
		 */
		getDataUsage: (
			networkId: string,
			params: {
				start: string;
				end: string;
				cadence: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(`/networks/${networkId}/data-usage`, {
				params: {
					start: params.start,
					end: params.end,
					cadence: params.cadence,
					...(params.timezone && { timezone: params.timezone })
				}
			}),

		/** Data-usage breakdown (plan § 7 WP6, deliverable 7). Premium-gated. */
		getDataUsageBreakdown: (
			networkId: string,
			params: {
				start: string;
				end: string;
				cadence?: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/breakdown`,
				{
					params: {
						start: params.start,
						end: params.end,
						...(params.cadence && { cadence: params.cadence }),
						...(params.timezone && { timezone: params.timezone })
					}
				}
			),

		/**
		 * Per-device data usage across the whole network - top-N table on the
		 * network Overview data-usage card (plan § 7 WP6, deliverable 7).
		 * Premium-gated.
		 */
		getDevicesDataUsage: (
			networkId: string,
			params: {
				start: string;
				end: string;
				cadence?: import('./types').DataUsageCadence;
				timezone?: string;
				profileId?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/devices`,
				{
					params: {
						start: params.start,
						end: params.end,
						...(params.cadence && { cadence: params.cadence }),
						...(params.timezone && { timezone: params.timezone }),
						...(params.profileId && { profile_id: params.profileId })
					}
				}
			),

		/** Data usage for a single device, by MAC (device detail page). Premium-gated. */
		getDeviceDataUsage: (
			networkId: string,
			deviceMac: string,
			params: {
				start: string;
				end: string;
				cadence: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/devices/${deviceMac}`,
				{
					params: {
						start: params.start,
						end: params.end,
						cadence: params.cadence,
						...(params.timezone && { timezone: params.timezone })
					}
				}
			),

		/** Data-usage summary across every eero on the network. Premium-gated. */
		getEerosDataUsageSummary: (
			networkId: string,
			params: {
				start: string;
				end: string;
				cadence: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/eeros/summary`,
				{
					params: {
						start: params.start,
						end: params.end,
						cadence: params.cadence,
						...(params.timezone && { timezone: params.timezone })
					}
				}
			),

		/** Data usage for a single eero (eero detail page). Premium-gated. */
		getEeroDataUsage: (
			networkId: string,
			eeroId: string,
			params: {
				start: string;
				end: string;
				cadence: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/eeros/${eeroId}`,
				{
					params: {
						start: params.start,
						end: params.end,
						cadence: params.cadence,
						...(params.timezone && { timezone: params.timezone })
					}
				}
			),

		/** Data usage for a single profile (profile detail page). Premium-gated. */
		getProfileDataUsage: (
			networkId: string,
			profileId: string,
			params: {
				start: string;
				end: string;
				cadence: import('./types').DataUsageCadence;
				timezone?: string;
			}
		) =>
			fetchWithHandling<import('./types').DataUsageResponse>(
				`/networks/${networkId}/data-usage/profiles/${profileId}`,
				{
					params: {
						start: params.start,
						end: params.end,
						cadence: params.cadence,
						...(params.timezone && { timezone: params.timezone })
					}
				}
			),

		/**
		 * The network's app events, most recent first (plan § 7 WP6,
		 * deliverable 8). Verified read - paginate older pages by passing the
		 * last event's timestamp as the cursor.
		 */
		getEvents: (networkId: string, params: { pageSize?: number; timestamp?: string } = {}) =>
			fetchWithHandling<import('./types').AppEventsResponse>(`/networks/${networkId}/events`, {
				params: {
					...(params.pageSize !== undefined && { page_size: params.pageSize }),
					...(params.timestamp && { timestamp: params.timestamp })
				}
			}),

		/**
		 * Wi-Fi channel utilisation series (plan § 7 WP6, deliverable 8).
		 * Verified read; not cached server-side. `eeroId` is the eero's
		 * numeric backend id (distinct from its opaque `id`/`url` string).
		 */
		getChannelUtilization: (
			networkId: string,
			params: {
				start: string;
				end: string;
				band?: import('./types').ChannelUtilizationBand;
				eeroId?: number;
				granularity?: number;
			}
		) =>
			fetchWithHandling<import('./types').ChannelUtilizationResponse>(
				`/networks/${networkId}/channel-utilization`,
				{
					params: {
						start: params.start,
						end: params.end,
						...(params.band && { band: params.band }),
						...(params.eeroId !== undefined && { eero_id: params.eeroId }),
						...(params.granularity !== undefined && { granularity: params.granularity })
					}
				}
			),

		/**
		 * The current user's permissions and role on the network (plan § 7 WP6,
		 * deliverable 10). Verified read; fails soft server-side to
		 * `partial: true` on a 403.
		 */
		getPermissions: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkPermissions>(`/networks/${networkId}/permissions`),

		/** The network's members (plan § 7 WP6, deliverable 10). Verified read; fails soft to `partial: true`. */
		getMembers: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkMembersResponse>(`/networks/${networkId}/members`),

		/** The network's pending invites (plan § 7 WP6, deliverable 10). Verified read; fails soft to `partial: true`. */
		getInvites: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkInvitesResponse>(`/networks/${networkId}/invites`),

		/**
		 * Backup-internet (cellular failover) status, usage and events (plan §
		 * 7 WP6, deliverable 11). Plus-gated; each field fails soft to `null`
		 * server-side.
		 */
		getBackupInternet: (networkId: string) =>
			fetchWithHandling<import('./types').BackupInternetStatus>(
				`/networks/${networkId}/backup-internet`
			),

		/** Configured backup Wi-Fi access points (plan § 7 WP6, deliverable 11). Verified read. */
		getBackupAccessPoints: (networkId: string) =>
			fetchWithHandling<import('./types').BackupAccessPointsResponse>(
				`/networks/${networkId}/backup-access-points`
			),

		/**
		 * Combined security settings: WPA3, band steering, UPnP, IPv6,
		 * per-band WPA3, fast transition, SQM, Thread and pending updates
		 * (plan § 7 WP6, deliverable 12). Read-only; each field fails soft to
		 * `null` server-side.
		 */
		getSecurity: (networkId: string) =>
			fetchWithHandling<import('./types').SecuritySettingsResponse>(
				`/networks/${networkId}/security`
			),

		/** Configured subnets (plan § 7 WP6, deliverable 12). Verified read. */
		getSubnets: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkSubnetsResponse>(`/networks/${networkId}/subnets`),

		/**
		 * Multi-static-IP WAN configuration (plan § 7 WP6, deliverable 12).
		 * `configured: false` means the feature is absent on this network, not
		 * an error - the backend never propagates the underlying 404.
		 */
		getMultiStaticIp: (networkId: string) =>
			fetchWithHandling<import('./types').MultiStaticIpResponse>(
				`/networks/${networkId}/multistaticip`
			),

		/**
		 * DHCP, connection mode, power saving and DDNS (plan § 7 WP6,
		 * deliverable 12). Read from the network envelope server-side - no
		 * dedicated SDK getter exists for this combination.
		 */
		getAdvanced: (networkId: string) =>
			fetchWithHandling<import('./types').AdvancedNetworkSettings>(
				`/networks/${networkId}/advanced`
			),

		/**
		 * Notification settings and the unread flag (plan § 7 WP6, deliverable
		 * 13). Verified reads; each source fails soft server-side.
		 */
		getNotifications: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkNotificationsResponse>(
				`/networks/${networkId}/notifications`
			),

		/**
		 * Notification history, most recent first (plan § 7 WP6, deliverable
		 * 13). Verified read; paginate older pages by passing the last
		 * entry's own timestamp field as the cursor.
		 */
		getNotificationHistory: (networkId: string, params: { timestamp?: string } = {}) =>
			fetchWithHandling<import('./types').NotificationHistoryResponse>(
				`/networks/${networkId}/notifications/history`,
				{
					params: {
						...(params.timestamp && { timestamp: params.timestamp })
					}
				}
			),

		/**
		 * Update the network's notification settings (plan § 7 WP7, family
		 * 3). Unverified write - gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`,
		 * 403 `experimental_disabled` when off. Never retried. The caller
		 * always sends the full settings map, read-first from the store.
		 */
		updateNotificationSettings: (networkId: string, settings: Record<string, boolean>) =>
			fetchWithHandling<import('./types').NetworkNotificationsResponse>(
				`/networks/${networkId}/notifications`,
				{ method: 'PUT', body: { settings }, retries: 0 }
			),

		/** Mark the network's notifications read (plan § 7 WP7, family 3). Unverified write. */
		markNotificationsRead: (networkId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/notifications/mark-read`, {
				method: 'POST',
				retries: 0
			}),

		/**
		 * Enable/disable dynamic DNS (plan § 7 WP7, family 4). Unverified
		 * write, read-first with a skip-when-unchanged no-op guard
		 * server-side (`changed: false`). Never retried.
		 */
		updateDdns: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').DdnsUpdateResultResponse>(`/networks/${networkId}/ddns`, {
				method: 'PUT',
				body: { enabled },
				retries: 0
			}),

		/**
		 * Enable/disable backup internet (cellular failover) (plan § 7 WP7,
		 * family 11). Unverified write, Plus-gated, read-first with a
		 * skip-when-unchanged no-op guard server-side. Never retried.
		 */
		updateBackupInternet: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').BackupInternetToggleResponse>(
				`/networks/${networkId}/backup-internet`,
				{ method: 'PUT', body: { enabled }, retries: 0 }
			),

		/**
		 * Create an invite for the network (plan § 7 WP7, family 2).
		 * Unverified write - the response deliberately carries no id or
		 * join-credential URL; re-list `getInvites` to discover the new
		 * invite. Never retried.
		 */
		createInvite: (networkId: string, role: import('./types').InviteCreateRequest['role']) =>
			fetchWithHandling<import('./types').InviteCreateResponse>(`/networks/${networkId}/invites`, {
				method: 'POST',
				body: { role },
				retries: 0
			}),

		/** Rename a pending invite (plan § 7 WP7, family 2). Unverified write. */
		updateInvite: (networkId: string, inviteId: string, nickname: string) =>
			fetchWithHandling<import('./types').NetworkInvite>(
				`/networks/${networkId}/invites/${inviteId}`,
				{ method: 'PUT', body: { nickname }, retries: 0 }
			),

		/** Cancel a pending invite (plan § 7 WP7, family 2). Unverified write. */
		deleteInvite: (networkId: string, inviteId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/invites/${inviteId}`, {
				method: 'DELETE',
				retries: 0
			}),

		/**
		 * Cancel every pending admin-promotion invite for the network (plan
		 * § 7 WP7, family 2). Unverified write; network-scoped, no member id
		 * required. Never retried.
		 */
		cancelPendingAdmin: (networkId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/pending-admin/cancel`, {
				method: 'POST',
				retries: 0
			}),

		/**
		 * Add a backup Wi-Fi access point (plan § 7 WP7, family 5). Unverified
		 * write - the password is never echoed back in the response. Never
		 * retried.
		 */
		addBackupAccessPoint: (
			networkId: string,
			body: import('./types').BackupAccessPointCreateRequest
		) =>
			fetchWithHandling<import('./types').BackupAccessPoint>(
				`/networks/${networkId}/backup-access-points`,
				{ method: 'POST', body, retries: 0 }
			),

		/**
		 * Update a backup Wi-Fi access point (plan § 7 WP7, family 5).
		 * Unverified write - the password is never echoed back. Never retried.
		 */
		updateBackupAccessPoint: (
			networkId: string,
			apId: string,
			body: import('./types').BackupAccessPointUpdateRequest
		) =>
			fetchWithHandling<import('./types').BackupAccessPoint>(
				`/networks/${networkId}/backup-access-points/${apId}`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Delete a backup Wi-Fi access point (plan § 7 WP7, family 5). Unverified write. */
		deleteBackupAccessPoint: (networkId: string, apId: string) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/backup-access-points/${apId}`,
				{ method: 'DELETE', retries: 0 }
			),

		/**
		 * Reorder backup Wi-Fi access points (plan § 7 WP7, family 5).
		 * Unverified write. `order` is the full list of access-point ids in
		 * the desired priority order. Never retried.
		 */
		reorderBackupAccessPoints: (networkId: string, order: string[]) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/backup-access-points/order`, {
				method: 'PUT',
				body: { order },
				retries: 0
			}),

		/**
		 * Start backup-SSID discovery and return the result (plan § 7 WP7,
		 * family 5). Unverified write. Never retried.
		 */
		discoverBackupSsids: (networkId: string) =>
			fetchWithHandling<import('./types').BackupSsidDiscoveryResponse>(
				`/networks/${networkId}/backup-access-points/discover`,
				{ method: 'POST', retries: 0 }
			),

		/**
		 * Run a backup-connectivity check (plan § 7 WP7, family 5). Unverified
		 * write. Never retried.
		 */
		backupConnectivityCheck: (networkId: string) =>
			fetchWithHandling<import('./types').DiscoveredBackupSsid>(
				`/networks/${networkId}/backup-access-points/check`,
				{ method: 'POST', retries: 0 }
			),

		/**
		 * Enable/disable Thread, optionally toggling credential syncing (plan
		 * § 7 WP7, family 7). Unverified write - the SDK's own docstring says
		 * this "has not been confirmed against a live network". Read-first
		 * with a skip-when-unchanged no-op guard server-side (`changed: false`).
		 * Never retried.
		 */
		updateThread: (networkId: string, enabled: boolean, enableCredentialSyncing?: boolean) =>
			fetchWithHandling<import('./types').ThreadUpdateResponse>(`/networks/${networkId}/thread`, {
				method: 'PUT',
				body: {
					enabled,
					...(enableCredentialSyncing !== undefined && {
						enable_credential_syncing: enableCredentialSyncing
					})
				},
				retries: 0
			}),

		/**
		 * Regenerate the network's Thread credentials (plan § 7 WP7, family
		 * 7). Unverified write - no no-op guard is possible, regenerating is
		 * inherently a change. The response never echoes the new Thread
		 * key/dataset/PSKc. Never retried.
		 */
		regenerateThreadCredentials: (networkId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/thread/regenerate`, {
				method: 'POST',
				retries: 0
			}),

		/** The network's configured port forwards (plan § 7 WP7, family 8). Verified read. */
		getForwards: (networkId: string) =>
			fetchWithHandling<import('./types').ForwardsResponse>(`/networks/${networkId}/forwards`),

		/** Create a port forward (plan § 7 WP7, family 8). Unverified write. Never retried. */
		createForward: (networkId: string, body: import('./types').ForwardCreateRequest) =>
			fetchWithHandling<import('./types').ForwardSummary>(`/networks/${networkId}/forwards`, {
				method: 'POST',
				body,
				retries: 0
			}),

		/** Update a port forward (plan § 7 WP7, family 8). Unverified write. Never retried. */
		updateForward: (
			networkId: string,
			forwardId: string,
			body: import('./types').ForwardUpdateRequest
		) =>
			fetchWithHandling<import('./types').ForwardSummary>(
				`/networks/${networkId}/forwards/${forwardId}`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Delete a port forward (plan § 7 WP7, family 8). Unverified write. Never retried. */
		deleteForward: (networkId: string, forwardId: string) =>
			fetchWithHandling<{ success: boolean }>(`/networks/${networkId}/forwards/${forwardId}`, {
				method: 'DELETE',
				retries: 0
			}),

		/** The network's configured DHCP reservations (plan § 7 WP7, family 8). Verified read. */
		getReservations: (networkId: string) =>
			fetchWithHandling<import('./types').ReservationsResponse>(
				`/networks/${networkId}/reservations`
			),

		/** Create a DHCP reservation (plan § 7 WP7, family 8). Unverified write. Never retried. */
		createReservation: (networkId: string, body: import('./types').ReservationCreateRequest) =>
			fetchWithHandling<import('./types').ReservationSummary>(
				`/networks/${networkId}/reservations`,
				{ method: 'POST', body, retries: 0 }
			),

		/** Update a DHCP reservation (plan § 7 WP7, family 8). Unverified write. Never retried. */
		updateReservation: (
			networkId: string,
			reservationId: string,
			body: import('./types').ReservationUpdateRequest
		) =>
			fetchWithHandling<import('./types').ReservationSummary>(
				`/networks/${networkId}/reservations/${reservationId}`,
				{ method: 'PUT', body, retries: 0 }
			),

		/**
		 * Delete a DHCP reservation, optionally also deleting its forwards
		 * (plan § 7 WP7, family 8). Unverified write. Never retried.
		 */
		deleteReservation: (networkId: string, reservationId: string, deleteForwards?: boolean) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/reservations/${reservationId}`,
				{
					method: 'DELETE',
					params: { ...(deleteForwards !== undefined && { delete_forwards: deleteForwards }) },
					retries: 0
				}
			),

		/**
		 * The network's advanced content-filter allow/block lists (plan §
		 * 7 WP7, family 10). Premium-gated (Plus/Secure); verified read.
		 */
		getContentFilter: (networkId: string) =>
			fetchWithHandling<import('./types').ContentFilterResponse>(
				`/networks/${networkId}/content-filter`
			),

		/**
		 * Add a domain to the network-wide allow list. Unverified write
		 * (plan § 5), premium-gated. Never retried.
		 */
		allowDomain: (networkId: string, domain: string, addCname?: boolean) =>
			fetchWithHandling<import('./types').ContentFilterResponse>(
				`/networks/${networkId}/content-filter/allow`,
				{
					method: 'POST',
					body: { domain, ...(addCname !== undefined && { add_cname: addCname }) },
					retries: 0
				}
			),

		/**
		 * Remove a domain from the network-wide allow list. Unverified
		 * write (plan § 5), premium-gated. Never retried.
		 */
		unallowDomain: (networkId: string, domain: string) =>
			fetchWithHandling<import('./types').ContentFilterResponse>(
				`/networks/${networkId}/content-filter/allow`,
				{ method: 'DELETE', body: { domain }, retries: 0 }
			),

		/**
		 * Add a domain to the network-wide block list. Unverified write
		 * (plan § 5), premium-gated. Never retried.
		 */
		blockDomain: (networkId: string, domain: string) =>
			fetchWithHandling<import('./types').ContentFilterResponse>(
				`/networks/${networkId}/content-filter/block`,
				{ method: 'POST', body: { domain }, retries: 0 }
			),

		/**
		 * Remove a domain from the network-wide block list. Unverified
		 * write (plan § 5), premium-gated. Never retried.
		 */
		unblockDomain: (networkId: string, domain: string) =>
			fetchWithHandling<import('./types').ContentFilterResponse>(
				`/networks/${networkId}/content-filter/block`,
				{ method: 'DELETE', body: { domain }, retries: 0 }
			),

		/**
		 * Add a domain to the allow list for specific profiles. Unverified
		 * write (plan § 5), premium-gated. Never retried.
		 */
		allowDomainForProfiles: (networkId: string, body: import('./types').DomainForProfilesRequest) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/content-filter/allow-for-profiles`,
				{ method: 'POST', body, retries: 0 }
			),

		/**
		 * Remove a domain from the allow list for specific profiles.
		 * Unverified write (plan § 5), premium-gated. Never retried.
		 */
		unallowDomainForProfiles: (
			networkId: string,
			body: import('./types').DomainForProfilesRequest
		) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/content-filter/allow-for-profiles`,
				{ method: 'DELETE', body, retries: 0 }
			),

		/**
		 * Add a domain to the block list for specific profiles. Unverified
		 * write (plan § 5), premium-gated. Never retried.
		 */
		blockDomainForProfiles: (
			networkId: string,
			body: import('./types').DomainBlockForProfilesRequest
		) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/content-filter/block-for-profiles`,
				{ method: 'POST', body, retries: 0 }
			),

		/**
		 * Remove a domain from the block list for specific profiles.
		 * Unverified write (plan § 5), premium-gated. Never retried.
		 */
		unblockDomainForProfiles: (
			networkId: string,
			body: import('./types').DomainBlockForProfilesRequest
		) =>
			fetchWithHandling<{ success: boolean }>(
				`/networks/${networkId}/content-filter/block-for-profiles`,
				{ method: 'DELETE', body, retries: 0 }
			),

		// ----------------------------------------------------------------
		// WP8: settings-class write controls (plan § 5, § 7 WP8). Every
		// one of these is treated as rebooting the whole mesh and is
		// gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES` server-side (403
		// `experimental_disabled` when off). Never retried - a retried
		// mesh-reboot write could double-apply.
		// ----------------------------------------------------------------

		/** Enable/disable SQM (Smart Queue Management). Settings-class write. */
		setSqm: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').SqmUpdateResponse>(`/networks/${networkId}/sqm`, {
				method: 'PUT',
				body: { enabled },
				retries: 0
			}),

		/** Set DHCP mode and/or manual lease range. Settings-class write. */
		setDhcp: (networkId: string, body: import('./types').DhcpUpdateRequest) =>
			fetchWithHandling<import('./types').DhcpUpdateResponse>(`/networks/${networkId}/dhcp`, {
				method: 'PUT',
				body,
				retries: 0
			}),

		/**
		 * Set the network's WAN connection mode. Settings-class write.
		 * `acknowledge_disables_routing: true` is required when switching to
		 * `BRIDGE` (422 otherwise) - it disables the network's own DHCP/NAT.
		 */
		setConnectionMode: (networkId: string, body: import('./types').ConnectionModeUpdateRequest) =>
			fetchWithHandling<import('./types').ConnectionModeUpdateResponse>(
				`/networks/${networkId}/connection-mode`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Enable/disable NAT port randomization. Settings-class write. */
		setNatPortRandomization: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').NatPortRandomizationUpdateResponse>(
				`/networks/${networkId}/nat-port-randomization`,
				{ method: 'PUT', body: { enabled }, retries: 0 }
			),

		/** Set the per-band WPA3 mode. Settings-class write. */
		setWpa3PerBand: (networkId: string, body: import('./types').Wpa3PerBandUpdateRequest) =>
			fetchWithHandling<import('./types').Wpa3PerBandUpdateResponse>(
				`/networks/${networkId}/wpa3`,
				{ method: 'PUT', body, retries: 0 }
			),

		/**
		 * Toggle exactly one envelope-level security setting (wpa3,
		 * band_steering, upnp or ipv6). Settings-class write - the backend
		 *422s if more than one field is provided, so callers must never
		 * send more than one per call.
		 */
		setSecurity: (networkId: string, body: import('./types').SecurityEnvelopeUpdateRequest) =>
			fetchWithHandling<import('./types').SecurityEnvelopeUpdateResponse>(
				`/networks/${networkId}/security`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Set the network's MLO (Multi-Link Operation) mode. Settings-class write. */
		setMlo: (networkId: string, mode: import('./types').MloUpdateRequest['mode']) =>
			fetchWithHandling<import('./types').MloUpdateResponse>(`/networks/${networkId}/mlo`, {
				method: 'PUT',
				body: { mode },
				retries: 0
			}),

		/** Enable/disable 802.11r fast transition. Settings-class write. */
		setFastTransition: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').FastTransitionUpdateResponse>(
				`/networks/${networkId}/fast-transition`,
				{ method: 'PUT', body: { enabled }, retries: 0 }
			),

		/** Enable/disable Passpoint. Settings-class write. */
		setPasspoint: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').PasspointUpdateResponse>(
				`/networks/${networkId}/passpoint`,
				{ method: 'PUT', body: { enabled }, retries: 0 }
			),

		/**
		 * Enable/disable proxied nodes. Settings-class write. No no-op
		 * guard exists server-side for this field - the write always
		 * proceeds (documented gap, not a silent skip).
		 */
		setProxiedNodes: (networkId: string, enabled: boolean) =>
			fetchWithHandling<import('./types').ProxiedNodesUpdateResponse>(
				`/networks/${networkId}/proxied-nodes`,
				{ method: 'PUT', body: { enabled }, retries: 0 }
			),

		/** Set power-saving enable/schedule flags. Settings-class write. */
		setPowerSaving: (networkId: string, body: import('./types').PowerSavingUpdateRequest) =>
			fetchWithHandling<import('./types').PowerSavingUpdateResponse>(
				`/networks/${networkId}/power-saving`,
				{ method: 'PUT', body, retries: 0 }
			),

		/**
		 * List power-saving schedules. Verified read, not gated - own
		 * sub-resource, not a settings-class family.
		 */
		getPowerSavingSchedules: (networkId: string) =>
			fetchWithHandling<import('./types').PowerSavingSchedulesResponse>(
				`/networks/${networkId}/power-saving/schedules`
			).then((r) => r.schedules),

		/**
		 * Create a power-saving schedule. Unverified, non-settings write -
		 * gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, never retried.
		 */
		createPowerSavingSchedule: (
			networkId: string,
			body: import('./types').PowerSavingScheduleCreateRequest
		) =>
			fetchWithHandling<import('./types').PowerSavingScheduleActionResponse>(
				`/networks/${networkId}/power-saving/schedules`,
				{ method: 'POST', body, retries: 0 }
			),

		/** Update a power-saving schedule. Unverified, non-settings write. */
		updatePowerSavingSchedule: (
			networkId: string,
			scheduleId: string,
			body: import('./types').PowerSavingScheduleUpdateRequest
		) =>
			fetchWithHandling<import('./types').PowerSavingScheduleActionResponse>(
				`/networks/${networkId}/power-saving/schedules/${scheduleId}`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Delete a power-saving schedule. Unverified, non-settings write. */
		deletePowerSavingSchedule: (networkId: string, scheduleId: string) =>
			fetchWithHandling<import('./types').PowerSavingScheduleActionResponse>(
				`/networks/${networkId}/power-saving/schedules/${scheduleId}`,
				{ method: 'DELETE', retries: 0 }
			),

		/**
		 * Create or edit a subnet configuration. Settings-class write. The
		 * "main" subnet cannot be disabled, opened, or cut off from the WAN
		 * (backend 422s).
		 */
		setSubnetConfig: (networkId: string, body: import('./types').SubnetConfigRequest) =>
			fetchWithHandling<import('./types').SubnetConfigResponse>(`/networks/${networkId}/subnets`, {
				method: 'PUT',
				body,
				retries: 0
			}),

		/**
		 * Delete a subnet's configuration. Settings-class write. The "main"
		 * subnet cannot be deleted (backend 409 `subnet_protected`).
		 */
		deleteSubnetConfig: (networkId: string, subnetType: string) =>
			fetchWithHandling<import('./types').SubnetConfigResponse>(
				`/networks/${networkId}/subnets/${subnetType}`,
				{ method: 'DELETE', retries: 0 }
			),

		/**
		 * Set the network's multi-static-IP configuration. Settings-class
		 * write. Only served on API 2.3.
		 */
		setMultiStaticIp: (networkId: string, body: import('./types').MultiStaticIpUpdateRequest) =>
			fetchWithHandling<import('./types').MultiStaticIpUpdateResultResponse>(
				`/networks/${networkId}/multistaticip`,
				{ method: 'PUT', body, retries: 0 }
			),

		/**
		 * Set per-device secondary-WAN access in bulk. Settings-class write,
		 * no no-op guard - always proceeds.
		 */
		setSecondaryWanConfig: (networkId: string, body: import('./types').SecondaryWanConfigRequest) =>
			fetchWithHandling<import('./types').SecondaryWanConfigResponse>(
				`/networks/${networkId}/secondary-wan`,
				{ method: 'PUT', body, retries: 0 }
			),

		/**
		 * Apply a pending firmware update to every node on the network.
		 * Reboot-class write - `scope: "all_nodes"` always. 409s with
		 * `no_update_available`/`update_in_progress` when not applicable.
		 */
		applyNetworkUpdate: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkUpdateApplyResponse>(
				`/networks/${networkId}/updates/apply`,
				{ method: 'POST', retries: 0 }
			),

		/**
		 * Set the network's Wi-Fi password. Not settings-class by § 5's own
		 * table, but treated with the same danger-dialog contract - it
		 * disconnects every client while it takes effect. Never logged,
		 * never echoed back.
		 */
		setNetworkPassword: (networkId: string, password: string) =>
			fetchWithHandling<import('./types').NetworkPasswordUpdateResponse>(
				`/networks/${networkId}/password`,
				{ method: 'PUT', body: { password }, retries: 0 }
			),

		/**
		 * Clear the network's Wi-Fi password - opens the network. Requires
		 * `confirm_open_network: true` (422 otherwise).
		 */
		clearNetworkPassword: (networkId: string) =>
			fetchWithHandling<import('./types').NetworkPasswordUpdateResponse>(
				`/networks/${networkId}/password`,
				{ method: 'DELETE', body: { confirm_open_network: true }, retries: 0 }
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
			}),

		/**
		 * Deny/allow a single device's secondary-WAN access
		 * (phase-6.0-revamp.md § 5, § 7 WP8, family 10). Settings-class by
		 * its own SDK docstring - treated as a mesh reboot. Never retried.
		 */
		setSecondaryWanAccess: (deviceId: string, deny: boolean) =>
			fetchWithHandling<import('./types').DeviceSecondaryWanAccessResponse>(
				`/devices/${deviceId}/secondary-wan-access`,
				{ method: 'PUT', body: { deny }, retries: 0 }
			),

		/** A single device's insights time series (plan § 7 WP6, deliverable 6). Premium-gated. */
		getInsights: (
			deviceId: string,
			params: {
				start: string;
				end: string;
				insightType: import('./types').InsightType;
				cadence?: import('./types').InsightCadence;
			}
		) =>
			fetchWithHandling<import('./types').InsightsResponse>(`/devices/${deviceId}/insights`, {
				params: {
					start: params.start,
					end: params.end,
					insight_type: params.insightType,
					...(params.cadence && { cadence: params.cadence })
				}
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
			fetchWithHandling<import('./types').EeroConnectionsResponse>(`/eeros/${eeroId}/connections`),

		/**
		 * Set the descriptive location label for an eero (plan § 7 WP7
		 * follow-up (c)). Unverified write - the SDK's own docstring says
		 * `set_location` "has not been confirmed against a live network".
		 * Read-first with a skip-when-unchanged no-op guard server-side
		 * (`changed: false`). Never retried.
		 */
		setLocation: (eeroId: string, location: string) =>
			fetchWithHandling<import('./types').LocationUpdateResponse>(`/eeros/${eeroId}/location`, {
				method: 'PUT',
				body: { location },
				retries: 0
			}),

		/**
		 * Power-cycle an eero's ports, optionally rebooting the node (plan §
		 * 7 WP7, family 6). Unverified write - both actions drop wired
		 * clients while ports renegotiate; `POWER_CYCLE_ALL_PORTS_AND_REBOOT`
		 * additionally reboots the eero (`reboots_node: true` in the
		 * response). Never retried.
		 */
		nodeAction: (eeroId: string, action: import('./types').NodeAction) =>
			fetchWithHandling<import('./types').NodeActionResponse>(`/eeros/${eeroId}/node-action`, {
				method: 'POST',
				body: { action },
				retries: 0
			}),

		/**
		 * Run a port-level action on one of an eero's ethernet ports (plan §
		 * 7 WP7, family 6). Unverified write - several actions are
		 * inherently disruptive to whatever is connected to that port. A
		 * disruptive action against a gateway's WAN/uplink port is refused
		 * server-side with a 422 `port_protected` type. Never retried.
		 */
		portAction: (eeroId: string, portNumber: string, action: import('./types').PortAction) =>
			fetchWithHandling<import('./types').PortActionResponse>(
				`/eeros/${eeroId}/ports/${portNumber}/action`,
				{ method: 'POST', body: { action }, retries: 0 }
			)
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
			),

		/** A single profile's insights time series (plan § 7 WP6, deliverable 6). Premium-gated. */
		getInsights: (
			profileId: string,
			params: {
				start: string;
				end: string;
				insightType: import('./types').InsightType;
				cadence?: import('./types').InsightCadence;
			}
		) =>
			fetchWithHandling<import('./types').InsightsResponse>(`/profiles/${profileId}/insights`, {
				params: {
					start: params.start,
					end: params.end,
					insight_type: params.insightType,
					...(params.cadence && { cadence: params.cadence })
				}
			}),

		/**
		 * A profile's scheduled pauses (plan § 7 WP7, family 1). Verified read
		 * - never gated.
		 */
		getSchedules: (profileId: string) =>
			fetchWithHandling<import('./types').ProfileSchedule[]>(`/profiles/${profileId}/schedules`),

		/**
		 * Create a scheduled pause. Unverified write (plan § 5) - gated on
		 * `EERO_DASHBOARD_EXPERIMENTAL_WRITES`, 403 `experimental_disabled`
		 * when off. Never retried.
		 */
		createSchedule: (profileId: string, body: import('./types').ScheduleCreateRequest) =>
			fetchWithHandling<import('./types').ProfileSchedule>(`/profiles/${profileId}/schedules`, {
				method: 'POST',
				body,
				retries: 0
			}),

		/**
		 * Update a scheduled pause. Unverified write, read-first server-side -
		 * `changed: false` is not distinguishable from `true` in the response
		 * shape (both return the read-back `ProfileSchedule`); the caller
		 * compares against what it already had if it needs to detect a no-op.
		 */
		updateSchedule: (
			profileId: string,
			scheduleId: string,
			body: import('./types').ScheduleUpdateRequest
		) =>
			fetchWithHandling<import('./types').ProfileSchedule>(
				`/profiles/${profileId}/schedules/${scheduleId}`,
				{ method: 'PUT', body, retries: 0 }
			),

		/** Delete a single scheduled pause. Unverified write. */
		deleteSchedule: (profileId: string, scheduleId: string) =>
			fetchWithHandling<{ success: boolean; schedule_id: string }>(
				`/profiles/${profileId}/schedules/${scheduleId}`,
				{ method: 'DELETE', retries: 0 }
			),

		/** Delete every scheduled pause on a profile. Unverified write. */
		clearSchedules: (profileId: string) =>
			fetchWithHandling<import('./types').ClearSchedulesResponse>(
				`/profiles/${profileId}/schedules`,
				{ method: 'DELETE', retries: 0 }
			),

		/**
		 * Create a bedtime quick-add schedule (built on `create_schedule`
		 * server-side). Unverified write.
		 */
		createBedtime: (profileId: string, body: import('./types').BedtimeCreateRequest) =>
			fetchWithHandling<import('./types').ProfileSchedule>(`/profiles/${profileId}/bedtime`, {
				method: 'POST',
				body,
				retries: 0
			}),

		/**
		 * A profile's blocked-application policy (plan § 7 WP7, family 10).
		 * Premium-gated; verified read.
		 */
		getBlockedApplications: (profileId: string) =>
			fetchWithHandling<import('./types').BlockedApplicationsResponse>(
				`/profiles/${profileId}/blocked-applications`
			),

		/**
		 * Set a profile's blocked-application policy. Unverified write
		 * (plan § 5), premium-gated. Never retried.
		 */
		setBlockedApplications: (profileId: string, applications: string[]) =>
			fetchWithHandling<import('./types').BlockedApplicationsResponse>(
				`/profiles/${profileId}/blocked-applications`,
				{ method: 'PUT', body: { applications }, retries: 0 }
			)
	},

	// Account profile (plan § 7 WP7, family 9). Every write here is
	// unverified, non-settings (plan § 5) and never echoes the submitted
	// value back - the response is always `{success}`.
	account: {
		/** Set the account's display name. Gated on experimental writes. Never retried. */
		setName: (name: string) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/name', {
				method: 'PUT',
				body: { name },
				retries: 0
			}),

		/** Set the account's marketing-email consent. Gated on experimental writes. Never retried. */
		setConsents: (marketingEmails: boolean) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/consents', {
				method: 'PUT',
				body: { marketing_emails: marketingEmails },
				retries: 0
			}),

		/**
		 * Start an account e-mail change - inactive until confirmed via
		 * `verifyEmail`. Gated on experimental writes AND account-identity
		 * writes (403 `account_identity_disabled` when the latter is off).
		 * Never retried.
		 */
		setEmail: (email: string) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/email', {
				method: 'PUT',
				body: { email },
				retries: 0
			}),

		/** Confirm a pending e-mail change. Same gating as `setEmail`. Never retried. */
		verifyEmail: (code: string) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/email/verify', {
				method: 'POST',
				body: { code },
				retries: 0
			}),

		/**
		 * Start an account phone-number change - inactive until confirmed
		 * via `verifyPhone`. Same gating as `setEmail`. Never retried.
		 */
		setPhone: (phone: string) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/phone', {
				method: 'PUT',
				body: { phone },
				retries: 0
			}),

		/** Confirm a pending phone-number change. Same gating as `setEmail`. Never retried. */
		verifyPhone: (code: string) =>
			fetchWithHandling<import('./types').AccountActionResponse>('/account/phone/verify', {
				method: 'POST',
				body: { code },
				retries: 0
			}),

		/** The SMS country-code catalogue, for the phone country picker. Verified read. */
		getSmsCountries: () =>
			fetchWithHandling<import('./types').SmsCountriesResponse>('/account/sms-countries')
	}
};

export default api;
