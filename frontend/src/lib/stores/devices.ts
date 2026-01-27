/**
 * Devices Store
 *
 * Manages device list, filtering, and device actions.
 */

import { writable, derived, get } from 'svelte/store';
import { api } from '$api/client';
import type { DeviceSummary } from '$api/types';

// ============================================
// Types
// ============================================

interface DevicesState {
	devices: DeviceSummary[];
	loading: boolean;
	error: string | null;
	lastUpdated: Date | null;
}

interface DeviceFilters {
	search: string;
	status: 'all' | 'connected' | 'disconnected' | 'blocked';
	connectionType: 'all' | 'wireless' | 'wired';
	frequency: 'all' | '2.4GHz' | '5GHz';
	sortBy:
		| 'name'
		| 'ip'
		| 'mac'
		| 'hostname'
		| 'manufacturer'
		| 'deviceType'
		| 'connection'
		| 'signal'
		| 'connectedTo'
		| 'profile'
		| 'last_active';
	sortOrder: 'asc' | 'desc';
}

// ============================================
// Stores
// ============================================

const initialState: DevicesState = {
	devices: [],
	loading: false,
	error: null,
	lastUpdated: null
};

const initialFilters: DeviceFilters = {
	search: '',
	status: 'all',
	connectionType: 'all',
	frequency: 'all',
	sortBy: 'name',
	sortOrder: 'asc'
};

// ============================================
// Query Parser
// ============================================

interface ParsedQuery {
	freeText: string;
	fieldFilters: Map<string, string>;
}

/**
 * Parse a search string for field-specific queries.
 * Supports: device=, ip=, mac=, manufacturer=, profile=, connection=, connected_to=, hostname=
 * Values can be quoted: device="My iPhone"
 */
function parseSearchQuery(search: string): ParsedQuery {
	const fieldFilters = new Map<string, string>();

	// Regex to match field=value or field="quoted value"
	const fieldPattern = /(\w+)=(?:"([^"]+)"|(\S+))/g;

	let freeText = search;
	let match;

	while ((match = fieldPattern.exec(search)) !== null) {
		const field = match[1].toLowerCase();
		const value = (match[2] || match[3]).toLowerCase();

		// Map common field aliases
		const fieldAliases: Record<string, string> = {
			device: 'device',
			name: 'device',
			ip: 'ip',
			ipaddress: 'ip',
			address: 'ip',
			mac: 'mac',
			manufacturer: 'manufacturer',
			vendor: 'manufacturer',
			profile: 'profile',
			connection: 'connection',
			type: 'connection',
			connected_to: 'connected_to',
			connectedto: 'connected_to',
			eero: 'connected_to',
			hostname: 'hostname',
			host: 'hostname',
			model: 'model'
		};

		const normalizedField = fieldAliases[field];
		if (normalizedField) {
			fieldFilters.set(normalizedField, value);
			// Remove this match from freeText
			freeText = freeText.replace(match[0], '').trim();
		}
	}

	// Debug: Log parsed query
	if (fieldFilters.size > 0) {
		console.log('[DeviceFilter] Parsed query:', {
			freeText,
			fieldFilters: Object.fromEntries(fieldFilters)
		});
	}

	return { freeText, fieldFilters };
}

/**
 * Check if a device matches the field filters
 */
function matchesFieldFilters(device: DeviceSummary, filters: Map<string, string>): boolean {
	for (const [field, value] of filters) {
		let fieldValue: string | null | undefined;

		switch (field) {
			case 'device':
				// Match against display_name, nickname, hostname, model
				fieldValue = [
					device.display_name,
					device.nickname,
					device.hostname,
					device.model_name,
					device.device_type
				]
					.filter(Boolean)
					.join(' ');
				break;
			case 'ip':
				fieldValue = device.ip;
				break;
			case 'mac':
				fieldValue = device.mac;
				break;
			case 'manufacturer':
				fieldValue = device.manufacturer;
				break;
			case 'profile':
				fieldValue = device.profile_name;
				break;
			case 'connection':
				fieldValue = device.connection_type;
				break;
			case 'connected_to':
				fieldValue = device.connected_to_eero;
				break;
			case 'hostname':
				fieldValue = device.hostname;
				break;
			case 'model':
				fieldValue = device.model_name;
				break;
			default:
				continue;
		}

		const matches = fieldValue && fieldValue.toLowerCase().includes(value);
		if (!matches) {
			return false;
		}
	}
	return true;
}

function createDevicesStore() {
	const { subscribe, set, update } = writable<DevicesState>(initialState);

	return {
		subscribe,

		/**
		 * Fetch all devices
		 */
		async fetch(refresh = false): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const devices = await api.devices.list({ refresh });
				update((s) => ({
					...s,
					devices,
					loading: false,
					lastUpdated: new Date()
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to fetch devices'
				}));
			}
		},

		/**
		 * Block a device (with optimistic update)
		 */
		async blockDevice(deviceId: string): Promise<boolean> {
			// Optimistic update
			update((s) => ({
				...s,
				devices: s.devices.map((d) => (d.id === deviceId ? { ...d, blocked: true } : d))
			}));

			try {
				const result = await api.devices.block(deviceId);
				if (!result.success) {
					throw new Error(result.message || 'Failed to block device');
				}
				return true;
			} catch (error) {
				// Rollback
				update((s) => ({
					...s,
					devices: s.devices.map((d) => (d.id === deviceId ? { ...d, blocked: false } : d))
				}));
				throw error;
			}
		},

		/**
		 * Unblock a device (with optimistic update)
		 */
		async unblockDevice(deviceId: string): Promise<boolean> {
			// Optimistic update
			update((s) => ({
				...s,
				devices: s.devices.map((d) => (d.id === deviceId ? { ...d, blocked: false } : d))
			}));

			try {
				const result = await api.devices.unblock(deviceId);
				if (!result.success) {
					throw new Error(result.message || 'Failed to unblock device');
				}
				return true;
			} catch (error) {
				// Rollback
				update((s) => ({
					...s,
					devices: s.devices.map((d) => (d.id === deviceId ? { ...d, blocked: true } : d))
				}));
				throw error;
			}
		},

		/**
		 * Set device nickname
		 */
		async setNickname(deviceId: string, nickname: string): Promise<boolean> {
			const currentState = get({ subscribe });
			const device = currentState.devices.find((d) => d.id === deviceId);
			const previousNickname = device?.nickname ?? null;

			// Optimistic update
			update((s) => ({
				...s,
				devices: s.devices.map((d) =>
					d.id === deviceId ? { ...d, nickname, display_name: nickname } : d
				)
			}));

			try {
				const result = await api.devices.setNickname(deviceId, nickname);
				if (!result.success) {
					throw new Error(result.message || 'Failed to set nickname');
				}
				return true;
			} catch (error) {
				// Rollback
				update((s) => ({
					...s,
					devices: s.devices.map((d) =>
						d.id === deviceId
							? { ...d, nickname: previousNickname, display_name: previousNickname || d.hostname }
							: d
					)
				}));
				throw error;
			}
		},

		/**
		 * Clear all data
		 */
		clear(): void {
			set(initialState);
		}
	};
}

export const devicesStore = createDevicesStore();
export const deviceFilters = writable<DeviceFilters>(initialFilters);

// Derived: filtered and sorted devices
export const filteredDevices = derived([devicesStore, deviceFilters], ([$devices, $filters]) => {
	let result = [...$devices.devices];

	// Parse the search query for field-specific filters
	if ($filters.search) {
		const { freeText, fieldFilters } = parseSearchQuery($filters.search);

		// Apply field-specific filters
		if (fieldFilters.size > 0) {
			const beforeCount = result.length;
			result = result.filter((d) => matchesFieldFilters(d, fieldFilters));
			console.log(`[DeviceFilter] Field filter: ${beforeCount} → ${result.length} devices`);
		}

		// Apply free text search (case-insensitive across all text fields)
		if (freeText) {
			const search = freeText.toLowerCase();
			result = result.filter(
				(d) =>
					d.display_name?.toLowerCase().includes(search) ||
					d.nickname?.toLowerCase().includes(search) ||
					d.hostname?.toLowerCase().includes(search) ||
					d.ip?.toLowerCase().includes(search) ||
					d.mac?.toLowerCase().includes(search) ||
					d.manufacturer?.toLowerCase().includes(search) ||
					d.model_name?.toLowerCase().includes(search) ||
					d.device_type?.toLowerCase().includes(search) ||
					d.profile_name?.toLowerCase().includes(search) ||
					d.connected_to_eero?.toLowerCase().includes(search)
			);
		}
	}

	// Filter by status
	if ($filters.status !== 'all') {
		result = result.filter((d) => {
			switch ($filters.status) {
				case 'connected':
					return d.connected && !d.blocked;
				case 'disconnected':
					return !d.connected && !d.blocked;
				case 'blocked':
					return d.blocked;
				default:
					return true;
			}
		});
	}

	// Filter by connection type
	if ($filters.connectionType !== 'all') {
		result = result.filter((d) => d.connection_type === $filters.connectionType);
	}

	// Filter by frequency
	if ($filters.frequency !== 'all') {
		result = result.filter((d) => d.frequency === $filters.frequency);
	}

	// Sort
	result.sort((a, b) => {
		let comparison = 0;

		switch ($filters.sortBy) {
			case 'name':
				comparison = (a.display_name || '').localeCompare(b.display_name || '');
				break;
			case 'ip':
				// Sort IP addresses numerically
				const ipA =
					a.ip
						?.split('.')
						.map((n) => parseInt(n, 10).toString().padStart(3, '0'))
						.join('.') || '';
				const ipB =
					b.ip
						?.split('.')
						.map((n) => parseInt(n, 10).toString().padStart(3, '0'))
						.join('.') || '';
				comparison = ipA.localeCompare(ipB);
				break;
			case 'mac':
				comparison = (a.mac || '').localeCompare(b.mac || '');
				break;
			case 'hostname':
				comparison = (a.hostname || '').localeCompare(b.hostname || '');
				break;
			case 'manufacturer':
				comparison = (a.manufacturer || '').localeCompare(b.manufacturer || '');
				break;
			case 'deviceType':
				comparison = (a.device_type || '').localeCompare(b.device_type || '');
				break;
			case 'connection':
				comparison = (a.connection_type || '').localeCompare(b.connection_type || '');
				break;
			case 'signal':
				comparison = (b.signal_strength || -100) - (a.signal_strength || -100);
				break;
			case 'connectedTo':
				comparison = (a.connected_to_eero || '').localeCompare(b.connected_to_eero || '');
				break;
			case 'profile':
				comparison = (a.profile_name || '').localeCompare(b.profile_name || '');
				break;
			case 'last_active':
				comparison = (a.last_active || '').localeCompare(b.last_active || '');
				break;
		}

		return $filters.sortOrder === 'desc' ? -comparison : comparison;
	});

	return result;
});

// Derived: device counts
export const deviceCounts = derived(devicesStore, ($devices) => {
	const devices = $devices.devices;
	return {
		total: devices.length,
		connected: devices.filter((d) => d.connected && !d.blocked).length,
		disconnected: devices.filter((d) => !d.connected && !d.blocked).length,
		blocked: devices.filter((d) => d.blocked).length,
		wireless: devices.filter((d) => d.wireless && d.connected).length,
		wired: devices.filter((d) => !d.wireless && d.connected).length,
		freq24: devices.filter((d) => d.frequency === '2.4GHz' && d.connected).length,
		freq5: devices.filter((d) => d.frequency === '5GHz' && d.connected).length
	};
});

// Derived: loading state
export const isDevicesLoading = derived(devicesStore, ($devices) => $devices.loading);

// ============================================
// Column Visibility Store
// ============================================

export interface ColumnVisibility {
	name: boolean;
	ip: boolean;
	mac: boolean;
	hostname: boolean;
	manufacturer: boolean;
	deviceType: boolean;
	connection: boolean;
	signal: boolean;
	frequency: boolean;
	connectedTo: boolean;
	profile: boolean;
	lastActive: boolean;
	status: boolean;
}

const defaultColumnVisibility: ColumnVisibility = {
	name: true,
	ip: true,
	mac: true,
	hostname: false,
	manufacturer: false,
	deviceType: false,
	connection: true,
	signal: false,
	frequency: false,
	connectedTo: true,
	profile: false,
	lastActive: false,
	status: true
};

// ============================================
// Selection Mode Store
// ============================================

export const selectionMode = writable<boolean>(false);
export const selectedDevices = writable<Set<string>>(new Set());

export function toggleSelectionMode(): void {
	selectionMode.update((mode) => {
		if (mode) {
			// Exiting selection mode - clear selections
			selectedDevices.set(new Set());
		}
		return !mode;
	});
}

export function toggleDeviceSelection(deviceId: string): void {
	selectedDevices.update((selected) => {
		const newSelected = new Set(selected);
		if (newSelected.has(deviceId)) {
			newSelected.delete(deviceId);
		} else {
			newSelected.add(deviceId);
		}
		return newSelected;
	});
}

export function selectAllDevices(deviceIds: string[]): void {
	selectedDevices.set(new Set(deviceIds));
}

export function clearSelection(): void {
	selectedDevices.set(new Set());
}

export const columnVisibility = writable<ColumnVisibility>(defaultColumnVisibility);

export function toggleColumn(columnId: keyof ColumnVisibility): void {
	columnVisibility.update((cv) => ({
		...cv,
		[columnId]: !cv[columnId]
	}));
}
