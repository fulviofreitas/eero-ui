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
	status: 'online' | 'offline' | 'updating' | 'unknown';
	guest_network_enabled: boolean;
	public_ip: string | null;
	isp_name: string | null;
}

export interface NetworkDetail extends NetworkSummary {
	device_count: number;
	eero_count: number;
	speed_test: SpeedTestResult | Record<string, unknown> | null;
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

export interface SpeedTestResult {
	// Normalized format from backend
	download_mbps?: number | null;
	upload_mbps?: number | null;
	latency_ms?: number | null;
	timestamp?: string | null;
	// Raw format from eero API
	download?: { value: number; units?: string } | null;
	upload?: { value: number; units?: string } | null;
	latency?: number | null;
	date?: string | null;
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
	frequency: '2.4GHz' | '5GHz' | null;
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
	state: string | null;  // ONLINE, OFFLINE, etc.
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

// ============================================
// Profiles
// ============================================

export interface ProfileDevice {
	id: string | null;
	url: string | null;
	mac: string | null;
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

// ============================================
// API Responses
// ============================================

export interface ApiError {
	detail: string;
	type?: string;
}

export interface ApiResponse<T> {
	data: T | null;
	error: ApiError | null;
	loading: boolean;
}
