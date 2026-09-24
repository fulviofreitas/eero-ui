/**
 * Eero Dashboard API Types
 *
 * TypeScript interfaces matching the FastAPI backend models.
 */

// ============================================
// Authentication
// ============================================

export interface AuthStatus {
	authenticated: boolean;
	/**
	 * Why `authenticated` is false. `null` when authenticated, `"none"` when
	 * no session was ever established, `"expired"` when the stored token was
	 * rejected by the eero cloud (§ 4.1 of the 6.0 revamp plan).
	 */
	reason: 'none' | 'expired' | null;
	preferred_network_id: string | null;
	user_email: string | null;
	user_name: string | null;
	user_phone: string | null;
	user_role: string | null;
	account_id: string | null;
	premium_status: string | null;
}

export interface LoginRequest {
	identifier: string;
}

export interface VerifyRequest {
	code: string;
}

export interface LoginResponse {
	success: boolean;
	message: string;
}

export interface VerifyResponse {
	success: boolean;
	message: string;
	preferred_network_id: string | null;
}

// ============================================
// Networks
// ============================================

export interface NetworkSummary {
	id: string;
	name: string;
	status: 'online' | 'offline' | 'updating' | 'unknown' | 'green' | 'yellow' | 'red';
	guest_network_enabled: boolean;
	public_ip: string | null;
	isp_name: string | null;
}

export interface NetworkDetail extends NetworkSummary {
	device_count: number;
	eero_count: number;
	speed_test: SpeedTestResult | null;
	health: Record<string, unknown> | null;
	settings: Record<string, unknown> | null;

	// Additional info
	owner: string | null;
	display_name: string | null;
	network_customer_type: string | null;
	premium_status: string | null;
	created_at: string | null;

	// Connection
	gateway: string | null;
	wan_type: string | null;
	gateway_ip: string | null;
	connection_mode: string | null;

	// Features
	backup_internet_enabled: boolean;
	power_saving: boolean;
	sqm: boolean;
	upnp: boolean;
	thread: boolean;
	band_steering: boolean;
	wpa3: boolean;
	ipv6_upstream: boolean;
	ipv6: Record<string, unknown> | null;

	// DNS
	dns: {
		mode: string;
		parent?: { ips: string[] };
		custom?: { ips: string[] };
		caching: boolean;
	} | null;
	premium_dns: {
		dns_policies_enabled: boolean;
		dns_provider: string;
		dns_policies?: Record<string, boolean>;
	} | null;

	// Geo IP
	geo_ip: {
		countryCode: string;
		countryName: string;
		city: string;
		region: string;
		timezone: string;
		isp: string;
	} | null;

	// Updates
	updates: {
		target_firmware: string;
		update_required: boolean;
		has_update: boolean;
		can_update_now: boolean;
		last_update_started: string | null;
	} | null;

	// DHCP
	dhcp: {
		lease_time_seconds: number;
		subnet_mask: string;
		starting_address: string;
		ending_address: string;
	} | null;

	// DDNS
	ddns: {
		enabled: boolean;
		subdomain: string;
	} | null;

	// HomeKit
	homekit: {
		enabled: boolean;
		managedNetworkEnabled: boolean;
	} | null;

	// IP Settings
	ip_settings: {
		double_nat: boolean;
		public_ip: string;
	} | null;

	// Premium
	premium_details: {
		tier: string;
		payment_method: string;
		next_billing_event_date: string | null;
	} | null;

	// Integrations
	amazon_account_linked: boolean;
	alexa_skill: boolean;

	// Timestamps
	last_reboot: string | null;
}

export interface NetworkRenameRequest {
	name: string;
}

// ============================================
// Guest network password (phase-6.0-revamp.md WP6, deliverable 2)
//
// The eero cloud API never returns the raw guest password - only whether one
// is currently set - so `has_password` is the only thing this UI can ever
// show. Never display or log a submitted password after the write resolves.
// ============================================

export interface GuestNetworkStatus {
	enabled: boolean;
	name: string | null;
	has_password: boolean;
}

export interface GuestPasswordResponse {
	success: boolean;
	guest_network: GuestNetworkStatus;
}

// ============================================
// Network scan (phase-6.0-revamp.md WP6, deliverable 6)
//
// Unfixtured upstream - each entry's shape is not guaranteed, so this is
// rendered defensively via GenericRecordList rather than a typed model.
// ============================================

export interface NetworkScanResponse {
	scan: Record<string, unknown>[];
}

export interface NetworkRenameResponse {
	success: boolean;
	/**
	 * Whether the name actually changed on the eero cloud. `false` means the
	 * backend's no-op guard skipped the write entirely (the requested name
	 * matched the current one) - the settings-class contract in plan § 5, the
	 * same shape as `DnsUpdateResponse.changed`. A network rename is treated
	 * as a mesh reboot (decision 5), so this flag is what lets the store
	 * avoid rebooting the network for nothing.
	 */
	changed: boolean;
	network_id: string;
	name: string;
}

// ============================================
// DNS Settings
//
// Editing DNS reboots every eero on the network (~5 minutes after the API
// responds), so this is intentionally its own dedicated slice rather than
// folded into NetworkDetail.settings.
// ============================================

export interface DnsFamilySettings {
	mode: 'custom' | 'automatic';
	servers: string[];
}

export interface DnsProvider {
	name: string;
	ipv4: string[];
	ipv6: string[];
}

export interface DnsSettings {
	ipv4: DnsFamilySettings;
	ipv6: DnsFamilySettings;
	caching: boolean;
	parent_ips: string[];
	providers: DnsProvider[];
}

export interface DnsFamilyUpdate {
	mode: 'custom' | 'automatic';
	servers: string[];
}

export interface DnsUpdateRequest {
	ipv4?: DnsFamilyUpdate;
	ipv6?: DnsFamilyUpdate;
	caching?: boolean;
}

export interface DnsUpdateResponse {
	success: boolean;
	changed: boolean;
	dns: DnsSettings;
}

/** Form field identifiers used for inline validation/error mapping. */
export type DnsFieldName = 'ipv4Primary' | 'ipv4Secondary' | 'ipv6Primary' | 'ipv6Secondary';

/**
 * Single normalised speed-test result shape returned by the backend.
 *
 * `run_speed_test` on eero-api v8 returns 202 with `data: null` - the result
 * itself is never in the POST response. Per plan decision 4, `POST
 * /networks/{id}/speedtest` now only kicks the test off (`{status:
 * 'started'}`); the result is fetched separately via
 * `GET /networks/{id}/speedtests?limit=1` and compared against the time the
 * test was started, because the history endpoint may still return a stale
 * (pre-test) entry for some seconds after the POST resolves.
 */
export interface SpeedTestResult {
	download_mbps: number | null;
	upload_mbps: number | null;
	latency_ms: number | null;
	timestamp: string | null;
}

/**
 * Response body for `POST /networks/{id}/speedtest` - starts, does not wait.
 *
 * `started_at` is the server's clock, not the browser's, and MUST be used as
 * the comparison baseline when polling `speedtests` for a fresh result -
 * comparing against `Date.now()` in the browser is skewed by clock drift and
 * by however long the POST itself took to round-trip.
 */
export interface SpeedTestStartResponse {
	status: 'started';
	started_at: string;
}

// ============================================
// Entitlements
//
// One call per network gates every premium-only card (insights, data usage)
// and every WP7/WP8 unverified/settings-class write control behind the
// `EERO_DASHBOARD_EXPERIMENTAL_WRITES` operator flag. `features`,
// `upsell_features` and `capabilities` element shape is undocumented upstream
// (eero-api v8.0.3) - treat elements defensively (see entitlements.ts).
// ============================================

export interface PremiumStatus {
	active: boolean | null;
	eero_plus: unknown;
	premium_dns: boolean | null;
}

export interface NetworkEntitlements {
	features: unknown[];
	upsell_features: unknown[];
	is_premium: boolean | null;
	premium_status: PremiumStatus | null;
	capabilities: unknown[];
	experimental_writes: boolean;
}

// ============================================
// Devices
// ============================================

export interface DeviceSummary {
	id: string | null;
	url: string | null;
	mac: string | null;
	ip: string | null;
	nickname: string | null;
	hostname: string | null;
	display_name: string | null;
	manufacturer: string | null;
	model_name: string | null;
	device_type: string | null;
	connected: boolean;
	wireless: boolean;
	blocked: boolean;
	paused: boolean;
	is_guest: boolean;
	connection_type: 'wireless' | 'wired' | null;
	signal_strength: number | null;
	frequency: '2.4GHz' | '5GHz' | '6GHz' | null;
	connected_to_eero: string | null;
	last_active: string | null;
	profile_id: string | null;
	profile_name: string | null;
}

export interface DeviceDetail {
	// Core info
	id: string | null;
	url: string | null;
	mac: string | null;
	ip: string | null;
	ips: string[];
	ipv4: string | null;

	// Identification
	nickname: string | null;
	hostname: string | null;
	display_name: string | null;
	manufacturer: string | null;
	model_name: string | null;
	device_type: string | null;

	// Connection status
	connected: boolean;
	wireless: boolean;
	connection_type: string | null;

	// Status flags
	blocked: boolean;
	paused: boolean;
	is_guest: boolean;
	is_private: boolean;

	// Connectivity details
	signal_strength: number | null;
	signal_bars: number | null;
	frequency: string | null;
	frequency_mhz: number | null;
	channel: number | null;
	ssid: string | null;
	rx_bitrate: string | null;
	tx_bitrate: string | null;

	// Connected to
	connected_to_eero: string | null;
	connected_to_eero_id: string | null;
	connected_to_eero_model: string | null;

	// Profile
	profile_id: string | null;
	profile_name: string | null;

	// Timestamps
	last_active: string | null;
	first_active: string | null;

	// Network
	network_id: string | null;
	subnet_kind: string | null;
	auth: string | null;
}

export interface DeviceAction {
	success: boolean;
	device_id: string;
	action: string;
	message: string | null;
}

// ============================================
// Eeros
// ============================================

export interface EeroSummary {
	id: string;
	url: string;
	serial: string;
	mac_address: string;
	model: string;
	status: 'green' | 'yellow' | 'red' | string;
	location: string | null;
	is_gateway: boolean;
	is_primary: boolean;
	connected_clients_count: number;
	firmware_version: string | null;
	ip_address: string | null;
	mesh_quality_bars: number | null;
	led_on: boolean | null;
	wired: boolean;
}

export interface EthernetPort {
	port_name: string | null;
	interface_number: number | null;
	has_carrier: boolean | null;
	speed: string | null;
	is_wan_port: boolean | null;
	is_lte: boolean | null;
	neighbor_location: string | null;
	neighbor_port: string | null;
}

export interface EeroDetail {
	// Basic info
	id: string;
	url: string;
	serial: string;
	mac_address: string;
	model: string;
	model_number: string | null;
	status: 'green' | 'yellow' | 'red' | string;
	state: string | null; // ONLINE, OFFLINE, etc.
	location: string | null;

	// Role
	is_gateway: boolean;
	is_primary: boolean;

	// Connection
	wired: boolean;
	connection_type: string | null;
	mesh_quality_bars: number | null;
	ip_address: string | null;
	using_wan: boolean | null;

	// Clients
	connected_clients_count: number;
	connected_wired_clients_count: number | null;
	connected_wireless_clients_count: number | null;

	// Hardware
	firmware_version: string | null;
	os_version: string | null;
	led_on: boolean | null;
	led_brightness: number | null;

	// Performance
	uptime: number | null;
	cpu_usage: number | null;
	memory_usage: number | null;
	temperature: number | null;

	// Status
	heartbeat_ok: boolean | null;
	update_available: boolean | null;
	provides_wifi: boolean | null;
	auto_provisioned: boolean | null;
	retrograde_capable: boolean | null;

	// Timestamps
	last_heartbeat: string | null;
	last_reboot: string | null;
	joined: string | null;

	// Network info
	network_name: string | null;
	network_url: string | null;

	// WiFi
	bands: string[] | null;
	wifi_bssids: string[] | null;
	bssids_with_bands: { band: string; ethernet_address: string }[] | null;

	// Ethernet
	ethernet_addresses: string[] | null;
	ethernet_ports: EthernetPort[] | null;

	// IPv6
	ipv6_addresses: { address: string; scope: string | null; interface: string | null }[] | null;

	// Organization/ISP
	organization_name: string | null;
	organization_id: number | null;

	// Power
	power_source: string | null;
	power_saving_active: boolean | null;
}

export interface EeroAction {
	success: boolean;
	eero_id: string;
	action: string;
	message: string | null;
}

/** Response for `PUT /eeros/{id}/led/brightness` - a read-back, not an echo. */
export interface EeroLedBrightnessAction extends EeroAction {
	led_brightness: number | null;
}

/**
 * An eero's client connections (phase-6.0-revamp.md WP6, deliverable 5).
 * Unfixtured upstream - rendered defensively via GenericRecordList.
 */
export interface EeroConnectionsResponse {
	connections: Record<string, unknown>[];
}

// ============================================
// Profiles
// ============================================

export interface ProfileDevice {
	id: string | null;
	url: string | null;
	mac: string | null;
	ip: string | null;
	nickname: string | null;
	hostname: string | null;
	display_name: string | null;
	manufacturer: string | null;
	connected: boolean;
	wireless: boolean;
	paused: boolean;
}

export interface ProfileSummary {
	id: string | null;
	url: string | null;
	name: string;
	paused: boolean;
	device_count: number;
	device_ids: string[];
	devices: ProfileDevice[];
}

export interface ProfileAction {
	success: boolean;
	profile_id: string;
	action: string;
	message: string | null;
}

export interface ProfileAssignDevicesResponse {
	success: boolean;
	profile_id: string;
	assigned_count: number;
	message: string | null;
}

export interface ProfileCreateRequest {
	name: string;
}

export interface ProfileRenameRequest {
	name: string;
}

// ============================================
// API Responses
// ============================================

/**
 * Discriminates the kind of failure a non-2xx response represents, mirroring
 * the SDK exception mapping in plan § 3.4. Present only for the exception
 * classes that carry a machine-readable type; a plain 500/503/etc has none.
 */
export type ApiErrorType =
	| 'premium_required'
	| 'feature_unavailable'
	| 'experimental_disabled'
	/** 409 from `POST /networks/{id}/speedtest` - a test is already running on this network. */
	| 'speedtest_in_progress'
	/** 403 from any write missing the `X-Requested-With: eero-ui` header (see client.ts). */
	| 'csrf'
	/** 403 - the account's identity (login/verify) cannot be changed right now. */
	| 'account_identity_disabled';

export interface ApiError {
	detail: string;
	type?: ApiErrorType | string;
	/** Field name for validation failures, when the API identified one. */
	field?: string;
	/** Present on a 401; `"expired"` distinguishes a dead session from never having logged in. */
	reason?: 'expired';
}

export interface ApiResponse<T> {
	data: T | null;
	error: ApiError | null;
	loading: boolean;
}

// ============================================
// Health
// ============================================

export interface HealthStatus {
	status: string;
	/** eero-ui's own version. */
	version: string;
	eero_client_version: string;
	/**
	 * Whether `EERO_DASHBOARD_EXPERIMENTAL_WRITES` is enabled on this
	 * deployment (decision 6a). Replaces `exporter_version`, which no longer
	 * exists now that the embedded exporter process is gone (§ 2.4).
	 *
	 * Not yet consumed by the UI - gating the unverified / settings-class
	 * write surfaces on this flag lands in WP7/WP8, not here.
	 */
	experimental_writes: boolean;
}

// ============================================
// Insights (phase-6.0-revamp.md § 7 WP6, deliverable 6)
//
// Shared shape across `GET /networks/{id}/insights`, `/devices/{id}/insights`
// and `/profiles/{id}/insights` (backend/app/routes/networks.py:2845-2915,
// re-exported by devices.py/profiles.py). Premium-gated - a 402 surfaces via
// `ApiClientError.type === 'premium_required'`.
// ============================================

/** Scope an insights/data-usage request is made against. */
export type InsightScope = 'network' | 'device' | 'profile';

export type InsightType = 'adblock' | 'blocked' | 'inspected';

export type InsightCadence = 'daily' | 'hourly';

export interface InsightValue {
	time: string | null;
	value: number | null;
}

export interface InsightSeries {
	insight_type: string | null;
	sum: number | null;
	values: InsightValue[];
}

export interface InsightsResponse {
	series: InsightSeries[];
}

// ============================================
// Data usage (phase-6.0-revamp.md § 7 WP6, deliverable 7)
//
// `values`/`raw` are intentionally loose - the upstream shape is undocumented
// beyond the common `download`/`upload` key spellings the backend normalizes
// (backend/app/routes/networks.py:2998-3033). Render defensively.
// ============================================

export type DataUsageCadence = 'daily' | 'hourly';

export interface DataUsageResponse {
	download_bytes: number | null;
	upload_bytes: number | null;
	values: Record<string, unknown>[];
	raw: Record<string, unknown>;
}

// ============================================
// Events + channel utilisation (phase-6.0-revamp.md § 7 WP6, deliverable 8)
// ============================================

export interface AppEventsResponse {
	events: Record<string, unknown>[];
}

export type ChannelUtilizationBand =
	'band_2_4GHz' | 'band_5GHz_low' | 'band_5GHz_high' | 'band_5GHz_full' | 'band_6GHz';

/** Raw dict, shape undocumented upstream - rendered defensively. */
export type ChannelUtilizationResponse = Record<string, unknown>;

// ============================================
// Members / permissions / invites (phase-6.0-revamp.md § 7 WP6, deliverable 10)
//
// Mirrors backend/app/routes/networks.py:3271-3392. `partial: true` on any of
// the three means the account received a 403 for that one call (fails soft,
// per the route docstrings) - render a muted note rather than an error.
// ============================================

export interface NetworkPermissions {
	permissions: Record<string, boolean>;
	role: string | null;
	partial: boolean;
}

export interface NetworkMember {
	name: string | null;
	role: string | null;
	status: string | null;
}

export interface NetworkMembersResponse {
	members: NetworkMember[];
	partial: boolean;
}

export interface NetworkInvite {
	id: string | null;
	role: string | null;
	status: string | null;
	created: string | null;
	expires: string | null;
}

export interface NetworkInvitesResponse {
	invites: NetworkInvite[];
	partial: boolean;
}

// ============================================
// Profile schedules (phase-6.0-revamp.md § 7 WP7, family 1)
//
// Mirrors backend/app/routes/profiles.py `ScheduleSummary`. Unverified,
// non-settings writes (§ 5) - create/update/delete/clear/bedtime all sit
// behind `EERO_DASHBOARD_EXPERIMENTAL_WRITES`; the list itself is a
// verified read and is never gated.
// ============================================

export interface ProfileSchedule {
	id: string | null;
	name: string | null;
	days: string[];
	start: string | null;
	end: string | null;
	enabled: boolean;
}

export interface ScheduleCreateRequest {
	name: string;
	days: string[];
	start: string;
	end: string;
	enabled?: boolean;
}

export interface ScheduleUpdateRequest {
	name?: string;
	days?: string[];
	start?: string;
	end?: string;
	enabled?: boolean;
}

export interface BedtimeCreateRequest {
	start_time: string;
	end_time: string;
	days?: string[];
}

export interface ClearSchedulesResponse {
	success: boolean;
	deleted_count: number;
}

// ============================================
// Backup internet (phase-6.0-revamp.md § 7 WP6, deliverable 11)
//
// Mirrors backend/app/routes/networks.py:3400-3507. Plus-gated; each field is
// fetched independently server-side and fails soft to `null`/`[]`.
// ============================================

export interface BackupInternetStatus {
	enabled: boolean | null;
	cellular_usage: Record<string, unknown> | null;
	cellular_events: Record<string, unknown>[] | null;
}

export interface BackupAccessPoint {
	id: string | null;
	ssid: string | null;
	uuid: string | null;
	priority: number | null;
	enabled: boolean | null;
	status: string | null;
	connectivity: unknown;
}

export interface BackupAccessPointsResponse {
	access_points: BackupAccessPoint[];
}

// ============================================
// Security / WAN (phase-6.0-revamp.md § 7 WP6, deliverable 12)
//
// Mirrors backend/app/routes/networks.py:3515-3692. Every field on
// `SecuritySettingsResponse` is fetched from its own SDK call server-side and
// fails soft to `null` independently, so a single missing source never blanks
// the whole card.
// ============================================

export interface ThreadSummary {
	enabled: boolean | null;
	name: string | null;
	channel: number | null;
	pan_id: string | null;
}

export interface SecuritySettingsResponse {
	wpa3: boolean | null;
	band_steering: boolean | null;
	upnp: boolean | null;
	ipv6: unknown;
	wpa3_per_band: Record<string, unknown> | null;
	fast_transition: Record<string, unknown> | null;
	sqm: boolean | null;
	thread: ThreadSummary | null;
	updates: Record<string, unknown> | null;
}

export interface NetworkSubnetsResponse {
	subnets: Record<string, unknown>[];
}

export interface MultiStaticIpResponse {
	configured: boolean;
	config: Record<string, unknown> | null;
}

export interface AdvancedNetworkSettings {
	dhcp: Record<string, unknown> | null;
	connection_mode: string | null;
	power_saving: unknown;
	ddns: unknown;
}

// ============================================
// Notifications (phase-6.0-revamp.md § 7 WP6, deliverable 13)
//
// Mirrors backend/app/routes/networks.py:3924-3987. Editing `settings` is
// gated behind `EERO_DASHBOARD_EXPERIMENTAL_WRITES` and lands in WP7 - this
// WP only reads.
// ============================================

export interface NetworkNotificationsResponse {
	settings: Record<string, boolean>;
	has_unread: boolean | null;
}

export interface NotificationHistoryResponse {
	history: Record<string, unknown>[];
}
