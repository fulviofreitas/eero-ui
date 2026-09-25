/**
 * Devices Store
 *
 * Manages device list, filtering, and device actions.
 */

import { writable, derived, get } from 'svelte/store';
import { api, ApiClientError } from '$api/client';
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
	frequency: 'all' | '2.4GHz' | '5GHz' | '6GHz';
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

/** Default filter state, exported for callers (DeviceList's URL/localStorage fallback chain) that need it without importing the whole store. */
export const defaultDeviceFilters: DeviceFilters = initialFilters;
export type { DeviceFilters };

/**
 * URL-encoded filters (WP9 § 6.2 Tier 3 "URL-encoded, debounced, persisted filters").
 *
 * Query keys are short and stable (`q`/`status`/`conn`/`band`/`sort`/`dir`) rather than mirroring
 * the store's own field names 1:1, so the URL stays a shareable/bookmarkable link rather than an
 * internal implementation detail leaking into it.
 */
export const DEVICE_FILTERS_STORAGE_KEY = 'eero-ui:device-filters';
const DEVICE_FILTER_QUERY_KEYS = ['q', 'status', 'conn', 'band', 'sort', 'dir'] as const;

const VALID_STATUS = new Set<DeviceFilters['status']>([
	'all',
	'connected',
	'disconnected',
	'blocked'
]);
const VALID_CONNECTION = new Set<DeviceFilters['connectionType']>(['all', 'wireless', 'wired']);
const VALID_FREQUENCY = new Set<DeviceFilters['frequency']>(['all', '2.4GHz', '5GHz', '6GHz']);
const VALID_SORT_BY = new Set<DeviceFilters['sortBy']>([
	'name',
	'ip',
	'mac',
	'hostname',
	'manufacturer',
	'deviceType',
	'connection',
	'signal',
	'connectedTo',
	'profile',
	'last_active'
]);
const VALID_SORT_ORDER = new Set<DeviceFilters['sortOrder']>(['asc', 'desc']);

/** True when the URL carries any of the device-filter query keys - used to decide whether the URL or localStorage wins on initial load. */
export function hasDeviceFilterParams(params: URLSearchParams): boolean {
	return DEVICE_FILTER_QUERY_KEYS.some((key) => params.has(key));
}

/** Serialize filters to URL query params, omitting anything at its default value so a "clean" filter state produces a clean URL. */
export function deviceFiltersToSearchParams(filters: DeviceFilters): URLSearchParams {
	const params = new URLSearchParams();
	if (filters.search) params.set('q', filters.search);
	if (filters.status !== initialFilters.status) params.set('status', filters.status);
	if (filters.connectionType !== initialFilters.connectionType) {
		params.set('conn', filters.connectionType);
	}
	if (filters.frequency !== initialFilters.frequency) params.set('band', filters.frequency);
	if (filters.sortBy !== initialFilters.sortBy) params.set('sort', filters.sortBy);
	if (filters.sortOrder !== initialFilters.sortOrder) params.set('dir', filters.sortOrder);
	return params;
}

/** Parse filters from URL query params, falling back to defaults for anything missing or invalid. */
export function deviceFiltersFromSearchParams(params: URLSearchParams): DeviceFilters {
	const status = params.get('status');
	const conn = params.get('conn');
	const band = params.get('band');
	const sort = params.get('sort');
	const dir = params.get('dir');
	return {
		search: params.get('q') ?? initialFilters.search,
		status: VALID_STATUS.has(status as DeviceFilters['status'])
			? (status as DeviceFilters['status'])
			: initialFilters.status,
		connectionType: VALID_CONNECTION.has(conn as DeviceFilters['connectionType'])
			? (conn as DeviceFilters['connectionType'])
			: initialFilters.connectionType,
		frequency: VALID_FREQUENCY.has(band as DeviceFilters['frequency'])
			? (band as DeviceFilters['frequency'])
			: initialFilters.frequency,
		sortBy: VALID_SORT_BY.has(sort as DeviceFilters['sortBy'])
			? (sort as DeviceFilters['sortBy'])
			: initialFilters.sortBy,
		sortOrder: VALID_SORT_ORDER.has(dir as DeviceFilters['sortOrder'])
			? (dir as DeviceFilters['sortOrder'])
			: initialFilters.sortOrder
	};
}

/** Parse filters persisted to localStorage, tolerating missing/malformed JSON (private-mode quota, older shape, etc). */
export function deviceFiltersFromStorage(raw: string | null): DeviceFilters {
	if (!raw) return { ...initialFilters };
	try {
		const parsed = JSON.parse(raw) as Partial<DeviceFilters>;
		return { ...initialFilters, ...parsed };
	} catch {
		return { ...initialFilters };
	}
}

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
		 * Block a device.
		 *
		 * Unverified (plan § 5): `block_device` resolves a MAC server-side and
		 * posts to the blacklist, but is not on the SDK's verified-write
		 * allowlist, and can 422 when the device has no known MAC to block
		 * by. This is therefore PESSIMISTIC - unlike `unblockDevice` and
		 * `setNickname` below (both Verified), `blocked` is only flipped once
		 * the API confirms it. The caller is responsible for a ConfirmDialog
		 * stating the action is not verified end-to-end before calling this.
		 */
		async blockDevice(deviceId: string): Promise<boolean> {
			try {
				const result = await api.devices.block(deviceId);
				if (!result.success) {
					throw new Error(result.message || 'Failed to block device');
				}
				update((s) => ({
					...s,
					devices: s.devices.map((d) => (d.id === deviceId ? { ...d, blocked: true } : d))
				}));
				return true;
			} catch (error) {
				if (error instanceof ApiClientError && error.status === 422) {
					throw new Error(error.detail || 'Device has no known MAC address.', { cause: error });
				}
				throw error;
			}
		},

		/**
		 * Unblock a device (with optimistic update). Verified (plan § 5).
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
		 * Bulk block (WP9 § 6.2 Tier 3 "bulk block/unblock"). Runs sequentially, one
		 * `blockDevice` per id, so each device's own pessimistic/unverified/422-on-no-MAC
		 * behaviour is unchanged - this only aggregates the per-device outcomes rather than
		 * introducing a new bulk-specific code path.
		 */
		async blockMany(
			deviceIds: string[]
		): Promise<{ ok: string[]; failed: { id: string; message: string }[] }> {
			const ok: string[] = [];
			const failed: { id: string; message: string }[] = [];
			for (const id of deviceIds) {
				try {
					await this.blockDevice(id);
					ok.push(id);
				} catch (error) {
					failed.push({
						id,
						message: error instanceof Error ? error.message : 'Failed to block device'
					});
				}
			}
			return { ok, failed };
		},

		/** Bulk unblock - same sequential aggregation as blockMany, over the Verified `unblockDevice`. */
		async unblockMany(
			deviceIds: string[]
		): Promise<{ ok: string[]; failed: { id: string; message: string }[] }> {
			const ok: string[] = [];
			const failed: { id: string; message: string }[] = [];
			for (const id of deviceIds) {
				try {
					await this.unblockDevice(id);
					ok.push(id);
				} catch (error) {
					failed.push({
						id,
						message: error instanceof Error ? error.message : 'Failed to unblock device'
					});
				}
			}
			return { ok, failed };
		},

		/**
		 * Assign one or more devices to a profile (with optimistic update)
		 */
		async assignToProfile(
			deviceIds: string[],
			profileId: string,
			profileName: string
		): Promise<boolean> {
			const previousState = get({ subscribe });

			// Optimistic update — apply new profile to all targeted devices
			update((s) => ({
				...s,
				devices: s.devices.map((d) =>
					d.id && deviceIds.includes(d.id)
						? { ...d, profile_id: profileId, profile_name: profileName }
						: d
				)
			}));

			try {
				const result = await api.profiles.assignDevices(profileId, deviceIds);
				if (!result.success) {
					throw new Error(result.message || 'Failed to assign devices to profile');
				}
				return true;
			} catch (error) {
				// Rollback all affected devices to their previous state
				update((s) => ({
					...s,
					devices: s.devices.map((d) => {
						if (!d.id || !deviceIds.includes(d.id)) return d;
						const prev = previousState.devices.find((p) => p.id === d.id);
						return prev ?? d;
					})
				}));
				throw error;
			}
		},

		/**
		 * Set device nickname (with optimistic update). Verified (plan § 5).
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
		 * Set a device's type (with optimistic update). Verified (plan § 5,
		 * phase-6.0-revamp.md § 7 WP6 deliverable 4).
		 */
		async setDeviceType(deviceId: string, deviceType: string): Promise<boolean> {
			const currentState = get({ subscribe });
			const device = currentState.devices.find((d) => d.id === deviceId);
			const previousType = device?.device_type ?? null;

			// Optimistic update
			update((s) => ({
				...s,
				devices: s.devices.map((d) => (d.id === deviceId ? { ...d, device_type: deviceType } : d))
			}));

			try {
				const result = await api.devices.setType(deviceId, deviceType);
				if (!result.success) {
					throw new Error(result.message || 'Failed to set device type');
				}
				return true;
			} catch (error) {
				// Rollback
				update((s) => ({
					...s,
					devices: s.devices.map((d) =>
						d.id === deviceId ? { ...d, device_type: previousType } : d
					)
				}));
				throw error;
			}
		},

		/**
		 * Deny/allow a single device's secondary-WAN access
		 * (phase-6.0-revamp.md § 5, § 7 WP8, family 10). Settings-class by
		 * its own SDK docstring - treated as a mesh reboot, so this is
		 * PESSIMISTIC (no optimistic flip): `deny` only changes once the API
		 * confirms it. No dedicated getter exists on `DeviceSummary`/
		 * `DeviceDetail`, so this does not touch the devices list - the
		 * caller (the device detail page) owns its own local state.
		 */
		async setSecondaryWanAccess(deviceId: string, deny: boolean): Promise<boolean> {
			const result = await api.devices.setSecondaryWanAccess(deviceId, deny);
			if (!result.success) {
				throw new Error('Failed to update secondary WAN access');
			}
			return result.changed;
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
			result = result.filter((d) => matchesFieldFilters(d, fieldFilters));
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
		freq5: devices.filter((d) => d.frequency === '5GHz' && d.connected).length,
		freq6: devices.filter((d) => d.frequency === '6GHz' && d.connected).length
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
